// Shared game state, log, sim clock + scheduler. The sim clock (seconds) advances real-time x speed while the night runs.
import { T } from "./tuning.ts";

export type ViewId = "exterior" | "door" | "peep" | "living" | "bedroom" | "kitchen" | "bath";
export const ROOMS: ViewId[] = ["door", "living", "bedroom", "kitchen", "bath"];
export type LogType = "event_start" | "warn" | "window_open" | "correct" | "violate" | "outcome" | "fakeout" | "env_change" | "view" | "act" | "ending" | "todo" | "info";
export interface LogRow { tReal: number; tGame: string; type: LogType; id: string; detail?: unknown }

export const S = {
  name: "ผู้เช่า",
  seed: 0,
  seedFromUrl: false,
  speed: 1,
  sim: 0, // sim seconds since 00:00
  startMin: 0,
  gameMin: 0,
  night: false, // night clock running
  view: "exterior" as ViewId,
  haunt: 0,
  light: { door: true, living: true, bedroom: false, kitchen: true, bath: false } as Record<string, boolean>,
  tvOn: false,
  read2: false,
  alive: true,
  ended: false,
  violations: [] as string[],
  corrects: 0,
  lastScareSim: -999,
  changes: new Set<string>(), // visible house changes
  forcedOutcome: "" as "" | "minor" | "scare" | "death",
  muted: false,
  debug: false,
  finalStarted: false,
  flags: { keyLock: false, blackout: false, overflow: false, wallKnock: false, falseDawn: false, bedTaken: false } as Record<string, boolean>,
  lastMoveSim: 0,
};

export const t0 = performance.now();
export const realNow = () => Math.round(performance.now() - t0);
export const fmtMin = (m: number) => {
  const mm = Math.max(0, Math.floor(m));
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
};
export const gameClock = () => fmtMin(S.gameMin);

export const LOG: LogRow[] = [];
type Cb = (row: LogRow) => void;
const subs: Record<string, Cb[]> = {};
export function on(type: string, cb: Cb) { (subs[type] ??= []).push(cb); }
export function log(type: LogType, id: string, detail?: unknown) {
  const row: LogRow = { tReal: realNow(), tGame: gameClock(), type, id, ...(detail !== undefined ? { detail } : {}) };
  LOG.push(row);
  for (const cb of [...(subs[type] ?? []), ...(subs["*"] ?? [])]) { try { cb(row); } catch (e) { console.error(e); } }
}

// ---- scheduler (sim seconds) ----
interface Job { due: number; fn: () => void; tag: string }
let jobs: Job[] = [];
export function after(sec: number, fn: () => void, tag = "") { jobs.push({ due: S.sim + sec, fn, tag }); }
export function cancel(tag: string) { jobs = jobs.filter((j) => j.tag !== tag); }
export function cancelAll() { jobs = []; }

// game minutes for a sim second count (normal rate until FINAL_MIN, then stretched)
export function minAt(sim: number) {
  const normalEnd = T.FINAL_MIN * T.SEC_PER_GAME_MIN - S.startMin * T.SEC_PER_GAME_MIN;
  if (S.startMin >= T.FINAL_MIN) return S.startMin + sim / T.FINAL_SEC_PER_GAME_MIN;
  if (sim <= normalEnd) return S.startMin + sim / T.SEC_PER_GAME_MIN;
  return T.FINAL_MIN + (sim - normalEnd) / T.FINAL_SEC_PER_GAME_MIN;
}
export function simForMin(min: number) { // inverse of minAt (from current startMin)
  if (min <= T.FINAL_MIN || S.startMin >= T.FINAL_MIN) {
    const rate = S.startMin >= T.FINAL_MIN ? T.FINAL_SEC_PER_GAME_MIN : T.SEC_PER_GAME_MIN;
    return (min - S.startMin) * rate;
  }
  return (T.FINAL_MIN - S.startMin) * T.SEC_PER_GAME_MIN + (min - T.FINAL_MIN) * T.FINAL_SEC_PER_GAME_MIN;
}

export function advance(dtSim: number) {
  S.sim += dtSim;
  S.gameMin = minAt(S.sim);
  // run due jobs in order (a job may schedule more)
  for (let guard = 0; guard < 200; guard++) {
    let best = -1;
    for (let i = 0; i < jobs.length; i++) if (jobs[i].due <= S.sim && (best < 0 || jobs[i].due < jobs[best].due)) best = i;
    if (best < 0) break;
    const j = jobs.splice(best, 1)[0];
    try { j.fn(); } catch (e) { console.error(e); }
  }
}
