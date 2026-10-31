// Scene: one base plate per view + same-photo variants + code lighting (dark / red / tv glow) + grain/vignette + HTML labels.
import RECTS from "./views.json";
import { S, log, type ViewId } from "./state.ts";
import { T } from "./tuning.ts";
import { refreshSpatial } from "./audio.ts";

type Rect = [number, number, number, number];
export const rect = (v: string, k: string): Rect => ((RECTS as unknown as Record<string, Record<string, Rect>>)[v]?.[k] ?? [45, 45, 10, 10]);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface Hotspot { id: string; label: () => string; rect: Rect; show?: () => boolean; lure?: () => boolean }
export interface Nav { key: "left" | "right" | "up" | "down"; to: ViewId; label: string }

export const NAV: Record<string, Nav[]> = {
  door: [{ key: "down", to: "living", label: "ห้องนั่งเล่น" }],
  peep: [{ key: "down", to: "door", label: "ถอยออก" }],
  living: [{ key: "left", to: "bedroom", label: "ห้องนอน" }, { key: "right", to: "kitchen", label: "ครัว" }, { key: "up", to: "door", label: "ประตูหน้า" }],
  bedroom: [{ key: "right", to: "living", label: "ห้องนั่งเล่น" }],
  kitchen: [{ key: "left", to: "living", label: "ห้องนั่งเล่น" }, { key: "right", to: "bath", label: "ห้องน้ำ" }],
  bath: [{ key: "left", to: "kitchen", label: "ครัว" }],
  exterior: [],
};
const ARROW = { left: "←", right: "→", up: "↑", down: "↓" };

const lightLabel = () => (S.light[S.view] ? "ปิดไฟ" : "เปิดไฟ");
export const HOTSPOTS: Record<string, Hotspot[]> = {
  door: [
    { id: "peephole", label: () => "ส่องตาแมว", rect: rect("door", "peephole") },
    { id: "door_open", label: () => "เปิดประตู", rect: rect("door", "door_open") },
    { id: "chain_lock", label: () => "คล้องโซ่", rect: rect("door", "chain"), show: () => S.flags.keyLock },
  ],
  living: [
    { id: "tv_off", label: () => "ปิดทีวี", rect: rect("living", "tv_off"), show: () => S.tvOn },
    { id: "light", label: lightLabel, rect: rect("living", "light") },
  ],
  bedroom: [
    { id: "light", label: lightLabel, rect: rect("bedroom", "light") },
    { id: "curtain_open", label: () => "เปิดม่าน", rect: rect("bedroom", "curtain_open") },
    { id: "knock_back", label: () => "เคาะตอบ", rect: rect("bedroom", "wall"), show: () => S.flags.wallKnock },
  ],
  kitchen: [{ id: "breaker", label: () => "ยกเบรกเกอร์", rect: rect("kitchen", "breaker"), show: () => S.flags.blackout }, { id: "light", label: lightLabel, rect: rect("kitchen", "light") }],
  bath: [
    { id: "tap_off", label: () => "ปิดก๊อก", rect: rect("bath", "tap"), show: () => S.flags.overflow },
    { id: "mirror_look", label: () => "มองกระจก", rect: rect("bath", "mirror_look") },
    { id: "light", label: lightLabel, rect: rect("bath", "light") },
  ],
  peep: [], exterior: [],
};
// event code can hide a hotspot for a while or make it pulse (lure)
export const hidden = new Set<string>();
export const lures = new Set<string>();

let focus = 0;
let onAct: (id: string) => void = () => {};
let onGo: (v: ViewId) => void = () => {};
export function bindInput(act: (id: string) => void, go: (v: ViewId) => void) { onAct = act; onGo = go; }

export function visibleHotspots() {
  return (HOTSPOTS[S.view] ?? []).filter((h) => (!h.show || h.show()) && !hidden.has(`${S.view}:${h.id}`));
}

