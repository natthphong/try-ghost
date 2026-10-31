# last_tenant debug / replay (for qa + recorder)

Dev server: http://localhost:5190/ (fixed port). Headless helper: `node scripts/check.mjs "<query>" "<js>" <waitMs> <shot.png>`.

## URL params
| param | effect |
|---|---|
| `seed=<int>` | same night every time (plan of events comes only from the seed: `__lt.plan()`) |
| `name=<ชื่อ>` | skip the contract name field |
| `skipintro=1` | skip headphones/contract/rules -> 00:00 (add `read2=1` to mark page 2 as read) |
| `start=HH:MM` | start the clock at that game time · `speed=1..8` time multiplier (everything, incl. rule windows, runs in sim time) |
| `event=<id>[,<id>]` | forced events, first at +3 s, then 3 s apart (a real rule waits until the previous real rule is over) |
| `haunt=0..3` · `outcome=minor\|scare\|death` | starting haunt · forced outcome of the next violation |
| `view=<id>` | start room (default bedroom, lights off) · `ending=good\|bad` jump to an ending |
| `debug=1` | debug panel (never in footage) · `mute=1` silent (audioLog still records) |

Event ids: `knock tv window chair redlight giggle call407 final f_knock2 f_call_mom f_tvstatic f_roof f_howl f_silence f_shrine f_peep`
Views: `exterior door peep living bedroom kitchen bath` (exterior = intro/ending only).

## window.__lt (ready when `__lt.ready === true`)
- `state()` -> {gameTime, view, haunt, light{room:bool}, activeEvent, read2, alive, ended, night, tvOn, seed, speed, name, changes[]}
- `go(view)` · `act(hotspotId)` (same as pressing E on it; returns false + logs why when not possible) · `trigger(eventId)` · `setTime("03:00")` (forward only) · `setHaunt(n)` · `plan()` · `on(type, cb)` (`"*"` = all)
- `log` rows `{tReal ms since load, tGame "HH:MM", type, id, detail}`; types: `event_start` (detail.real, detail.forced) `warn` `window_open` `correct` `violate` `outcome` (detail.outcome minor|scare|death) `fakeout` `env_change` `view` `act` `ending` `info` (`jumpscare`, `night_start`, `peep_stare`, `sighting` = safe-play ghost in the kitchen doorway, `name_seen` = 407 SMS with the player's name, `dropped: ...` = a fake-out skipped because it clashed with a real rule) `todo`
- `audioLog` rows `{tReal, id, file, gain, pan, lowpass, action: play|stop|loop|set, tag}` — `set` = a playing loop was re-placed (player moved / gain change) with the new values; `id: "bus:ambient"` = the ambient bus level (0 = the deliberate silence).
  File = `audio/sfx/<id>.mp3` or `audio/voice/<id>.mp3` (ids starting `v:`).

Hotspot ids: `door_open peephole` (door) · `tv_off light` (living) · `curtain_open light` (bedroom) · `light` (kitchen) · `mirror_look light` (bath) · `phone_view phone_answer phone_decline` (anywhere; answer is armed 5 s after the warn).
Keys: E / Enter = act on focused label (hover or Tab to focus) · arrows / WASD = rooms · Q = phone · R = decline call · click / tap a label = act.

## Docker / self-hosting
`pnpm build` (writes client/dist), then `docker build -t try-ghost .` and `docker compose -f deploy/compose.yml up -d` (serves the game on port 8201, `/health` for checks). The image copies client/dist; no npm install inside docker.
The headless playwright test helpers used during development are not included in this repository.
