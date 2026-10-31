// Event runners: signal (sound first, then picture) -> window -> correct / violate -> outcome by haunt (bible §4-§6).
import { S, log, after, cancel, realNow } from "./state.ts";
import { T } from "./tuning.ts";
import { play, stop, ambient, drone } from "./audio.ts";
import { setView, variant, render, flashScare, stageClass, hidden, lures, drawLabels, blackout } from "./view.ts";
import { setBusy, mulberry32 } from "./director.ts";
import { isReal, kindOf, CHANGE_ROOM, CHANGES } from "./rules.ts";
import { phoneRing, phoneHangup, phoneSms } from "./phone.ts";

export interface Ev {
  id: string; real: boolean; t0: number; done: boolean; tag: string; forced: boolean;
  onAct?: (hid: string) => boolean | void; // true = consumed (no default action)
  onView?: (v: string) => void;
  onLight?: (view: string, on: boolean) => void;
  onEnd?: () => void;
}
export let active: Ev | null = null; // the real rule running (max 1)
export const fakes: Ev[] = [];
let n = 0;
let rng = mulberry32(1);
export function seedEvents(seed: number) { rng = mulberry32(seed ^ 0x9e3779b9); }
const rr = (a: number, b: number) => a + (b - a) * rng();
const since = (ev: Ev) => S.sim - ev.t0;
// after 02:00 the lures of rules 1/3/5 last 25% longer (rules 2/4 keep the 7/8 s printed on the paper)
const late = () => (S.gameMin >= 120 ? 1.25 : 1);
let endingHook: (kind: "good" | "bad", why: string) => void = () => {};
export function onEnding(fn: typeof endingHook) { endingHook = fn; }

function mk(id: string, forced: boolean): Ev {
  const ev: Ev = { id, real: isReal(id), t0: S.sim, done: false, tag: `ev${++n}:${id}`, forced };
  if (ev.real) { active = ev; setBusy(true); } else fakes.push(ev);
  log("event_start", id, { real: ev.real, kind: kindOf(id), forced, n });
  if (kindOf(id) === "fake") log("fakeout", id);
  return ev;
}
function finish(ev: Ev) {
  if (ev.done) return false;
  ev.done = true;
  cancel(ev.tag);
  ev.onEnd?.();
  if (active === ev) { active = null; setBusy(false); drone(0, 4); }
  const i = fakes.indexOf(ev); if (i >= 0) fakes.splice(i, 1);
  return true;
}
const at = (ev: Ev, sec: number, fn: () => void) => after(sec, () => { if (!ev.done && S.alive) fn(); }, ev.tag);
function warn(ev: Ev, what: string) { log("warn", ev.id, what); }
function correct(ev: Ev, why = "") { if (!finish(ev)) return; S.corrects++; log("correct", ev.id, why); }

// ---------------- outcomes ----------------
export function violate(ev: Ev, why: string) {
  if (!finish(ev)) return;
  const before = S.haunt;
  S.haunt = Math.min(3, S.haunt + 1);
  S.violations.push(ev.id);
  log("violate", ev.id, { why, haunt: S.haunt });
  let out: "minor" | "scare" | "death" = S.haunt >= 3 ? "death" : S.haunt === 2 ? "scare" : "minor";
  if (ev.id === "knock" && before >= 1) out = "death";
  if (ev.id === "final") out = "death";
  if (S.forcedOutcome) { out = S.forcedOutcome; S.forcedOutcome = ""; }
  let note = "";
  if (out === "scare" && S.sim - S.lastScareSim < T.SCARE_COOLDOWN_SEC) { out = "minor"; note = "scare cooldown"; }
  log("outcome", ev.id, { outcome: out, haunt: S.haunt, ...(note ? { note } : {}) });
  reveal(ev.id, out);
}

const REVEAL: Record<string, [string, string] | undefined> = {
  knock: ["door", "door_ajar"], window: ["bedroom", "curtain_open"], redlight: ["bath", "mirror_ghost"],
  giggle: ["bedroom", "underbed_face"], chair: ["kitchen", "kitchen_figure"], final: ["door", "door_ajar"],
  key_lock: ["door", "door_ajar"], false_dawn: ["door", "door_ajar"],
};
const MINOR_CHANGE: Record<string, string> = { key_lock: "garland_wilt", false_dawn: "garland_wilt", knock: "garland_wilt", tv: "living_chair", window: "slippers_turned", chair: "kitchen_chair", redlight: "kitchen_chair", giggle: "slippers_turned", call407: "garland_wilt" };