// ---------- stage layout ----------
export function fit() {
  const st = $("stage");
  const w = window.innerWidth, h = window.innerHeight;
  const sw = Math.min(w, (h * 16) / 9), sh = (sw * 9) / 16;
  st.style.width = `${sw}px`; st.style.height = `${sh}px`;
  st.style.left = `${(w - sw) / 2}px`; st.style.top = `${(h - sh) / 2}px`;
  document.documentElement.style.setProperty("--u", `${sw / 100}px`);
}

const missing = new Set<string>();
export function img(el: HTMLImageElement, url: string) {
  if (el.dataset.src === url) return;
  el.dataset.src = url;
  el.classList.remove("missing");
  el.onerror = () => { missing.add(url); el.classList.add("missing"); };
  el.src = url;
}
export const viewUrl = (v: string, state = "base") => `views/${v}/${state}.webp`;

// variant layers: name -> element
const layers = new Map<string, HTMLImageElement>();
/** show a same-photo variant (or overlay png) over the base of `view`. ms>0 = auto hide */
export function variant(view: string, name: string, on: boolean, ms = 0, fade = 0.25) {
  const key = `${view}/${name}`;
  let el = layers.get(key);
  if (!el) {
    el = document.createElement("img"); el.className = "layer"; el.dataset.view = view;
    img(el, name.endsWith(".png") ? `views/${view}/${name}` : viewUrl(view, name));
    $("layers").appendChild(el); layers.set(key, el);
  }
  el.style.transition = `opacity ${fade}s`;
  el.classList.toggle("on", on);
  if (on && ms > 0) setTimeout(() => el!.classList.remove("on"), ms);
}
export function clearVariants(view?: string) { for (const [k, el] of layers) if (!view || k.startsWith(view + "/")) el.classList.remove("on"); }

export function render() {
  const v = S.view;
  img($("base") as HTMLImageElement, viewUrl(v));
  for (const el of layers.values()) el.style.display = el.dataset.view === v ? "" : "none";
  const st = $("stage");
  st.dataset.view = v;
  st.classList.toggle("dark", S.light[v] === false && v !== "peep" && v !== "exterior");
  st.classList.toggle("tvon", S.tvOn && v === "living");
  // tv rect
  const tv = $("tv");
  const r = rect("living", "tv");
  Object.assign(tv.style, { left: r[0] + "%", top: r[1] + "%", width: r[2] + "%", height: r[3] + "%" });
  tv.hidden = !(v === "living" && S.tvOn);
  const tr = document.getElementById("tvreflect")!;
  Object.assign(tr.style, { left: r[0] + "%", top: r[1] + "%", width: r[2] + "%", height: r[3] + "%" });
  applyChanges();
  drawLabels();
}

// persistent house changes (bible §6) shown with the photo variants / code effects
const CHANGE_VIEW: Record<string, [string, string]> = {
  living_chair: ["living", "living_chair"], kitchen_chair: ["kitchen", "kitchen_chair"], door_ajar: ["door", "door_ajar"],
};
function applyChanges() {
  for (const [c, [view, name]] of Object.entries(CHANGE_VIEW)) if (S.changes.has(c) && view === S.view) variant(view, name, true, 0, 0);
  const st = $("stage");
  st.classList.toggle("garland-wilt", S.changes.has("garland_wilt") || S.haunt >= 2);
  st.classList.toggle("slippers-turned", S.changes.has("slippers_turned"));
  st.dataset.yantra = String(Math.min(2, S.haunt));
  // once the house remembers you (haunt >= 1) your name is on the bathroom mirror steam (bible §0.9)
  const mn = document.getElementById("mirrorname")!;
  mn.textContent = S.name; mn.hidden = !(S.view === "bath" && S.haunt >= 1 && S.night);
  // code-made change patches (clone of base region, transformed)
  for (const [cls, v, k] of [["garland", "door", "garland"], ["slippers", "bedroom", "slippers"], ["yantra", "bedroom", "yantra"]] as const) {
    const el = document.querySelector<HTMLElement>(`#fxpatch .${cls}`)!;
    const r = rect(v, k);
    el.hidden = S.view !== v;
    Object.assign(el.style, { left: r[0] + "%", top: r[1] + "%", width: r[2] + "%", height: r[3] + "%",
      backgroundImage: `url(${viewUrl(v)})`, backgroundSize: `${10000 / r[2]}% ${10000 / r[3]}%`,
      backgroundPosition: `${(r[0] / (100 - r[2])) * 100}% ${(r[1] / (100 - r[3])) * 100}%` });
  }
}

