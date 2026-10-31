// Ghost director: seeded plan (mulberry32) of real rules + fake-outs over the night, dispatched by sim time.
import { S, log, after, simForMin } from "./state.ts";
import { T } from "./tuning.ts";
import { REAL, FAKES, isReal } from "./rules.ts";

export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export interface Planned { atMin: number; id: string; real: boolean }
export let PLAN: Planned[] = [];

/** Build the night. Same seed => same plan (independent of the player). */
export function buildPlan(seed: number): Planned[] {
  const r = mulberry32(seed);
  const rr = (a: number, b: number) => a + (b - a) * r();
  const pick = <X,>(xs: readonly X[]) => xs[Math.floor(r() * xs.length)];
  const plan: Planned[] = [];
  const secToMin = (s: number) => s / T.SEC_PER_GAME_MIN;
  // early house noise: one roof fake before the first rule, maybe a tv flicker
  plan.push({ atMin: rr(18, 38), id: "f_roof", real: false });
  // real rule order: the 7 required first (shuffled, with time constraints), then extras
  const req = [...REAL] as string[];
  for (let i = req.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [req[i], req[j]] = [req[j], req[i]]; }
  let t = T.FIRST_RULE_MIN;
  const reals: Planned[] = [];
  let last = "";
  while (t < T.QUIET_FROM_MIN - 4) {
    const ph = T.PHASES.find((p) => t >= p.from && t < p.to) ?? T.PHASES[T.PHASES.length - 1];
    // pick the next id that is allowed at t
    const ok = (id: string) => id !== last && !(id === "tv" && t < T.TV_AFTER_MIN) && !((id === "call407" || id === "key_lock") && t < T.CALL_AFTER_MIN);
    let id = req.find(ok);
    if (id) req.splice(req.indexOf(id), 1);
    else {
      // extras lean on the rules that demand an action (an idle player must not be safe all night)
      const weighted = ["tv", "tv", "giggle", "chair", "key_lock", "knock", "window", "redlight", "call407"];
      const pool = weighted.filter((x) => ok(x));
      id = pick(pool.length ? pool : REAL);
    }
    reals.push({ atMin: t, id, real: true });
    last = id;
    // squeeze gaps while required rules remain so all land before 04:00
    let gap = rr(ph.gap[0], ph.gap[1]);
    const left = req.length;
    if (left > 0) gap = Math.min(gap, secToMin(1) * 0 + ((T.GUARANTEE_BEFORE_MIN - 6 - t) / left) * T.SEC_PER_GAME_MIN);
    t += Math.max(secToMin(16), secToMin(gap));
  }
  plan.push(...reals);
  // fake-outs between real rules (share per phase). Types come from a seeded shuffled cycle so a night shows many kinds;
  // from 02:00 a gap's fake is a dog howl right before the next real rule 70% of the time (the omen)
  const cycle = FAKES.filter((f) => f !== "f_roof" && f !== "f_howl");
  for (let i = cycle.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cycle[i], cycle[j]] = [cycle[j], cycle[i]]; }
  let ci = 0, howls = 0;
  // fixed count -> share ~35% every seed (30-40% band); the opening roof fake counts as one
  const k = Math.max(0, Math.round((reals.length * T.FAKE_SHARE) / (1 - T.FAKE_SHARE)) - 1);
  const gaps = reals.map((_, i) => i).filter((i) => (reals[i + 1]?.atMin ?? T.QUIET_FROM_MIN) - reals[i].atMin > 8);
  for (let i = gaps.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [gaps[i], gaps[j]] = [gaps[j], gaps[i]]; }
  for (const i of gaps.slice(0, k).sort((x, y) => x - y)) {
    const a = reals[i].atMin, b = reals[i + 1]?.atMin ?? T.QUIET_FROM_MIN;
    if (reals[i + 1] && reals[i + 1].atMin >= T.CALL_AFTER_MIN && howls < 2 && r() < T.HOWL_OMEN_P) {
      howls++;
      plan.push({ atMin: reals[i + 1].atMin - secToMin(rr(5, 8)), id: "f_howl", real: false });
      continue;
    }
    let f = cycle[ci++ % cycle.length];
    if (f === "f_tvstatic" && a >= T.TV_AFTER_MIN && r() < 0.5) f = cycle[ci++ % cycle.length];
    plan.push({ atMin: a + (b - a) * rr(0.55, 0.8), id: f, real: false });
  }
  // addon (devbrief-addon §2): tasks from 01:30, odd events from 02:00, false dawn 04:15-04:40, a cat any time
  plan.push({ atMin: rr(92, 112), id: "blackout", real: false });
  plan.push({ atMin: rr(196, 214), id: r() < 0.5 ? "overflow" : "blackout", real: false });
  plan.push({ atMin: rr(125, 150), id: "overflow", real: false });
  plan.push({ atMin: rr(130, 175), id: "wall_knock", real: false });
  plan.push({ atMin: rr(150, 175), id: "follow_steps", real: false });
  plan.push({ atMin: rr(180, 230), id: "bed_taken", real: false });
  plan.push({ atMin: rr(10, 45), id: "cat_cry", real: false });
  plan.push({ atMin: rr(255, 280), id: "false_dawn", real: true });
  // pressure pairs 03:00-04:45 (a task/odd event + a real rule on top of it; never two real rules)
  // (if the same rule already sits next to the slot, the pair uses another rule so a rule never repeats back to back)
  const near = (id: string, at: number) => reals.some((x) => x.id === id && Math.abs(x.atMin - at) < 30);
  const pa = rr(186, 200); plan.push({ atMin: pa, id: "blackout", real: false }, { atMin: pa + secToMin(5), id: near("chair", pa) ? "tv" : "chair", real: true });
  const pb = rr(232, 246); plan.push({ atMin: pb, id: "wall_knock", real: false }, { atMin: pb + secToMin(2.5), id: near("window", pb) ? "giggle" : "window", real: true });
  plan.push({ atMin: T.FINAL_MIN, id: "final", real: true });
  plan.sort((x, y) => x.atMin - y.atMin);
  return plan;
}