function reveal(id: string, out: "minor" | "scare" | "death") {
  const rv = REVEAL[id];
  const inRoom = rv && (S.view === rv[0] || (rv[0] === "door" && S.view === "peep"));
  const doorRule = id === "knock" || id === "final" || id === "false_dawn";
  if (doorRule) setView("door");
  if (rv && (inRoom || doorRule)) variant(rv[0], rv[1], true, out === "minor" ? 2600 : 1400, 0.15);
  if (id === "window" && S.view === "bedroom") {
    document.getElementById("steam")!.textContent = S.name; // the house knows your name (bible §0.9)
    stageClass("steamname", true); setTimeout(() => stageClass("steamname", false), 2600);
  }
  const delay = rv && (inRoom || doorRule) ? 1100 : 300;
  if (out === "minor") {
    play("sting_low", "self", { gain: 0.9 });
    const c = MINOR_CHANGE[id]; if (c && !S.changes.has(c)) { S.changes.add(c); log("env_change", c, { cause: id }); }
    render();
    return;
  }
  setTimeout(() => {
    S.lastScareSim = S.sim;
    play("sting_scare", "self", { gain: 1 });
    flashScare();
    log("info", "jumpscare", { rule: id, tReal: realNow() });
    if (out === "scare") {
      setTimeout(() => {
        // cut back: the room is dark, something moved
        S.light[S.view] = false;
        const c = CHANGES.find((x) => !S.changes.has(x)); if (c) { S.changes.add(c); log("env_change", c, { cause: id }); }
        play("whoosh_dark", "self", { gain: 0.6 });
        render();
      }, T.SCARE_MS);
    } else {
      setTimeout(() => { blackout(99999); S.alive = false; endingHook("bad", id); }, T.SCARE_MS);
    }
  }, delay);
}

// ---------------- room conditions (director defers until true) ----------------
export function canStart(id: string) {
  const v = S.view;
  switch (id) {
    case "window": return v === "bedroom" || v === "living";
    case "chair": return v !== "bedroom";
    case "redlight": return v !== "bath";
    case "giggle": return v === "bedroom";
    case "tv": return v !== "living" || true;
    default: return true;
  }
}

// ---------------- runners ----------------
const CONFLICT: Record<string, string[]> = { f_knock2: ["knock", "final"], f_call_mom: ["call407"], f_tvstatic: ["tv"], f_peep: ["knock", "final"] };
export function startEvent(id: string, forced = false): boolean {
  if (!S.alive || S.ended) return false;
  if (active && CONFLICT[id]?.includes(active.id)) { log("info", id, `dropped: clashes with ${active.id}`); return false; }
  const run = RUN[id];
  if (!run) { log("todo", id, "no runner"); return false; }
  run(mk(id, forced));
  return true;
}

let peepOn = 0; // sim time the player started peeping
let peepArmed = false;
let peepEv: Ev | null = null;
let tvStage = 0;
function setTv(on: boolean, feed = "tv_feed") {
  S.tvOn = on;
  const tv = document.getElementById("tvfeed") as HTMLImageElement;
  if (on) tv.src = `views/living/${feed}.webp`;
  stageClass("tvturn", false);
  render();
}

function knockBody(ev: Ev) {
    warn(ev, "knock3 from the front door");
    play("knock3", "door", { tag: ev.tag + ":k1" });
    const win = rr(T.KNOCK_WINDOW[0], T.KNOCK_WINDOW[1]) * late();
    log("window_open", ev.id, { sec: +win.toFixed(1) });
    at(ev, 4, () => play("knock3", "door", { gain: 1.1 }));
    at(ev, 6.5, () => play("v:landlord_knock", "door", { gain: 0.9 }));
    at(ev, 8.5, () => { play("door_knob", "door"); stageClass("knob", true); });
    at(ev, win - 3, () => play("heartbeat", "self", { gain: 0.45 }));
    at(ev, win, () => { play("gecko", "living", { gain: 1 }); stageClass("knob", false); at(ev, 1.6, () => correct(ev, "waited for the gecko")); });
    ev.onAct = (hid) => {
      if (hid !== "door_open") return;
      if (since(ev) < T.GRACE_SEC) { play("door_knob", "door"); log("act", "door_open", "stuck (grace)"); return true; }
      play("door_open", "door"); stageClass("knob", false);
      violate(ev, "opened before the gecko");
      return true;
    };
    ev.onEnd = () => stageClass("knob", false);
}
function finalBody(ev: Ev) {
    warn(ev, "final knock 04:58");
    play("knock3", "door");
    log("window_open", ev.id, { until: "05:00" });
    const loop = (k: number) => {
      at(ev, 4, () => play("v:landlord_final", "door"));
      at(ev, 11, () => { play("knock3", "door", { gain: 1.1 }); if (k < 3) after(0.01, () => loop(k + 1), ev.tag); });
    };
    loop(0);
    ev.onAct = (hid) => {
      if (hid !== "door_open") return;
      if (since(ev) < T.GRACE_SEC) { play("door_knob", "door"); log("act", "door_open", "stuck (grace)"); return true; }
      play("door_open", "door");
      violate(ev, "opened for the landlady before 05:00");
      return true;
    };
}