export function drawLabels() {
  const box = $("hot"); box.innerHTML = "";
  const hs = visibleHotspots();
  if (focus >= hs.length) focus = 0;
  hs.forEach((h, i) => {
    const b = document.createElement("button");
    b.className = "hs" + (i === focus ? " focus" : "") + (lures.has(`${S.view}:${h.id}`) ? " lure" : "");
    b.innerHTML = `<kbd>E</kbd><span>${h.label()}</span>`;
    b.style.left = h.rect[0] + h.rect[2] / 2 + "%"; b.style.top = h.rect[1] + h.rect[3] / 2 + "%";
    b.onmouseenter = () => { focus = i; drawFocus(); };
    b.onclick = (e) => { e.stopPropagation(); focus = i; onAct(h.id); };
    box.appendChild(b);
  });
  const nav = $("nav"); nav.innerHTML = "";
  if (!S.night && S.view !== "peep") return;
  for (const n of NAV[S.view] ?? []) {
    const b = document.createElement("button");
    b.className = `nv ${n.key}`;
    b.innerHTML = `<kbd>${ARROW[n.key]}</kbd><span>${n.label}</span>`;
    b.onclick = (e) => { e.stopPropagation(); onGo(n.to); };
    nav.appendChild(b);
  }
}
function drawFocus() { document.querySelectorAll("#hot .hs").forEach((b, i) => b.classList.toggle("focus", i === focus)); }
export function cycleFocus() { const n = visibleHotspots().length; if (n) { focus = (focus + 1) % n; drawFocus(); } }
export function focused() { return visibleHotspots()[focus]?.id; }
export function navFor(key: Nav["key"]) { return (NAV[S.view] ?? []).find((n) => n.key === key); }

export function setView(v: ViewId) {
  const prev = S.view;
  if (prev === v) return;
  S.view = v; focus = 0;
  const st = $("stage"); st.classList.add("cut");
  setTimeout(() => st.classList.remove("cut"), 120);
  log("view", v, { from: prev });
  render();
  refreshSpatial();
}

// ---------- effects ----------
export function flashScare(src = "fx/jumpscare.webp", ms = T.SCARE_MS) {
  const f = $("flash") as HTMLDivElement; const im = f.querySelector("img")!;
  img(im, src);
  f.hidden = false; $("stage").classList.add("shake");
  try { navigator.vibrate?.([80, 40, 200]); } catch { /* not supported */ }
  setTimeout(() => { f.hidden = true; $("stage").classList.remove("shake"); }, ms);
}
export function blackout(ms: number) {
  const b = $("black"); b.classList.add("on"); setTimeout(() => b.classList.remove("on"), ms);
}
export function stageClass(cls: string, on: boolean) { $("stage").classList.toggle(cls, on); }

// ---------- grain ----------
export function startGrain() {
  const c = $("grain") as HTMLCanvasElement; const g = c.getContext("2d")!;
  c.width = 320; c.height = 180;
  const id = g.createImageData(320, 180);
  let k = 0;
  const loop = () => {
    if (k++ % 2 === 0) {
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) { const n = (Math.random() * 255) | 0; d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255; }
      g.putImageData(id, 0, 0);
    }
    requestAnimationFrame(loop);
  };
  loop();
  // kitchen neon flicker / bulb breathing
  setInterval(() => {
    const st = $("stage");
    if (S.view === "kitchen" && S.light.kitchen && Math.random() < 0.18) { st.classList.add("flick"); setTimeout(() => st.classList.remove("flick"), 60 + Math.random() * 120); }
  }, 400);
}
