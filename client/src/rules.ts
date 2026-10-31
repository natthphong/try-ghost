// Rules as data: paper text (bible §2), event ids, which are real rules vs fake-outs.
export const RULES_PAGE1 = [
  "ถ้าได้ยินเสียงเคาะประตู 3 ครั้ง ห้ามเปิดประตู จนกว่าจิ้งจกจะร้อง",
  "ถ้าทีวีเปิดเองหลังตีหนึ่ง ต้องปิดภายใน 7 วินาที",
  "ถ้ามีคนเรียกจากหน้าต่างห้องนอน ห้ามเปิดม่าน ต่อให้เป็นเสียงคนที่คุณรู้จัก",
  "ถ้าได้ยินเสียงลากเก้าอี้ในครัว ต้องกลับเข้าห้องนอนภายใน 8 วินาที",
  "ถ้าไฟในห้องน้ำเปลี่ยนเป็นสีแดง ห้ามมองกระจก",
  "ถ้าได้ยินเสียงหัวเราะใต้เตียง ต้องปิดไฟแล้วรอให้เงียบ",
];
export const RULES_FOOT = "อยู่ให้ถึงตีห้า แล้วป้าจะมาเปิดประตูให้เอง · ค่าเช่าคืนละ 399 บาท";
export const RULES_PAGE2 = [
  "ถ้าโทรศัพท์ดัง แล้วขึ้นเบอร์ 407 อย่ารับ นั่นคือเบอร์ของบ้านหลังนี้",
  "ถ้าได้ยินเสียงไขกุญแจ ให้รีบคล้องโซ่ประตู",
  "ไฟดับ เบรกเกอร์อยู่ในครัว อย่าอยู่ในความมืดนาน",
  "ป้าไม่เคยมาก่อนตีห้า ดูนาฬิกาก่อนเปิดประตู",
];
export const RULES_SIGN = "— ผู้เช่าคนก่อน";

export const REAL = ["knock", "tv", "window", "chair", "redlight", "giggle", "call407", "key_lock"] as const;
export const PAGE1 = ["knock", "tv", "window", "chair", "redlight", "giggle"];
export const BACK = ["call407", "key_lock", "false_dawn", "final"];
export const TASKS = ["blackout", "overflow"] as const;
export const ODD = ["wall_knock", "follow_steps", "bed_taken", "cat_cry"] as const;
export const FAKES = ["f_knock2", "f_call_mom", "f_tvstatic", "f_roof", "f_howl", "f_silence", "f_shrine", "f_peep"] as const;
export const ALL_IDS = [...REAL, "final", "false_dawn", ...FAKES, ...TASKS, ...ODD];
export type EventId = (typeof ALL_IDS)[number];
export const isReal = (id: string) => (REAL as readonly string[]).includes(id) || id === "final" || id === "false_dawn";
export const kindOf = (id: string) => (isReal(id) ? "rule" : (TASKS as readonly string[]).includes(id) ? "task" : (ODD as readonly string[]).includes(id) ? "odd" : "fake");

// where the warning sound comes from (for logs / qa)
export const SOURCE: Record<string, string> = {
  knock: "door", tv: "living", window: "bedroom", chair: "kitchen", redlight: "bath", giggle: "bedroom", call407: "self", final: "door",
  f_knock2: "door", f_call_mom: "self", f_tvstatic: "living", f_roof: "roof", f_howl: "outside", f_silence: "all", f_shrine: "living", f_peep: "door",
};
// house changes (bible §6) in the order the director hands them out
export const CHANGES = ["slippers_turned", "living_chair", "kitchen_chair", "garland_wilt"] as const;
export const CHANGE_ROOM: Record<string, string> = { slippers_turned: "bedroom", living_chair: "living", kitchen_chair: "kitchen", garland_wilt: "door" };
