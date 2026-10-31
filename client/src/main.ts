import "./fonts.css";
import "./style.css";
import { S, LOG, log, advance, after, fmtMin, minAt, simForMin, ROOMS, type ViewId } from "./state.ts";
import { T } from "./tuning.ts";
import { play, stop, unlock, setMuted, ambient, preload, setGain } from "./audio.ts";
import { fit, render, setView, bindInput, cycleFocus, focused, navFor, startGrain, variant, stageClass, rect, drawLabels } from "./view.ts";
import { initDirector, PLAN, setDroneHook } from "./director.ts";
import { drone } from "./audio.ts";
import { startEvent, canStart, hookAct, hookView, hookLight, tickEvents, seedEvents, scheduleChanges, onEnding, active, violate } from "./events.ts";
import { bindPhone, togglePhone, phoneOpen, phoneRinging, phoneTick, phoneArmed } from "./phone.ts";
import { runIntro } from "./intro.ts";
import { endingGood, endingBad, nightOver } from "./endings.ts";
import { params, debugPanel, exposeApi } from "./debug.ts";
import { ALL_IDS, isReal } from "./rules.ts";

const P = params();
S.seed = P.seed ?? Math.floor(Math.random() * 100000);
S.seedFromUrl = P.seed !== null;
S.speed = P.speed;
S.debug = P.debug;
if (P.mute) setMuted(true);
if (P.haunt !== null) S.haunt = Math.max(0, Math.min(3, P.haunt));
if (P.outcome && ["minor", "scare", "death"].includes(P.outcome)) S.forcedOutcome = P.outcome;

const VIEWS: ViewId[] = ["exterior", "door", "peep", "living", "bedroom", "kitchen", "bath"];
const HOT_IDS = ["door_open", "peephole", "tv_off", "curtain_open", "light", "mirror_look", "phone_view", "phone_answer", "phone_decline", "chain_lock", "breaker", "tap_off", "knock_back"];

// ---------------- actions ----------------
function act(hid: string) {
  if (!S.night || S.ended || !S.alive) { log("act", hid, "ignored (not in the night)"); return false; }
  if (!HOT_IDS.includes(hid)) { log("act", hid, "unknown hotspot"); return false; }
  if (hid === "phone_view") { togglePhone(); return true; }
  if ((hid === "phone_answer" || hid === "phone_decline") && !phoneRinging()) { log("act", hid, "nothing ringing"); return false; }
  if (hid === "phone_answer" && !phoneArmed()) { log("act", hid, "not yet"); return false; }
  // room-bound hotspots must exist in this view
  const roomBound: Record<string, string[]> = { door_open: ["door"], peephole: ["door"], tv_off: ["living"], curtain_open: ["bedroom"], mirror_look: ["bath"], light: ["living", "bedroom", "kitchen", "bath"], chain_lock: ["door"], breaker: ["kitchen"], tap_off: ["bath"], knock_back: ["bedroom"] };
  if (roomBound[hid] && !roomBound[hid].includes(S.view)) { log("act", hid, `not here (${S.view})`); return false; }
  log("act", hid, { view: S.view });
  if (hookAct(hid)) { drawLabels(); return true; }
  if (["chain_lock", "breaker", "tap_off", "knock_back"].includes(hid)) { log("act", hid, "nothing to do now"); return false; }
  switch (hid) {
    case "light": {
      const on = !S.light[S.view]; S.light[S.view] = on;
      play("light_switch", S.view);
      if (S.view === "kitchen") on ? play("amb_neon", "kitchen", { loop: true, amb: true, tag: "amb_neon", gain: 0.4 }) : stop("amb_neon");
      log("env_change", `light_${S.view}`, on ? "on" : "off");
      hookLight(S.view, on);
      break;
    }
    case "tv_off": if (S.tvOn) { S.tvOn = false; play("tv_click", "living"); stop("tvstatic"); } break;
    case "door_open": play("door_open", "door"); variant("door", "door_ajar", true, 1600); log("info", "door_open", "empty porch, nothing"); break;
    case "peephole": go("peep"); return true;
    case "curtain_open": stageClass("moon", true); setTimeout(() => stageClass("moon", false), 1800); break;
    case "mirror_look": stageClass("mirrorzoom", true); setTimeout(() => stageClass("mirrorzoom", false), 1400); break;
  }
  render();
  return true;
}
function go(v: string) {
  if (!VIEWS.includes(v as ViewId)) { log("act", "go", `bad view ${v}`); return false; }
  if (phoneOpen()) togglePhone(false);
  if (S.night && v !== "peep" && S.view !== "peep") play("footsteps_tile", "self", { gain: 0.18 });
  S.lastMoveSim = S.sim;
  setView(v as ViewId);
  hookView(v);
  return true;
}
function trigger(id: string) {
  if (!ALL_IDS.includes(id as never)) { log("todo", id, "unknown event id"); return false; }
  if (!S.night) { after(0.5, () => trigger(id)); return true; }
  if (isReal(id) && active) { after(1, () => trigger(id)); return true; }
  return startEvent(id, true);
}