const TV_LEAD = 2.2; // sound >= 2 s before the picture (QA M3)
const RUN: Record<string, (ev: Ev) => void> = {
  knock(ev) {
    // the crickets stop together first (bible §0.6), then the knocking
    ambient(0, 0.2); log("env_change", "silence", "before knock");
    at(ev, 3.2, () => { ev.t0 = S.sim; ambient(1, 2); knockBody(ev); });
  },
  final(ev) {
    S.finalStarted = true;
    ambient(0, 0.2); log("env_change", "silence", "before final");
    at(ev, 3.5, () => { ev.t0 = S.sim; ambient(0.6, 3); finalBody(ev); });
  },
  tv(ev) {
    warn(ev, "crt whine from the living room");
    play("crt_whine", "living", { gain: 0.9 });
    log("window_open", ev.id, { sec: T.TV_WINDOW });
    at(ev, TV_LEAD, () => { setTv(true); play("crt_static", "living", { loop: true, tag: "tvstatic", gain: 0.55 }); log("env_change", "tv_on"); });
    tvStage = 0;
    for (let k = 1; k <= 3; k++) at(ev, TV_LEAD + 2 * k, () => { tvStage = k; stageClass(`tvs${k}`, true); if (k === 3) { const f = document.getElementById("tvfeed") as HTMLImageElement; f.src = "views/living/tv_feed_turn.webp"; } });
    at(ev, TV_LEAD + T.TV_WINDOW - 3, () => play("heartbeat", "self", { gain: 0.5 }));
    at(ev, TV_LEAD + T.TV_WINDOW, () => { violate(ev, "tv still on after 7 s"); });
    ev.onAct = (hid) => {
      if (hid !== "tv_off") return;
      correct(ev, "tv off in time");
      return false; // default action turns it off
    };
    ev.onEnd = () => { stop("tvstatic"); [1, 2, 3].forEach((k) => stageClass(`tvs${k}`, false)); if (S.tvOn) { play("tv_click", "living"); setTv(false); } };
  },
  window(ev) {
    warn(ev, "glass tap at the bedroom window");
    play("glass_tap", "bedroom");
    hidden.add("bedroom:curtain_open");
    const win = rr(T.WINDOW_WINDOW[0], T.WINDOW_WINDOW[1]) * late();
    log("window_open", ev.id, { sec: +win.toFixed(1) });
    at(ev, 3, () => play("v:mother_window", "bedroom", { gain: 0.9 }));
    at(ev, T.GRACE_SEC, () => { hidden.delete("bedroom:curtain_open"); lures.add("bedroom:curtain_open"); stageClass("handshadow", true); log("env_change", "hand_shadow"); drawLabels(); });
    at(ev, 7.5, () => play("glass_tap", "bedroom", { gain: 0.8 }));
    at(ev, win - 3, () => play("heartbeat", "self", { gain: 0.45 }));
    at(ev, win, () => correct(ev, "curtain stayed shut"));
    ev.onAct = (hid) => { if (hid === "curtain_open") { violate(ev, "opened the curtain"); return true; } };
    ev.onEnd = () => { hidden.delete("bedroom:curtain_open"); lures.delete("bedroom:curtain_open"); stageClass("handshadow", false); drawLabels(); };
  },
  chair(ev) {
    warn(ev, "chair scrape in the kitchen");
    play("chair_scrape", "kitchen", { gain: 0.7 });
    log("window_open", ev.id, { sec: T.CHAIR_WINDOW, hold: T.CHAIR_HOLD });
    at(ev, 2.5, () => { play("chair_scrape", "kitchen", { gain: 0.9 }); if (S.view === "kitchen") { variant("kitchen", "kitchen_chair", true, 2500); log("env_change", "chair_moves"); } });
    at(ev, 5, () => { play("chair_scrape", "kitchen", { gain: 1.1 }); play("footsteps_tile", "kitchen", { gain: 0.6 }); });
    at(ev, T.CHAIR_WINDOW - 3, () => play("heartbeat", "self", { gain: 0.5 }));
    let holding = false;
    at(ev, T.CHAIR_WINDOW, () => {
      if (S.view !== "bedroom") return violate(ev, "not in the bedroom after 8 s");
      holding = true;
      at(ev, T.CHAIR_HOLD, () => correct(ev, "stayed in the bedroom"));
    });
    ev.onView = (v) => { if (holding && v !== "bedroom") violate(ev, "left the bedroom before it went quiet"); };
  },
  redlight(ev) {
    warn(ev, "bulb fizz in the bathroom");
    play("bulb_buzz", "bath");
    hidden.add("bath:mirror_look");
    const win = rr(T.RED_WINDOW[0], T.RED_WINDOW[1]) * late();
    log("window_open", ev.id, { sec: +win.toFixed(1) });
    at(ev, 2.5, () => { stageClass("red", true); log("env_change", "bath_red"); });
    at(ev, 4, () => { play("lullaby_hum", "bath", { loop: true, tag: "lullaby", gain: 0.6 }); play("drip", "bath", { loop: true, tag: "dripred", gain: 0.7 }); });
    at(ev, T.GRACE_SEC, () => { hidden.delete("bath:mirror_look"); lures.add("bath:mirror_look"); drawLabels(); });
    at(ev, win - 3, () => play("heartbeat", "self", { gain: 0.45 }));
    at(ev, win, () => { play("light_switch", "bath"); correct(ev, "did not look while red"); });
    ev.onAct = (hid) => { if (hid === "mirror_look") { violate(ev, "looked into the red mirror"); return true; } };
    ev.onEnd = () => { stageClass("red", false); stop("lullaby"); stop("dripred"); hidden.delete("bath:mirror_look"); lures.delete("bath:mirror_look"); drawLabels(); };
  },
  giggle(ev) {
    warn(ev, "giggle under the bed");
    play("child_giggle", "bedroom"); play("bed_creak", "bedroom", { gain: 0.7 });
    let lead = 0;
    if (!S.light.bedroom) {
      // the bulb comes on by itself (after the sound): lying still in the dark is not enough tonight
      lead = 2.2;
      at(ev, lead, () => { S.light.bedroom = true; play("bulb_buzz", "bedroom", { gain: 0.7 }); log("env_change", "light_bedroom", "on by itself"); hookLight("bedroom", true); render(); });
    }
    log("window_open", ev.id, { sec: T.GIGGLE_WINDOW + lead, dark: T.GIGGLE_DARK });
    at(ev, 3, () => play("child_giggle", "bedroom", { gain: 0.8 }));
    let inBed = false, dark = false;
    at(ev, T.GIGGLE_WINDOW + lead, () => {
      if (S.light.bedroom) return violate(ev, "bedroom light still on after 6 s");
      dark = true; inBed = S.view === "bedroom";
      play("heartbeat", "self", { gain: 0.5 });
      at(ev, 3, () => play("bed_creak", "bedroom", { gain: 0.5 }));
      at(ev, T.GIGGLE_DARK, () => correct(ev, "waited in the dark"));
    });
    ev.onLight = (view, on) => { if (dark && view === "bedroom" && on) violate(ev, "light on before it went quiet"); };
    ev.onView = (v) => { if (dark && inBed && v !== "bedroom") violate(ev, "left the bedroom before it went quiet"); };
  },
  call407(ev) {
    warn(ev, "phone buzz in the pocket");
    play("phone_buzz", "self", { gain: 0.8 });
    log("window_open", ev.id, { sec: T.CALL_WINDOW });
    at(ev, 2.2, () => { play("ringtone", "self", { loop: true, tag: "ring", gain: 0.45 }); phoneRing("407", T.GRACE_SEC - 2.2, ev); });
    at(ev, T.CALL_WINDOW, () => { phoneHangup(); correct(ev, "let it ring out"); });
    ev.onAct = (hid) => {
      if (hid === "phone_decline") { phoneHangup(); correct(ev, "declined"); return true; }
      if (hid === "phone_answer") {
        if (since(ev) < T.GRACE_SEC) return true;
        stop("ring");
        violate(ev, "answered 407");
        // on the line: 2 s nothing, breathing, the whisper, then the knocking starts (one broken rule pulls the next)
        after(2, () => play("breath_line", "self", { gain: 0.7 }));
        after(4.5, () => play("v:ghost_call", "self", { gain: 1 }));
        after(7.5, () => { phoneHangup(); if (S.alive) startEvent("knock", true); });
        return true;
      }
    };
    ev.onEnd = () => stop("ring");
  },
  // ---------- fake-outs (no penalty, never a scare) ----------
  f_knock2(ev) {
    play("knock2", "door");
    at(ev, 10, () => correct(ev));
    ev.onAct = (hid) => { if (hid === "door_open") { play("door_open", "door"); variant("door", "door_ajar", true, 1500); log("info", "f_knock2", "opened: empty porch"); return true; } };
  },
  f_call_mom(ev) {
    play("phone_buzz", "self", { gain: 0.8 });
    at(ev, 2.2, () => { play("ringtone", "self", { loop: true, tag: "ring", gain: 0.45 }); phoneRing("แม่", 0, ev); });
    at(ev, 10, () => { phoneHangup(); correct(ev); });
    ev.onAct = (hid) => {
      if (hid === "phone_decline") { phoneHangup(); correct(ev); return true; }
      if (hid === "phone_answer") { stop("ring"); play("v:mother_call", "self"); after(5, () => { phoneHangup(); correct(ev); }); return true; }
    };
    ev.onEnd = () => stop("ring");
  },
  f_tvstatic(ev) {
    if (active?.id === "tv") return correct(ev);
    play("crt_static", "living", { tag: "tvstatic_f", gain: 0.5 }); setTv(true, "tv_feed_empty");
    stageClass("tvnoise", true);
    at(ev, 2, () => { stop("tvstatic_f"); play("tv_click", "living"); setTv(false); correct(ev); });
    ev.onEnd = () => { stageClass("tvnoise", false); if (S.tvOn && active?.id !== "tv") setTv(false); };
  },
  f_roof(ev) { play("roof_creak", "roof"); at(ev, 6, () => correct(ev)); },
  f_howl(ev) { play("dog_howl", "outside", { gain: 0.8 }); at(ev, 6, () => correct(ev)); },
  f_silence(ev) {
    const sec = rr(T.SILENCE_SEC[0], T.SILENCE_SEC[1]);
    ambient(0, 0.15);
    at(ev, sec, () => { ambient(1, 1.2); correct(ev); });
    ev.onEnd = () => ambient(1, 1.2);
  },
  f_shrine(ev) { play("bulb_buzz", "outside", { gain: 0.35 }); stageClass("shrineoff", true); at(ev, 3, () => { stageClass("shrineoff", false); correct(ev); }); ev.onEnd = () => stageClass("shrineoff", false); },
  // ---------- addon: back-of-paper rules ----------
  key_lock(ev) {
    warn(ev, "keys jingling at the front door");
    play("keys_jingle", "door", { gain: 1 });
    log("window_open", ev.id, { sec: 10 });
    at(ev, 2.4, () => { play("door_knob", "door"); S.flags.keyLock = true; stageClass("knob", true); drawLabels(); log("env_change", "knob_turning"); });
    at(ev, 4.4, () => play("door_knob", "door", { gain: 1.1 }));
    at(ev, 6, () => play("v:landlord_knock", "door", { gain: 0.8 }));
    at(ev, 7, () => play("heartbeat", "self", { gain: 0.5 }));
    at(ev, 10, () => violate(ev, "the chain was not on when the key turned"));
    ev.onAct = (hid) => { if (hid === "chain_lock") { play("door_knob", "door", { rate: 1.4 }); play("light_switch", "door", { gain: 0.8, rate: 0.6 }); correct(ev, "chain on in time"); return true; } };
    ev.onEnd = () => { S.flags.keyLock = false; stageClass("knob", false); drawLabels(); };
  },
  false_dawn(ev) {
    warn(ev, "rooster + dawn birds from the front");
    play("rooster", "outside", { gain: 0.9 }); play("birds_dawn", "outside", { loop: true, tag: "dawnbirds", gain: 0.5, amb: true });
    log("window_open", ev.id, { sec: 15 });
    at(ev, 2.5, () => { phoneSms("ป้าเจ้าของบ้าน", "ตีห้าแล้วจ้ะ ออกมาได้"); play("phone_buzz", "self", { gain: 0.6 }); S.flags.falseDawn = true; lures.add("door:door_open"); drawLabels(); log("env_change", "sms_dawn"); });
    at(ev, 15, () => correct(ev, "checked the time, stayed in"));
    ev.onAct = (hid) => {
      if (hid !== "door_open") return;
      if (since(ev) < T.GRACE_SEC) { play("door_knob", "door"); log("act", "door_open", "stuck (grace)"); return true; }
      play("door_open", "door"); violate(ev, "opened the door at a fake dawn"); return true;
    };
    ev.onEnd = () => { stop("dawnbirds", 2); S.flags.falseDawn = false; lures.delete("door:door_open"); drawLabels(); };
  },
  // ---------- addon: tasks (never kill, never scare) ----------
  blackout(ev) {
    if (S.flags.blackout) return correct(ev, "already dark");
    warn(ev, "bulbs fizzing all over the house");
    play("bulb_buzz", "self", { gain: 0.6 }); stageClass("flick", true);
    at(ev, 2.6, () => {
      stageClass("flick", false);
      S.flags.blackout = true; saved = { ...S.light };
      for (const k of Object.keys(S.light)) S.light[k] = false;
      stop("amb_fan", 2.5); play("fan_winddown", "living", { gain: 0.8 }); stop("amb_fridge", 0.5); stop("amb_neon", 0.1);
      play("whoosh_dark", "self", { gain: 0.5 });
      log("env_change", "blackout", "power cut"); stageClass("blackout", true); render();
      at(ev, 40, () => log("info", "blackout", "not fixed in 40 s"));
    });
    ev.onAct = (hid) => {
      if (hid === "light" && S.flags.blackout) { play("light_switch", S.view); log("act", "light", "no power"); return true; }
      if (hid !== "breaker" || !S.flags.blackout) return;
      play("breaker_clunk", "kitchen", { gain: 1 });
      const late = since(ev) > 42.6;
      restorePower();
      correct(ev, late ? "breaker up late" : "breaker up in time");
      return true;
    };
  },
  overflow(ev) {
    warn(ev, "water running hard in the bathroom");
    play("water_running", "bath", { loop: true, tag: "water", gain: 0.9 });
    log("window_open", ev.id, { sec: 20 });
    at(ev, 2.5, () => { S.flags.overflow = true; stageClass("overflow", true); drawLabels(); log("env_change", "water_under_door"); });
    at(ev, 20, () => { log("info", "overflow", "not closed in 20 s: water masks the house now"); });
    ev.onView = (v) => { if (v === "bath" && S.gameMin >= 180 && !pairDone && !active) { pairDone = true; log("info", "pressure_pair", "overflow + redlight"); after(3, () => { if (!active) startEvent("redlight", true); }); } };
    ev.onAct = (hid) => {
      if (hid !== "tap_off") return;
      stop("water", 0.6); play("light_switch", "bath", { rate: 0.5, gain: 0.7 });
      correct(ev, since(ev) <= 20 ? "tap closed in time" : "tap closed late");
      return true;
    };
    ev.onEnd = () => { S.flags.overflow = false; stageClass("overflow", false); drawLabels(); };
  },
  // ---------- addon: odd events (no penalty) ----------
  wall_knock(ev) {
    play("knock3", "bedroom", { gain: 0.55 });
    warn(ev, "knocking inside the bedroom wall");
    at(ev, 2.2, () => { S.flags.wallKnock = true; drawLabels(); });
    at(ev, 10, () => correct(ev, "did not answer"));
    ev.onAct = (hid) => {
      if (hid !== "knock_back") return;
      log("info", "wall_knock", "answered");
      play("knock2", "self", { gain: 0.6 });
      after(1.8, () => { play("knock3", "self", { gain: 1 }); play("breath_line", "self", { gain: 0.7 }); });
      after(4, () => { S.light.bedroom = false; play("bulb_buzz", "bedroom", { gain: 0.5 }); render(); });
      finish(ev); return true;
    };
    ev.onEnd = () => { S.flags.wallKnock = false; drawLabels(); };
  },
  follow_steps(ev) { followLeft = 3; warn(ev, "bare footsteps follow you"); at(ev, 90, () => correct(ev)); ev.onEnd = () => { followLeft = 0; }; followEv = ev; },
  bed_taken(ev) {
    warn(ev, "bulb fizz + bed creak in the bedroom");
    play("bulb_buzz", "bedroom", { gain: 0.45 }); play("bed_creak", "bedroom", { gain: 0.6 });
    if (S.view === "bedroom") { at(ev, 0.1, () => {}); }
    S.flags.bedTaken = S.view !== "bedroom";
    if (!S.flags.bedTaken) at(ev, 2, () => { S.flags.bedTaken = true; }); at(ev, 120, () => { S.flags.bedTaken = false; correct(ev); }); ev.onEnd = () => { S.flags.bedTaken = false; variant("bedroom", "bed_taken", false, 0, 0); }; bedEv = ev; },
  cat_cry(ev) { play("cat_cry", "outside", { gain: 0.7 }); at(ev, 5, () => correct(ev)); },
  f_peep(ev) {
    peepArmed = true; play("footsteps_tile", "door", { gain: 0.35 }); // someone on the porch
    peepEv = ev; at(ev, 20, () => { peepArmed = false; correct(ev); });
  },
};

