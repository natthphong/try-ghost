# try-ghost

**บ้านเช่าหลังสุดท้าย (THE LAST TENANT)** — เกมผีไทยเอาชีวิตรอดบนเว็บ คุณเช่าบ้านไม้เก่าหนึ่งคืน เจ้าของบ้านให้กุญแจพร้อมกระดาษกฎของบ้าน ต้องทำตามกฎให้ถูกจนถึงเช้า เกมนี้สร้างโดย Claude (AI agents) ภายในประมาณ 2 ชั่วโมง

A Thai ghost survival game for the browser. You rent an old house for one night; the landlady hands you the keys and a sheet of house rules. Follow the rules until dawn. Built by Claude (AI agents) in about 2 hours.

## เล่นได้ที่ / Play

https://natthphong.github.io/try-ghost/

เล่นแนวนอน ใส่หูฟัง (เกมนี้หลอนด้วยเสียง) · Play in landscape with headphones (the scares are mostly sound).

## วิธีเล่น / How to play

- อ่านกฎให้ครบทั้ง 2 หน้าก่อนกด "จำได้แล้ว ปิดไฟนอน" — กฎอ่านได้เฉพาะก่อนคืนเริ่มเท่านั้น หลังปิดไฟจะกลับไปเปิดกระดาษไม่ได้อีก
- `E` / `Enter` = ทำสิ่งที่ป้ายบอก (ชี้เมาส์หรือกด Tab เพื่อเลือกป้าย) · `←` `→` หรือ `A` `D` = เดินไปห้องอื่น · `Q` = ดูโทรศัพท์ · `R` = ตัดสาย
- มือถือ / แท็บเล็ต: แตะป้ายบนจอแทนการกดปุ่ม

- Read both pages of the rules before you press the sleep button. The rules can only be read before the night starts; once the lights are off the paper is gone.
- `E` / `Enter` acts on the focused label (hover or Tab to focus) · arrow keys or `A` / `D` move between rooms · `Q` opens the phone · `R` declines a call.
- On touch screens, tap the labels.

## รันในเครื่อง / Run locally

Requires Node.js 22+ and pnpm (or `corepack enable`).

```sh
pnpm install
pnpm dev        # dev server at http://localhost:5190/
pnpm build      # static build in client/dist (relative paths, works under any sub-path)
```

`client/dist` is plain static files; serve it with any static web server. A tiny zero-dependency Node server plus a Dockerfile are included for self-hosting (`server/`, `Dockerfile`, `deploy/compose.yml`). URL parameters for testing are listed in `docs/DEBUG.md`.

## Deploy

GitHub Pages serves the `gh-pages` branch, which holds only the contents of `client/dist`.

## Credits

- Sound effects: [Mixkit](https://mixkit.co/) (Mixkit Free License), [Kenney](https://kenney.nl/) audio packs (CC0), and original procedural sounds made for this game (CC0).
- Voices: designed locally with VoxCPM2 (Apache-2.0); no real person's voice was cloned.
- Fonts: Sarabun, Charm, Mitr from Google Fonts (SIL Open Font License 1.1).
- Images: AI-generated with Codex for this game.

Full per-file list: [assets/CREDITS.md](assets/CREDITS.md).