// ---------------- night ----------------
function parseHM(s: string | null) { if (!s) return 0; const m = /^(\d{1,2}):(\d{2})$/.exec(s); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; }
function startNight() {
  S.startMin = Math.min(T.NIGHT_END_MIN - 1, parseHM(P.start)); S.sim = 0; S.gameMin = minAt(0);
  S.night = true;
  const v0 = (P.view && VIEWS.includes(P.view as ViewId) ? P.view : "bedroom") as ViewId;
  S.view = v0;
  log("info", "night_start", { seed: S.seed, name: S.name, read2: S.read2, start: fmtMin(S.startMin), speed: S.speed });
  // ambience: never fully silent (bible §0.6)
  play("amb_night", "outside", { loop: true, amb: true, tag: "amb_night", gain: 0.7 });
  play("amb_room", "self", { loop: true, amb: true, tag: "amb_room", gain: 0.35 });
  play("amb_fan", "living", { loop: true, amb: true, tag: "amb_fan", gain: 0.7 });
  play("amb_fridge", "kitchen", { loop: true, amb: true, tag: "amb_fridge", gain: 0.55 });
  if (S.light.kitchen) play("amb_neon", "kitchen", { loop: true, amb: true, tag: "amb_neon", gain: 0.4 });
  play("amb_rain_drip", "outside", { loop: true, amb: true, tag: "amb_rain", gain: 0.35 });
  const drip = () => { play("drip", "bath", { gain: 0.25 + Math.random() * 0.35, rate: 0.85 + Math.random() * 0.3 }); after(6 + Math.random() * 12, drip, "drip"); };
  after(3, drip, "drip");
  // the neighbourhood: a far door now and then (never a rule sound, never logged as an event)
  const far = () => { if (!active) play("door_slam_far", "outside", { gain: 0.22 }); after(28 + Math.random() * 30, far, "far"); };
  after(20, far, "far");
  seedEvents(S.seed);
  setDroneHook((l) => drone(l, 4));
  initDirector(S.seed, (id, forced) => startEvent(id, forced), canStart);
  scheduleChanges();
  // 04:45-04:57: the house empties out layer by layer, the fan stays (bible §3)
  const q = (min: number, fn: () => void) => { const s = (min - S.startMin) * T.SEC_PER_GAME_MIN; if (s >= 0) after(s, fn, "quiet"); };
  // a low dread bed (Mixkit horror ambience) creeps in after 01:30 and thickens after 03:00; gone for the quiet stretch
  q(90, () => play("amb_dread", "self", { loop: true, amb: true, tag: "amb_dread", gain: 0.12 }));
  q(180, () => setGain("amb_dread", 0.24));
  if (S.startMin > 90 && S.startMin < 285) play("amb_dread", "self", { loop: true, amb: true, tag: "amb_dread", gain: S.startMin >= 180 ? 0.24 : 0.12 });
  q(285, () => { stop("amb_rain", 2); stop("amb_dread", 4); log("env_change", "quiet", "rain"); });
  q(288, () => { stop("amb_night", 3); log("env_change", "quiet", "crickets"); });
  q(291, () => { stop("amb_neon", 1); stop("amb_fridge", 2); log("env_change", "quiet", "fridge+neon"); });
  q(294, () => { setGain("amb_room", 0.2); log("env_change", "quiet", "room"); });
  // forced events from ?event= (3 s apart)
  P.events.forEach((id, i) => after(3 + 3 * i, () => trigger(id)));
  render();
  hookView(S.view);
  const hint = document.getElementById("hint")!; hint.hidden = false;
  setTimeout(() => hint.classList.add("gone"), 6500); setTimeout(() => (hint.hidden = true), 8000);
}
onEnding((kind, why) => (kind === "good" ? endingGood() : endingBad(why)));