type Starter = (id: string, forced: boolean) => boolean; // false = room condition not met
let starter: Starter = () => true;
let canStart: (id: string) => boolean = () => true;
export let busyReal = false;
export function setBusy(b: boolean) { busyReal = b; }

let droneHook: (l: number) => void = () => {};
export function setDroneHook(f: (l: number) => void) { droneHook = f; }
export function initDirector(seed: number, start: Starter, cond: (id: string) => boolean) {
  starter = start; canStart = cond;
  PLAN = buildPlan(seed);
  for (const p of PLAN) {
    const at = simForMin(p.atMin);
    if (at < S.sim - 0.01) continue; // started later in the night (?start=)
    after(at - S.sim, () => dispatch(p.id, 0), "plan");
    if (p.real && at - S.sim > 6) after(at - S.sim - 5, () => droneHook(1), "plan");
  }
}

/** fire now, or retry every DEFER_SEC while the room condition is not met (forced after DEFER_MAX_SEC) */
export function dispatch(id: string, waited: number) {
  if (!S.alive || S.ended) return;
  if (S.gameMin >= T.QUIET_FROM_MIN && S.gameMin < T.FINAL_MIN && id !== "final") { log("info", id, "dropped: quiet stretch"); return; }
  const real = isReal(id);
  if (real && busyReal && id !== "final") {
    after(T.DEFER_SEC, () => dispatch(id, waited + T.DEFER_SEC), "plan");
    return;
  }
  const forced = waited >= T.DEFER_MAX_SEC;
  if (!forced && !canStart(id)) { after(T.DEFER_SEC, () => dispatch(id, waited + T.DEFER_SEC), "plan"); return; }
  starter(id, forced);
}
