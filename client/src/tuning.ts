// Every number from team/horror-bible.md lives here (change values, not logic).
export const T = {
  SEC_PER_GAME_MIN: 1.2, // 1 game hour = 72 s at speed 1 (00:00-05:00 = 6:00)
  FINAL_SEC_PER_GAME_MIN: 12, // 04:58 -> 05:00 stretched to 24 s so the final knock has room to breathe
  NIGHT_END_MIN: 300,
  FIRST_RULE_MIN: 50, // 00:50
  TV_AFTER_MIN: 60, // tv only after 01:00
  CALL_AFTER_MIN: 120, // call407 after 02:00
  GUARANTEE_BEFORE_MIN: 240, // every rule + call407 at least once before 04:00
  QUIET_FROM_MIN: 285, // 04:45-04:57 nothing happens
  FINAL_MIN: 298, // 04:58
  CHANGES_FROM_MIN: 90, // house changes start 01:30
  // start-to-start gap between real rules (seconds, speed 1) + fake-out share, per phase
  PHASES: [
    { from: 50, to: 120, gap: [36, 46] as [number, number], fake: 0.3 },
    { from: 120, to: 210, gap: [26, 34] as [number, number], fake: 0.35 },
    { from: 210, to: 285, gap: [18, 26] as [number, number], fake: 0.4 },
  ],
  FAKE_SHARE: 0.36, // fake-outs / all events (bible: 30-40%)
  DEFER_SEC: 5, // room condition not met -> retry after
  DEFER_MAX_SEC: 20, // then fire anyway (logged detail "forced")
  GRACE_SEC: 5, // no violation can land < 5 s after the warn
  HOWL_OMEN_P: 0.7, // 02:00+: howl followed by a real rule
  // rule windows (s)
  KNOCK_WINDOW: [10, 14] as [number, number],
  TV_WINDOW: 7,
  WINDOW_WINDOW: [10, 12] as [number, number],
  CHAIR_WINDOW: 8, CHAIR_HOLD: 6,
  RED_WINDOW: [12, 15] as [number, number],
  GIGGLE_WINDOW: 6, GIGGLE_DARK: 8,
  CALL_WINDOW: 10,
  // scares
  SCARE_MS: 600,
  SCARE_COOLDOWN_SEC: 90,
  PEEP_STARE_SEC: 3,
  SILENCE_SEC: [3, 4] as [number, number],
  // audio distance (dB / lowpass Hz) for 0, 1, 2+ rooms away
  DIST_DB: [0, -8, -16],
  DIST_LP: [20000, 2000, 800],
  // look
  DARK_BRIGHTNESS: 0.55, // bible says 0.25; on these already-dark plates 0.25 reads as pure black (QA M1), so 0.55 + moon tint
  GRAIN_OPACITY: 0.05,
};
