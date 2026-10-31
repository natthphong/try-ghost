// URL params + window.__lt (docs/DEBUG.md). debug=1 draws a panel (never in footage).
import { S, LOG, on, gameClock, log } from "./state.ts";
import { AUDIO_LOG } from "./audio.ts";
import { PLAN } from "./director.ts";
import { active } from "./events.ts";
import { clearInfo } from "./endings.ts";

export function params() {
  const q = new URLSearchParams(location.search);
  const num = (k: string) => (q.has(k) && q.get(k) !== "" && !isNaN(Number(q.get(k))) ? Number(q.get(k)) : null);
  return {
    seed: num("seed"), name: q.get("name"), skipintro: q.get("skipintro") === "1", read2: q.get("read2") === "1",
    start: q.get("start"), speed: Math.max(1, Math.min(8, num("speed") ?? 1)),
    events: (q.get("event") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    haunt: num("haunt"), outcome: q.get("outcome") as "" | "minor" | "scare" | "death" | null,
    view: q.get("view"), ending: q.get("ending") as "good" | "bad" | null, debug: q.get("debug") === "1", mute: q.get("mute") === "1",
  };
}

export function debugPanel() {
  const d = document.getElementById("debug")!;
  d.hidden = false;
  setInterval(() => {
    const next = PLAN.find((p) => p.atMin > S.gameMin);
    d.textContent = `t ${gameClock()} sim ${S.sim.toFixed(1)} x${S.speed} seed ${S.seed}\nview ${S.view} haunt ${S.haunt} read2 ${S.read2}\nactive ${active?.id ?? "-"} next ${next ? next.id + "@" + Math.floor(next.atMin) : "-"}\nlight ${JSON.stringify(S.light)}\n` +
      LOG.slice(-8).map((r) => `${r.tGame} ${r.type} ${r.id}`).join("\n");
  }, 250);
}
export function exposeApi(api: Record<string, unknown>) {
  const lt = {
    ready: false,
    log: LOG, audioLog: AUDIO_LOG, plan: () => PLAN,
    state: () => ({ gameTime: gameClock(), view: S.view, haunt: S.haunt, light: { ...S.light }, activeEvent: active?.id ?? null,
      read2: S.read2, alive: S.alive, ended: S.ended, night: S.night, tvOn: S.tvOn, seed: S.seed, speed: S.speed, name: S.name, changes: [...S.changes], clear: (() => { const c = clearInfo(); return { rank: c.rank, met: c.met, hiddenFound: c.hiddenFound }; })() }),
    on, ...api,
  };
  (window as unknown as { __lt: typeof lt }).__lt = lt;
  return lt;
}
export { log };
