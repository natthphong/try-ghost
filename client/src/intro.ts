// Before midnight: headphones -> contract (nickname) -> the landlady -> the rules paper (2 pages) -> lights out.
// After the night starts there is no way back to the paper (it is removed from the DOM).
import { S, log } from "./state.ts";
import { unlock, play } from "./audio.ts";
import { RULES_PAGE1, RULES_FOOT, RULES_PAGE2, RULES_SIGN } from "./rules.ts";

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function rulesHtml(name: string, readonly = false) {
  return `<div class="paper p1"><div class="hd">กฎของบ้านเช่า</div><div class="to">ถึง คุณ${esc(name)} ผู้เช่าคืนนี้</div>
    <ol>${RULES_PAGE1.map((r) => `<li>${r}</li>`).join("")}</ol><div class="foot">${RULES_FOOT}</div></div>
  <div class="paper p2"><div class="hand">${RULES_PAGE2.map((l) => `<p>${l}</p>`).join("")}<p class="sign">${RULES_SIGN}</p></div></div>
  <div class="pager"><button class="prev" aria-label="หน้าก่อน">‹</button><span class="pg">1/2</span><button class="next" aria-label="หน้าถัดไป">›</button></div>
  ${readonly ? "" : `<button class="sleep big">จำได้แล้ว ปิดไฟนอน</button>`}`;
}
export function wirePager(root: HTMLElement, onPage2: () => void) {
  let page = 1;
  const set = (p: number) => {
    page = p; root.dataset.page = String(p);
    root.querySelector(".pg")!.textContent = `${p}/2`;
    if (p === 2) onPage2();
  };
  root.querySelector<HTMLButtonElement>(".prev")!.onclick = (e) => { e.stopPropagation(); set(1); };
  root.querySelector<HTMLButtonElement>(".next")!.onclick = (e) => { e.stopPropagation(); set(2); };
  const key = (e: KeyboardEvent) => {
    if (!root.isConnected) return removeEventListener("keydown", key);
    if (e.key === "ArrowRight" || e.key === "d") set(2);
    if (e.key === "ArrowLeft" || e.key === "a") set(1);
  };
  addEventListener("keydown", key);
  set(1);
  return () => page;
}

function screen(html: string, cls: string) {
  const s = $("screen"); s.className = cls; s.innerHTML = html; s.hidden = false; return s;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runIntro(nameFromUrl: string | null, startNight: () => void) {
  document.getElementById("stage")!.dataset.view = "exterior";
  // 1. headphones (also unlocks audio on mobile)
  await new Promise<void>((res) => {
    const s = screen(`<div class="center"><svg class="hp" viewBox="0 0 64 64" aria-hidden="true"><path d="M10 38v-6a22 22 0 0 1 44 0v6" fill="none" stroke="currentColor" stroke-width="4"/><rect x="6" y="36" width="12" height="20" rx="4" fill="currentColor"/><rect x="46" y="36" width="12" height="20" rx="4" fill="currentColor"/></svg><p class="big">เกมนี้หลอนด้วยเสียง</p><p>ใส่หูฟังแล้วแตะเพื่อรับกุญแจ</p><button class="big go">รับกุญแจ</button></div>`, "intro hp");
    const go = () => { removeEventListener("keydown", k); unlock(); res(); };
    const k = (e: KeyboardEvent) => { if (e.key === "e" || e.key === "E" || e.key === "Enter" || e.key === " ") go(); };
    s.querySelector<HTMLButtonElement>(".go")!.onclick = go;
    addEventListener("keydown", k);
  });
  play("amb_night", "outside", { loop: true, amb: true, tag: "amb_night", gain: 0.8 });
  play("amb_rain_drip", "outside", { loop: true, amb: true, tag: "amb_rain", gain: 0.5 });
  // 2. contract
  if (!nameFromUrl) {
    S.name = await new Promise<string>((res) => {
      const s = screen(`<form class="contract"><div class="hd">สัญญาเช่า</div><p>บ้านเลขที่ 407 · ค่าเช่าคืนละ 399 บาท · หนึ่งคืน</p>
        <label>ชื่อเล่นผู้เช่า<input id="nick" maxlength="12" autocomplete="off" required placeholder="ชื่อเล่น" /></label>
        <button class="big">เซ็นสัญญา</button></form>`, "intro contract-scr");
      const f = s.querySelector("form")!; const inp = s.querySelector<HTMLInputElement>("#nick")!;
      setTimeout(() => inp.focus(), 50);
      f.onsubmit = (e) => { e.preventDefault(); const v = inp.value.trim(); if (v) res(v.slice(0, 12)); };
    });
  } else S.name = nameFromUrl;
  log("info", "contract", { name: S.name });
  // 3. the landlady (two lines)
  const sub = screen(`<div class="subs"><p class="line"></p></div>`, "intro landlady");
  const line = sub.querySelector(".line")!;
  for (const [id, text, ms] of [["landlord_keys", "“กุญแจจ้ะ คืนละสามร้อยเก้าสิบเก้า”", 3600], ["landlord_warn", "“คืนนี้ถ้าได้ยินอะไร อย่าเชื่อทุกอย่างที่เห็น แล้วก็อ่านกฎให้ดีนะ พลิกดูให้ครบด้วย”", 6800]] as const) {
    play("v:" + id, "self", { gain: 1 });
    line.textContent = text;
    await wait(ms);
  }
  // 4. the rules paper
  await new Promise<void>((res) => {
    const s = screen(rulesHtml(S.name), "intro rules");
    wirePager(s, () => { if (!S.read2) { S.read2 = true; log("info", "read2", true); } });
    s.querySelector<HTMLButtonElement>(".sleep")!.onclick = () => res();
  });
  // 5. lights out
  const s = $("screen"); s.innerHTML = ""; s.className = "intro black"; play("light_switch", "self");
  await wait(1200);
  s.hidden = true; s.innerHTML = "";
  startNight();
}
