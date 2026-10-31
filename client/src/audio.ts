// Web Audio: every sound has a source room; gain/pan/lowpass follow the player's view (horror-bible §7).
// audioLog records every play/stop/loop/set with the values at that moment (recorder rebuilds the mix from it).
import { S, realNow, type ViewId } from "./state.ts";
import { T } from "./tuning.ts";

export type Src = ViewId | "self" | "roof" | "outside";
export interface AudioRow { tReal: number; id: string; file: string; gain: number; pan: number; lowpass: number; action: "play" | "stop" | "loop" | "set"; tag?: string }
export const AUDIO_LOG: AudioRow[] = [];

const EDGES: [string, string][] = [["door", "living"], ["living", "bedroom"], ["living", "kitchen"], ["kitchen", "bath"], ["door", "exterior"], ["door", "peep"]];
const X: Record<string, number> = { bedroom: -1, living: 0, door: 0, peep: 0, exterior: 0, kitchen: 0.7, bath: 1 };
const room = (v: string) => (v === "peep" ? "door" : v);
function dist(a: string, b: string) {
  a = room(a); b = room(b);
  if (a === b) return 0;
  const seen = new Set([a]); let frontier = [a]; let d = 0;
  while (frontier.length && d < 3) {
    d++;
    const next: string[] = [];
    for (const f of frontier) for (const [p, q] of EDGES) {
      const n = p === f ? q : q === f ? p : "";
      if (n && !seen.has(n)) { if (n === b) return Math.min(d, 2); seen.add(n); next.push(n); }
    }
    frontier = next;
  }
  return 2;
}

export function spatial(src: Src, baseGain = 1) {
  const here = S.view;
  if (src === "self") return { gain: baseGain, pan: 0, lowpass: 20000 };
  if (src === "roof") return { gain: baseGain * 0.7, pan: 0, lowpass: 1600 };
  if (src === "outside") { // night outside: loudest near windows/door
    const near = here === "bedroom" || here === "door" || here === "peep" || here === "exterior";
    return { gain: baseGain * (near ? 0.8 : 0.45), pan: here === "bedroom" ? 0.4 : 0, lowpass: near ? 9000 : 3000 };
  }
  const d = dist(src, here);
  const gain = baseGain * Math.pow(10, T.DIST_DB[d] / 20);
  const pan = Math.max(-0.85, Math.min(0.85, (X[src] - X[room(here)]) * 0.8));
  return { gain, pan, lowpass: T.DIST_LP[d] };
}

let ctx: AudioContext | null = null;
let verb: ConvolverNode | null = null, verbOut: GainNode | null = null;
function impulse(c: AudioContext, sec: number, decay: number) {
  const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 40 ? i / 40 : 1); }
  return b;
}
/** loop points that skip encoder padding / digital silence at both ends */
function loopBounds(buf: AudioBuffer) {
  const d = buf.getChannelData(0), thr = 0.0004;
  let a = 0, z = d.length - 1;
  while (a < d.length && Math.abs(d[a]) < thr) a++;
  while (z > a && Math.abs(d[z]) < thr) z--;
  return [a / buf.sampleRate, z / buf.sampleRate];
}
let master: GainNode, ambBus: GainNode, fxBus: GainNode;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
export const fileOf = (id: string) => `audio/${id.startsWith("v:") ? "voice/" + id.slice(2) : "sfx/" + id}.mp3`;

