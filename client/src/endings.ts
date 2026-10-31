// Endings: good (05:00, the twist + a new rules paper that uses your name) / bad (stats from the log + retry buttons).
import { S, LOG, log, gameClock, fmtMin } from "./state.ts";
import { play, stopAll, ambient } from "./audio.ts";
import { rulesHtml, wirePager } from "./intro.ts";
import { T } from "./tuning.ts";
import { rect } from "./view.ts";
import { PAGE1, BACK } from "./rules.ts";

const CONDS = [
  { t: "ทำตามกฎหน้า 1 ครบ", hidden: false },
  { t: "ทำตามกฎหลังกระดาษครบ", hidden: true },
  { t: "งานบ้านครบ (ไฟ น้ำ)", hidden: false },
  { t: "ไม่ขานรับใครเลย", hidden: true },
  { t: "อ่านกระดาษครบสองหน้า", hidden: true },
  { t: "รู้ความจริงที่ตาแมว ตอนตีห้า", hidden: true },
];
const store = { get(k: string) { try { return localStorage.getItem(k); } catch { return null; } }, set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
export function clearInfo(alive = S.alive) {
  const viol = LOG.filter((r) => r.type === "violate").map((r) => r.id);
  const corr = (id: string, why: string) => LOG.some((r) => r.type === "correct" && r.id === id && String(r.detail).includes(why));
  const tasks = LOG.filter((r) => r.type === "event_start" && (r.id === "blackout" || r.id === "overflow"));
  const tasksOk = tasks.every((r) => (r.id === "blackout" ? corr("blackout", "in time") || corr("blackout", "already") : corr("overflow", "in time")));
  const answered = LOG.some((r) => r.type === "info" && r.id === "wall_knock" && r.detail === "answered") || LOG.some((r) => r.type === "act" && r.id === "phone_answer" && r.tGame >= "03:00" && typeof r.detail === "object");
  const fi = LOG.findIndex((r) => r.type === "event_start" && r.id === "final");
  const peeked = fi >= 0 && LOG.slice(fi).some((r) => r.type === "view" && r.id === "peep");
  const met = [!viol.some((v) => PAGE1.includes(v)), alive && !viol.some((v) => BACK.includes(v)), tasksOk, !answered, S.read2, alive && peeked];
  const n = met.filter(Boolean).length;
  const rank = !alive ? "-" : n === 6 ? "S" : n === 5 ? "A" : n >= 3 ? "B" : "C";
  const found = (store.get("lt_found") ?? "").split(",").filter(Boolean);
  met.forEach((m, i) => { if (m && CONDS[i].hidden && !found.includes(String(i))) found.push(String(i)); });
  const hiddenFound = CONDS.filter((c, i) => c.hidden && met[i]).length;
  return { rank, met, n, hiddenFound, found };
}
function sheetHtml() {
  const c = clearInfo();
  store.set("lt_found", c.found.join(","));
  const bestK = `lt_best_${S.seed}`; const order = "SABC";
  const prev = store.get(bestK);
  if (!prev || order.indexOf(c.rank) < order.indexOf(prev)) store.set(bestK, c.rank);
  log("info", "clear", { rank: c.rank, met: c.met, hiddenFound: c.hiddenFound });
  const rows = CONDS.map((k, i) => {
    const show = !k.hidden || c.met[i] || c.found.includes(String(i));
    return `<li class="${c.met[i] ? "ok" : "no"}"><span>${show ? k.t : "???"}</span><b>${c.met[i] ? "✓" : "✗"}</b></li>`;
  }).join("");
  return `<div class="sheet paper"><div class="hd">ใบประเมินผู้เช่า</div><div class="to">บ้านเลขที่ 407 · คุณ${esc(S.name)}</div><ol>${rows}</ol>
    <div class="stamp">${c.rank}</div><div class="share">บ้านเลขที่ 407 · seed ${S.seed} · ระดับ ${c.rank} · เงื่อนไขลับ ${c.hiddenFound}/4${prev ? ` · ดีสุด ${order.indexOf(prev) < order.indexOf(c.rank) ? prev : c.rank}` : ""}</div></div>`;
}

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function stats() {
  const viol = LOG.filter((r) => r.type === "violate").map((r) => r.id);
  const corr = LOG.filter((r) => r.type === "correct" && ["knock", "tv", "window", "chair", "redlight", "giggle", "call407", "final"].includes(r.id)).length;
  const lastT = LOG.length ? LOG[LOG.length - 1].tGame : gameClock();
  return { survivedTo: lastT, violations: viol.length, violated: viol, rulesSurvived: corr, seed: S.seed, haunt: S.haunt };
}
function retryUrl(sameSeed: boolean) {
  const u = new URL(location.href);
  for (const k of ["ending", "event", "haunt", "outcome", "start", "view"]) u.searchParams.delete(k);
  if (sameSeed) u.searchParams.set("seed", String(S.seed)); else u.searchParams.delete("seed");
  u.searchParams.set("name", S.name);
  return u.toString();
}
function tvStyle() { const r = rect("living", "tv"); return `left:${r[0]}%;top:${r[1]}%;width:${r[2]}%;height:${r[3]}%`; }
function timeThai(hhmm: string) { return `${hhmm} น.`; }
// which rule killed you, in the game's own words
const DEATH: Record<string, [string, string]> = {
  knock: ["คุณเปิดประตูก่อนจิ้งจกร้อง", "กฎข้อ 1 · ถ้าได้ยินเสียงเคาะประตู 3 ครั้ง ห้ามเปิดประตู จนกว่าจิ้งจกจะร้อง"],
  tv: ["ทีวีเปิดค้างไว้เกิน 7 วินาที", "กฎข้อ 2 · ถ้าทีวีเปิดเองหลังตีหนึ่ง ต้องปิดภายใน 7 วินาที"],
  window: ["คุณเปิดม่านให้เสียงที่หน้าต่าง", "กฎข้อ 3 · ถ้ามีคนเรียกจากหน้าต่างห้องนอน ห้ามเปิดม่าน"],
  chair: ["คุณไม่ได้อยู่ในห้องนอนตอนเก้าอี้ลาก", "กฎข้อ 4 · ถ้าได้ยินเสียงลากเก้าอี้ในครัว ต้องกลับเข้าห้องนอนภายใน 8 วินาที"],
  redlight: ["คุณมองกระจกตอนไฟเป็นสีแดง", "กฎข้อ 5 · ถ้าไฟในห้องน้ำเปลี่ยนเป็นสีแดง ห้ามมองกระจก"],
  giggle: ["ไฟห้องนอนยังสว่างตอนมีเสียงหัวเราะ", "กฎข้อ 6 · ถ้าได้ยินเสียงหัวเราะใต้เตียง ต้องปิดไฟแล้วรอให้เงียบ"],
  call407: ["คุณรับสายจากเบอร์ 407", "หลังกระดาษ · ถ้าโทรศัพท์ดัง แล้วขึ้นเบอร์ 407 อย่ารับ"],
  key_lock: ["คุณไม่ได้คล้องโซ่ ตอนมีคนไขกุญแจ", "หลังกระดาษ · ถ้าได้ยินเสียงไขกุญแจ ให้รีบคล้องโซ่ประตู"],
  false_dawn: ["คุณเชื่อว่าเช้าแล้ว โดยไม่ดูนาฬิกา", "หลังกระดาษ · ป้าไม่เคยมาก่อนตีห้า ดูนาฬิกาก่อนเปิดประตู"],
  final: ["คุณเปิดประตูให้ป้า ก่อนตีห้า", "หลังกระดาษ · ป้าไม่เคยมาก่อนตีห้า ดูนาฬิกาก่อนเปิดประตู"],
};

export async function endingGood() {
  if (S.ended) return; S.ended = true; S.night = false;
  document.getElementById("stage")!.classList.add("ended");
  log("ending", "good", stats());
  stopAll();
  play("door_open", "self", { gain: 0.8 });
  await wait(900);
  play("amb_fan", "self", { loop: true, amb: true, tag: "end_fan", gain: 0.5 });
  ambient(1);
  const s = $("screen"); s.hidden = false; s.className = "ending good";
  s.innerHTML = `<img class="bg" src="views/exterior/dawn.webp" onerror="this.src='views/exterior/base.webp';this.classList.add('dawnfx')" alt="" /><div class="lines"></div>`;
  const box = s.querySelector(".lines")!;
  const nv = LOG.filter((r) => r.type === "violate").length;
  const lines = [nv === 0 ? `ยินดีด้วย คุณ${esc(S.name)} ทำตามกฎครบทุกข้อ` : `คุณ${esc(S.name)} อยู่รอดถึงเช้า แม้บ้านจะจำได้ว่าคุณผิดกฎ ${nv} ข้อ`, "แต่กฎทั้งหมดนี้ ไม่ได้เขียนไว้เพื่อปกป้องคุณ", "มันเขียนไว้ เพื่อไม่ให้สิ่งที่อยู่ในบ้าน ออกไปข้างนอก"];
  for (const l of lines) {
    const p = document.createElement("p"); box.appendChild(p);
    for (const ch of [...l]) { p.textContent += ch; await wait(55); }
    await wait(1600);
  }
  await wait(1200);
  const st = stats();
  s.insertAdjacentHTML("beforeend", `<div class="newpaper paper p2"><div class="hand"><p>ถ้าได้ยินเสียง ${esc(S.name)} เรียกจากหน้าต่าง</p><p>ห้ามเปิดม่าน</p><p class="sign">— ผู้เช่าคนก่อน</p></div></div>
    <div class="stats">seed ${st.seed} · ผิดกฎ ${st.violations} ข้อ · รอดกฎ ${st.rulesSurvived} ครั้ง</div>
    <div class="btns"><button class="again">เช่าคืนเดิม</button><button class="new">เช่าคืนใหม่</button></div>`);
  s.querySelector<HTMLButtonElement>(".again")!.onclick = () => (location.href = retryUrl(true));
  s.querySelector<HTMLButtonElement>(".new")!.onclick = () => (location.href = retryUrl(false));
  await wait(3500);
  box.classList.add("gone");
  s.insertAdjacentHTML("beforeend", sheetHtml());
  if (clearInfo().rank === "S") {
    await wait(3000);
    play("phone_buzz", "self", { gain: 0.7 });
    s.insertAdjacentHTML("beforeend", `<div class="epi"><div class="note bad"><b>407</b><span>${esc(S.name)} ขอบคุณที่อยู่ครบคืนนะ คืนนี้มาอีกไหม</span></div><div class="epb"><button data-r="แล้วเจอกันจ้ะ">มา</button><button data-r="ไม่เป็นไร เดี๋ยวไปหาเอง">ไม่มา</button></div></div>`);
    s.querySelectorAll<HTMLButtonElement>(".epi button").forEach((b) => (b.onclick = () => { s.querySelector(".epb")!.innerHTML = `<p>${b.dataset.r}</p>`; log("info", "epilogue", b.textContent); }));
  }
}

export function endingBad(why = "") {
  if (S.ended) return; S.ended = true; S.night = false; S.alive = false;
  const st = stats();
  log("ending", "bad", { ...st, why });
  stopAll();
  setTimeout(() => play("crt_static", "self", { loop: true, tag: "end_static", gain: 0.25 }), 600);
  const s = $("screen"); s.hidden = false; s.className = "ending bad";
  document.getElementById("stage")!.classList.add("ended");
  const room = ["door", "peep"].includes(S.view) ? "door" : S.view === "exterior" ? "living" : S.view;
  const [what, rule] = DEATH[why] ?? ["บ้านจำได้ว่าคุณผิดกฎ", ""];
  s.innerHTML = `<div class="tvwall"><img class="bg" src="views/living/base.webp" alt="" /><div class="tvbox" style="${tvStyle()}"><img src="views/${room}/base.webp" alt="" /><div class="tvtext">คุณ${esc(S.name)} ยังอยู่ในบ้าน</div></div></div>
    <div class="card"><div class="stats"><p class="what">${what}</p><p class="rule">${rule}</p><p>รอดถึง ${timeThai(st.survivedTo)} · ผิดกฎ ${st.violations} ข้อ · seed ${st.seed} · เงื่อนไขที่ทำได้ ${clearInfo(false).n}/6</p></div>
    <div class="btns"><button class="reread">อ่านกฎอีกครั้ง</button><button class="again">เช่าคืนเดิม</button><button class="new">เช่าคืนใหม่</button></div></div>
    <div class="rules-again" hidden></div>`;
  s.querySelector<HTMLButtonElement>(".again")!.onclick = () => (location.href = retryUrl(true));
  s.querySelector<HTMLButtonElement>(".new")!.onclick = () => (location.href = retryUrl(false));
  s.querySelector<HTMLButtonElement>(".reread")!.onclick = () => {
    const r = s.querySelector<HTMLElement>(".rules-again")!;
    r.hidden = false; r.className = "rules-again intro rules"; r.innerHTML = rulesHtml(S.name, true) + `<button class="close big">ปิด</button>`;
    wirePager(r, () => {});
    r.querySelector<HTMLButtonElement>(".close")!.onclick = () => { r.hidden = true; };
  };
}
export const nightOver = () => S.gameMin >= T.NIGHT_END_MIN;
export { fmtMin };