let last = performance.now();
let antiIdle = 0;
setInterval(() => {
  const now = performance.now(); const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (!S.night || S.ended || !S.alive) return;
  advance(dt * S.speed);
  tickEvents();
  // anti-idle (addon §2): 60 s in one room after 02:00 -> the house calls you from the farthest room
  if (S.sim - S.lastMoveSim > 60 && !active && S.gameMin >= 120 && S.gameMin < 280) {
    S.lastMoveSim = S.sim;
    const seq = ["overflow", "key_lock", "blackout"];
    let id = seq[antiIdle++ % seq.length];
    if (id === "key_lock" && (S.view === "door" || S.view === "peep")) id = "overflow";
    if (id === "blackout" && S.view === "kitchen") id = "overflow";
    if (id === "overflow" && S.view === "bath") id = "key_lock";
    log("info", "anti_idle", { room: S.view, send: id });
    startEvent(id, true);
  }
  phoneTick();
  // wall clock in the living room
  const h = document.querySelector<HTMLElement>("#clock .h"), m = document.querySelector<HTMLElement>("#clock .m");
  if (h && m) { h.style.transform = `rotate(${(S.gameMin / 60) * 30}deg)`; m.style.transform = `rotate(${(S.gameMin % 60) * 6}deg)`; }
  if (nightOver() && S.alive) {
    if (active?.id === "final") { log("correct", "final", "did not open before 05:00"); }
    void endingGood();
  }
}, 50);

// ---------------- input ----------------
bindInput((id) => act(id), (v) => go(v));
bindPhone((id) => act(id));
addEventListener("keydown", (e) => {
  if (!S.night || S.ended) return;
  const k = e.key.toLowerCase();
  if (k === "q") { act("phone_view"); return; }
  if (phoneOpen()) {
    if (k === "e" && phoneRinging()) act("phone_answer");
    else if (k === "r" && phoneRinging()) act("phone_decline");
    else if (k === "escape") togglePhone(false);
    return;
  }
  if (k === "e" || k === "enter") { const f = focused(); if (f) act(f); }
  else if (k === "tab") { e.preventDefault(); cycleFocus(); }
  else {
    const dir = ({ arrowleft: "left", a: "left", arrowright: "right", d: "right", arrowup: "up", w: "up", arrowdown: "down", s: "down" } as const)[k as "a"];
    if (dir) { const n = navFor(dir); if (n) go(n.to); }
  }
});
document.getElementById("phonebtn")!.onclick = (e) => { e.stopPropagation(); act("phone_view"); };
addEventListener("resize", fit);
// phone flashlight during a blackout follows the pointer
const aim = (e: PointerEvent) => {
  const st = document.getElementById("stage")!.getBoundingClientRect();
  document.documentElement.style.setProperty("--fx", `${((e.clientX - st.left) / st.width) * 100}%`);
  document.documentElement.style.setProperty("--fy", `${((e.clientY - st.top) / st.height) * 100}%`);
};
addEventListener("pointermove", aim); addEventListener("pointerdown", aim);
addEventListener("pointerdown", () => unlock(), { once: true });

// ---------------- debug api ----------------
const lt = exposeApi({
  go, act, trigger,
  setTime: (hm: string) => {
    const target = parseHM(hm);
    // jump: re-base the clock (events already planned keep their game times)
    const dtSim = simForMin(target) - S.sim; if (dtSim > 0) advance(dtSim);
    log("info", "setTime", hm); return S.gameMin;
  },
  setHaunt: (n: number) => { S.haunt = Math.max(0, Math.min(3, n)); log("info", "setHaunt", S.haunt); render(); },
  violate: () => { if (active) violate(active, "debug"); },
  plan: () => PLAN, rooms: ROOMS, rect, unlock,
  stats: () => ({ log: LOG.length }),
});
if (P.debug) debugPanel();

// ---------------- boot ----------------
fit(); startGrain();
document.documentElement.style.setProperty("--dark", String(T.DARK_BRIGHTNESS));
const r = rect("living", "clock");
Object.assign(document.getElementById("clock")!.style, { left: r[0] + "%", top: r[1] + "%", width: r[2] + "%", height: r[3] + "%" });
// warm the image cache so fast room changes never abort a half-loaded plate
for (const v of ["door", "peep", "living", "bedroom", "kitchen", "bath"]) { const im = new Image(); im.src = `views/${v}/base.webp`; }
for (const f of ["fx/jumpscare.webp", "views/living/tv_feed.webp", "views/living/tv_feed_turn.webp", "views/kitchen/kitchen_figure.webp"]) { const im = new Image(); im.src = f; }
preload(["amb_night", "amb_room", "amb_fan", "amb_fridge", "amb_neon", "amb_rain_drip", "knock3", "light_switch", "footsteps_tile", "sting_scare", "sting_low"]);
if (P.ending) {
  S.name = P.name || S.name; S.read2 = true; S.night = false;
  if (P.ending === "good") void endingGood(); else endingBad("debug");
} else if (P.skipintro) {
  S.name = P.name || S.name; S.read2 = P.read2;
  document.getElementById("screen")!.hidden = true;
  unlock();
  startNight();
} else {
  render();
  void runIntro(P.name, startNight);
}
lt.ready = true;
