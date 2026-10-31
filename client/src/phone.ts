// The phone is HTML: [Q] lock screen with the time (looking at the time is an action) + incoming calls.
import { S, gameClock, log } from "./state.ts";

const $ = (id: string) => document.getElementById(id)!;
let open = false;
let ringing: { who: string; armAt: number } | null = null;
let actCb: (id: string) => void = () => {};
export function bindPhone(act: (id: string) => void) { actCb = act; }
export const phoneOpen = () => open;
export const phoneRinging = () => !!ringing;

function draw() {
  const p = $("phone");
  p.hidden = !open;
  $("phonebtn").classList.toggle("ring", !!ringing);
  if (!open) return;
  const armed = ringing && S.sim >= ringing.armAt;
  p.innerHTML = ringing
    ? `<div class="scr call"><div class="who">${ringing.who === "407" ? "ไม่ระบุหมายเลข" : "สายเรียกเข้า"}</div>
        <div class="num">${ringing.who}</div>
        <div class="btns ${armed ? "" : "wait"}">
          <button data-a="phone_decline" class="dec"><kbd>R</kbd>วางสาย</button>
          <button data-a="phone_answer" class="ans"><kbd>E</kbd>รับสาย</button></div></div>`
    : `<div class="scr"><div class="time">${gameClock()}</div><div class="date">วันเสาร์ 31 ตุลาคม</div>
        <div class="bars">แบต 12%</div>${notes()}<div class="hint"><kbd>Q</kbd> เก็บโทรศัพท์</div></div>`;
  p.querySelectorAll<HTMLButtonElement>("button[data-a]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); actCb(b.dataset.a!); }));
}
const escName = () => S.name.replace(/[&<>"]/g, "");
let sawSms = false;
const extra: [string, string][] = [];
export function phoneSms(from: string, text: string) { extra.unshift([from, text]); log("env_change", "sms", { from, text }); if (open) draw(); $("phonebtn").classList.add("ring"); setTimeout(() => $("phonebtn").classList.toggle("ring", !!ringing), 1500); }
function notes() {
  // the house knows your name: the landlady's text, and after 02:00 one from 407 (bible §0.9)
  let h = extra.map(([f, t]) => `<div class="note"><b>${f}</b><span>${t}</span></div>`).join("") + `<div class="note"><b>ป้าเจ้าของบ้าน</b><span>คุณ${escName()} นอนหลับฝันดีนะจ๊ะ</span></div>`;
  if (S.gameMin >= 120) {
    h = h.replace(/(<div class="note"><b>ป้าเจ้าของบ้าน<\/b><span>คุณ)/, `<div class="note bad"><b>407</b><span>${escName()} ยังไม่นอนอีกเหรอ</span></div>$1`);
    if (!sawSms) { sawSms = true; log("info", "name_seen", "sms from 407"); }
  }
  return `<div class="notes">${h}</div>`;
}
export function togglePhone(force?: boolean) {
  open = force ?? !open;
  if (open) log("act", "phone_view", { time: gameClock() });
  draw();
}
export function phoneRing(who: string, armIn: number, _ev?: unknown) {
  ringing = { who, armAt: S.sim + Math.max(0, armIn) };
  log("env_change", "phone_ring", { who });
  draw();
  setTimeout(draw, Math.max(0, armIn) * 1000 / Math.max(1, S.speed) + 50);
}
export function phoneHangup() { ringing = null; draw(); }
export function phoneTick() { if (open && !ringing) { const t = document.querySelector("#phone .time"); if (t) t.textContent = gameClock(); } }
export function phoneArmed() { return !!ringing && S.sim >= ringing.armAt; }