export function unlock() {
  if (ctx) { ctx.resume(); return; }
  try {
    ctx = new AudioContext();
    // master -> limiter (scares loud but never ear-blasting, no clipping)
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.25;
    lim.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = S.muted ? 0 : 1; master.connect(lim);
    // small tiled-room reverb (generated impulse) fed by a send from every positioned sound
    verb = ctx.createConvolver(); verb.buffer = impulse(ctx, 0.9, 3.2);
    verbOut = ctx.createGain(); verbOut.gain.value = 0.55; verb.connect(verbOut).connect(master);
    ambBus = ctx.createGain(); ambBus.connect(master);
    fxBus = ctx.createGain(); fxBus.connect(master);
    ctx.resume();
    for (const v of voices.values()) startNode(v);
  } catch (e) { console.warn("audio unavailable", e); ctx = null; }
}
function load(id: string) {
  if (!ctx) return Promise.resolve(null);
  let p = buffers.get(id);
  if (!p) {
    const c = ctx;
    p = fetch(fileOf(id)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((b) => c.decodeAudioData(b)).catch(() => null);
    buffers.set(id, p);
  }
  return p;
}
export function preload(ids: string[]) { for (const id of ids) void load(id); }

interface Voice { id: string; src: Src; base: number; loop: boolean; amb: boolean; tag: string; rate: number;
  node?: AudioBufferSourceNode; g?: GainNode; p?: StereoPannerNode; lp?: BiquadFilterNode; stopped?: boolean }
const voices = new Map<string, Voice>();
let n = 0;

function rec(v: Voice, action: AudioRow["action"]) {
  const s = spatial(v.src, v.base);
  AUDIO_LOG.push({ tReal: realNow(), id: v.id, file: fileOf(v.id), gain: +s.gain.toFixed(3), pan: +s.pan.toFixed(2), lowpass: s.lowpass, action, tag: v.tag });
  return s;
}
function startNode(v: Voice) {
  if (!ctx) return;
  const c = ctx;
  void load(v.id).then((buf) => {
    if (!buf || v.stopped || v.node) return;
    const s = spatial(v.src, v.base);
    const node = c.createBufferSource(); node.buffer = buf; node.loop = v.loop; node.playbackRate.value = v.rate;
    const [ls, le] = loopBounds(buf);
    if (v.loop) { node.loopStart = ls; node.loopEnd = le; }
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = s.lowpass;
    const p = c.createStereoPanner(); p.pan.value = s.pan;
    const g = c.createGain(); g.gain.value = s.gain;
    node.connect(lp).connect(p).connect(g).connect(v.amb ? ambBus : fxBus);
    // reverb send: sounds from another room arrive wetter (more room, less direct)
    if (verb && v.src !== "self" && !v.amb) { const send = c.createGain(); send.gain.value = s.lowpass < 5000 ? 0.5 : 0.22; g.connect(send).connect(verb); }
    node.start(0, v.loop ? ls + Math.random() * Math.max(0, le - ls - 0.1) : ls);
    if (!v.loop) node.onended = () => voices.delete(v.tag);
    Object.assign(v, { node, g, p, lp });
  });
}

/** play a one-shot (or loop when opts.loop). Returns its tag. */
export function play(id: string, src: Src = "self", opts: { gain?: number; loop?: boolean; tag?: string; amb?: boolean; rate?: number } = {}) {
  const tag = opts.tag ?? `${id}#${++n}`;
  if (opts.tag && voices.has(tag)) stop(tag);
  const v: Voice = { id, src, base: opts.gain ?? 1, loop: !!opts.loop, amb: !!opts.amb, tag, rate: opts.rate ?? 1 };
  voices.set(tag, v);
  rec(v, v.loop ? "loop" : "play");
  startNode(v);
  return tag;
}
export function stop(tag: string, fade = 0.15) {
  const v = voices.get(tag); if (!v) return;
  v.stopped = true; voices.delete(tag);
  rec(v, "stop");
  if (ctx && v.node && v.g) {
    const t = ctx.currentTime; v.g.gain.setTargetAtTime(0, t, fade / 3);
    try { v.node.stop(t + fade + 0.05); } catch { /* already stopped */ }
  }
}
export function playing(tag: string) { return voices.has(tag); }
export function setGain(tag: string, gain: number) { const v = voices.get(tag); if (!v) return; v.base = gain; refreshOne(v, 0.4); }
function refreshOne(v: Voice, ramp = 0.25) {
  const s = rec(v, "set");
  if (ctx && v.g && v.p && v.lp) {
    const t = ctx.currentTime;
    v.g.gain.setTargetAtTime(s.gain, t, ramp / 3);
    v.p.pan.setTargetAtTime(s.pan, t, ramp / 3);
    v.lp.frequency.setTargetAtTime(s.lowpass, t, ramp / 3);
  }
}
/** player moved: re-place every sound (only loops are logged, one-shots follow silently) */
export function refreshSpatial() {
  for (const v of voices.values()) {
    if (v.loop) refreshOne(v);
    else if (ctx && v.g && v.p && v.lp) {
      const s = spatial(v.src, v.base); const t = ctx.currentTime;
      v.g.gain.setTargetAtTime(s.gain, t, 0.08); v.p.pan.setTargetAtTime(s.pan, t, 0.08); v.lp.frequency.setTargetAtTime(s.lowpass, t, 0.08);
    }
  }
}
/** ambient bus (silence weapon): 0..1 */
let ambLevel = 1;
export function ambient(level: number, sec = 0.3) {
  ambLevel = level;
  AUDIO_LOG.push({ tReal: realNow(), id: "bus:ambient", file: "", gain: level, pan: 0, lowpass: 20000, action: "set" });
  if (ctx) ambBus.gain.setTargetAtTime(level, ctx.currentTime, sec / 3);
}
export const ambientLevel = () => ambLevel;
export function setMuted(m: boolean) { S.muted = m; if (ctx) master.gain.value = m ? 0 : 1; }
export function stopAll() { for (const tag of [...voices.keys()]) stop(tag, 0.4); }
export function audioReady() { return !!ctx; }

// sub-bass drone (synthesised, no file): rises a few seconds before real rules, falls when they resolve
let droneG: GainNode | null = null;
export function drone(level: number, sec = 3) {
  AUDIO_LOG.push({ tReal: realNow(), id: "synth:drone", file: "", gain: level, pan: 0, lowpass: 120, action: "set" });
  if (!ctx) return;
  if (!droneG) {
    droneG = ctx.createGain(); droneG.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 120;
    for (const f of [41, 43.3, 61.5]) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(lp); o.start(); }
    lp.connect(droneG).connect(master);
  }
  droneG.gain.setTargetAtTime(level * 0.16, ctx.currentTime, sec / 3);
}