// ---------------- hooks from main ----------------
export function hookAct(hid: string): boolean {
  let consumed = false;
  for (const ev of [active, ...fakes]) if (ev && !ev.done && ev.onAct?.(hid)) consumed = true;
  return consumed;
}
export function hookView(v: string) {
  const from = prevView; prevView = v;
  if (followLeft > 0 && from && from !== v && v !== "peep" && from !== "peep") {
    followLeft--;
    after(1.5, () => play("footsteps_tile", from as never, { gain: 0.8 }));
    log("info", "follow_steps", { from, to: v, left: followLeft });
    if (followLeft === 0 && v === "kitchen") { variant("kitchen", "kitchen_figure", true, 1000, 0); log("info", "sighting", "follow_steps kitchen"); }
    if (followLeft === 0 && followEv) correct(followEv, "followed 3 times");
  }
  if (v === "bedroom" && S.flags.bedTaken && bedEv && !bedEv.done) {
    play("bed_creak", "bedroom", { gain: 0.5 });
    variant("bedroom", "bed_taken", true, 0, 0);
    log("info", "bed_taken", "someone is in the bed");
    const e = bedEv;
    after(6, () => { if (S.view === "bedroom" && !e.done) { play("breath_line", "bedroom", { gain: 0.5 }); variant("bedroom", "bed_taken", false, 0, 2.5); correct(e, "stayed: it sank away"); } }, e.tag);
  } else if (from === "bedroom" && bedEv && !bedEv.done && S.flags.bedTaken) { variant("bedroom", "bed_taken", false, 0, 0); correct(bedEv, "left the room"); }
  if (v === "kitchen" && S.flags.blackout && !seen.has("blackout")) {
    seen.add("blackout"); log("info", "sighting", "flashlight in the blackout");
    setTimeout(() => variant("kitchen", "kitchen_figure", true, 900, 0), 900);
  }
  for (const ev of [active, ...fakes]) if (ev && !ev.done) ev.onView?.(v);
  if (v === "peep") {
    peepOn = S.sim;
    if (active?.id === "knock") { variant("peep", "peep_woman_side", true, 0, 0.6); play("peep_breath", "self", { gain: 0.5, tag: "peepbreath" }); }
    if (active?.id === "final") variant("peep", "peep_landlady_smile", true, 0, 0.4);
    if (peepArmed) {
      peepArmed = false; log("info", "f_peep", "someone standing far out on the porch");
      setTimeout(() => { variant("peep", "peep_woman_side", true, 0, 0.8); setTimeout(() => variant("peep", "peep_woman_side", false, 0, 0.8), 1200); }, 900);
      if (peepEv) correct(peepEv, "seen");
    }
  } else { variant("peep", "peep_woman_side", false, 0, 0); variant("peep", "peep_woman_look", false, 0, 0); variant("peep", "peep_landlady_smile", false, 0, 0); stop("peepbreath"); }
  applyPendingChange(v);
  sighting(v);
}
// Safe-play sightings (rare, restrained, escalating; never a sting, never a penalty; <= 4 a night, >= 45 s apart, each < 1.5 s):
//  02:10+ kitchen: she stands in the far doorway, the neon blinks, gone
//  02:40+ living (tv off): her shape sits reflected in the dark TV glass behind you, then fades
//  03:30+ bedroom (light on): her face under the bed for a few frames as you come in
function sighting(v: string) {
  if (!S.night || active || sightings >= 4 || S.sim - lastSighting < 45) return;
  const m = S.gameMin;
  const ok = (v === "kitchen" && m >= 130 && S.light.kitchen && !seen.has("kitchen"))
    || (v === "living" && m >= 160 && !S.tvOn && !seen.has("living"))
    || (v === "bedroom" && m >= 210 && S.light.bedroom && !seen.has("bedroom"))
    || (v === "kitchen" && m >= 230 && S.light.kitchen && seen.has("kitchen") && !seen.has("kitchen2"));
  if (!ok || rng() > 0.65) return;
  const key = v === "kitchen" && seen.has("kitchen") ? "kitchen2" : v;
  seen.add(key); sightings++; lastSighting = S.sim;
  log("info", "sighting", key);
  if (v === "kitchen") {
    variant("kitchen", "kitchen_figure", true, 0, 0);
    setTimeout(() => { stageClass("flick", true); play("bulb_buzz", "kitchen", { gain: 0.3 }); }, key === "kitchen2" ? 700 : 1300);
    setTimeout(() => variant("kitchen", "kitchen_figure", false, 0, 0), key === "kitchen2" ? 800 : 1400);
    setTimeout(() => stageClass("flick", false), key === "kitchen2" ? 950 : 1550);
  } else if (v === "living") {
    stageClass("tvreflect", true); setTimeout(() => stageClass("tvreflect", false), 1400);
  } else if (v === "bedroom") {
    variant("bedroom", "underbed_face", true, 260, 0);
  }
}
const seen = new Set<string>();
let sightings = 0, lastSighting = -999;
let pairDone = false;
let saved: Record<string, boolean> | null = null;
let followLeft = 0; let followEv: Ev | null = null; let bedEv: Ev | null = null;
let prevView = "";
export function restorePower() {
  if (!S.flags.blackout) return;
  S.flags.blackout = false; stageClass("blackout", false);
  if (saved) Object.assign(S.light, saved); saved = null;
  play("amb_fan", "living", { loop: true, amb: true, tag: "amb_fan", gain: 0.7 });
  play("amb_fridge", "kitchen", { loop: true, amb: true, tag: "amb_fridge", gain: 0.55 });
  if (S.light.kitchen) play("amb_neon", "kitchen", { loop: true, amb: true, tag: "amb_neon", gain: 0.4 });
  log("env_change", "power", "restored"); render();
}
export function hookLight(view: string, on: boolean) { for (const ev of [active, ...fakes]) if (ev && !ev.done) ev.onLight?.(view, on); }
/** called every tick */
export function tickEvents() {
  if (S.view === "peep" && active?.id === "knock" && S.sim - peepOn > T.PEEP_STARE_SEC && peepOn >= 0) {
    peepOn = -1; // once: she turns her head to the lens. No sting, no penalty; you stop breathing, then we cut away
    log("info", "peep_stare", "she turned to the lens");
    stop("peepbreath", 0.05);
    variant("peep", "peep_woman_look", true, 0, 0);
    variant("peep", "peep_woman_side", false, 0, 0);
    setTimeout(() => { blackout(450); setTimeout(() => variant("peep", "peep_woman_look", false, 0, 0), 300); }, 700);
  }
}

// ---------------- house changes (seeded, applied when the player walks back in) ----------------
const pending: string[] = [];
export function scheduleChanges() {
  // one change becomes due roughly every 45-60 s from 01:30, in a seeded order
  const order = [...CHANGES].sort(() => rng() - 0.5);
  order.forEach((c, i) => after((T.CHANGES_FROM_MIN - S.startMin) * T.SEC_PER_GAME_MIN + i * rr(45, 60), () => pending.push(c), "changes"));
}
function applyPendingChange(v: string) {
  const i = pending.findIndex((c) => CHANGE_ROOM[c] === (v === "peep" ? "door" : v) && !S.changes.has(c));
  if (i < 0) return;
  const c = pending.splice(i, 1)[0];
  // it happened while we were away: no sound, no pointer
  S.changes.add(c); log("env_change", c, { cause: "house" });
  render();
}
