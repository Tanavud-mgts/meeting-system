# Track D (sub-project 7, ส่วนสุดท้าย) — First-time Setup Wizard (`/setup`)

## บริบท

ต่อจาก Track D sub-project 1-6 (rooms/users/settings, bookings list+direct-cancel, activity log, dashboard overview, data management, integration health — เสร็จแล้วในเวิร์กทรีเดียวกัน) — sub-project นี้เป็น**ส่วนสุดท้ายของ Track D** สร้างหน้า `/setup` ตาม `docs/PRODUCT.md` ("First-time Setup Wizard (4 ขั้นตอน: intro → เพิ่มห้อง → Approval Chain → business hours)")

**ข้อมูลสำคัญที่ยืนยันแล้วจากการสำรวจ schema:**
- `system_config` มีคอลัมน์ `setup_completed boolean NOT NULL DEFAULT false` (migration 003) — ออกแบบมาเป็น guard สำหรับ wizard นี้โดยเฉพาะอยู่แล้ว
- Edge Function `update-approval-chain` (สร้างใน sub-project 1) รับ `{ admin_id, approver1_id, approver2_id, office_start_hour, office_end_hour, holidays }` ครบในคำขอเดียวอยู่แล้ว — ครอบคลุมทั้งขั้นตอน 3 (Approval Chain) และ 4 (Business Hours) โดยไม่ต้องแก้ไข
- ตาราง `rooms` มี RLS policy `"rooms: admin write"` (`FOR INSERT WITH CHECK (auth_role() = 'admin')`) — Admin insert ห้องตรงจาก client ได้เลย ไม่ต้องผ่าน Edge Function (ตรงกับที่ `/dashboard/rooms` ทำอยู่แล้ว)
- Seed data (`014_seed_data.sql`) ตั้ง `setup_completed = true` เสมอ — หมายความว่าพฤติกรรม auto-redirect ของ wizard **ทดสอบแบบ end-to-end ในเซสชันนี้ไม่ได้** (ไม่มี Supabase MCP/execute_sql ให้ flip ค่าเป็น false)

## ขอบเขต

**อยู่ในขอบเขตนี้:**
- หน้า `/setup` — wizard 4 ขั้นตอน (intro → เพิ่มห้อง → Approval Chain → business hours)
- Edge Function ใหม่ `complete-setup` — ตั้ง `system_config.setup_completed = true`
- แก้ไข `lib/supabase/middleware.ts` — เพิ่มเงื่อนไข auto-redirect ไป `/setup` เมื่อ role เป็น admin และ `setup_completed=false` และพยายามเข้า `/dashboard/*`

**ไม่อยู่ในขอบเขตนี้:**
- แก้ไข Edge Function `update-approval-chain` — ใช้ตามเดิมโดยไม่แก้ไข (ทดสอบแล้วผ่านใน sub-project 1)
- บังคับ redirect สำหรับ role อื่น (`user`/`approver`) หรือหน้าอื่นนอก `/dashboard/*` — เจตนาจำกัดผลกระทบของ middleware change

## สถาปัตยกรรม / Components

### 1. หน้า `/setup`

Client component เดียว จัดการ 4 ขั้นตอนด้วย local state (`step: 1 | 2 | 3 | 4`) — ข้อมูลจากขั้นตอน 3 และ 4 เก็บไว้ใน state จนกว่าจะกด "เสร็จสิ้น" ที่ขั้นตอน 4 (ไม่ submit ทีละขั้นตอน เพราะ `update-approval-chain` ต้องการข้อมูลครบทั้งสองส่วนในคำขอเดียว)

**Progress indicator:** ข้อความ "ขั้นตอน X / 4" (ไม่ทำ progress bar กราฟิก — YAGNI)

**ขั้นตอน 1 — Intro:** ข้อความอธิบาย wizard สั้นๆ ปุ่ม "เริ่มต้น" ไปขั้นตอน 2

**ขั้นตอน 2 — เพิ่มห้อง:**
- Query `rooms` ตรงแสดงรายชื่อห้องที่มีอยู่แล้ว (ถ้ามี)
- ฟอร์ม quick-add: `name` (text) + `capacity` (number) — insert ตรงเข้า `rooms` table ผ่าน client (`status`/`equipment` ใช้ default ของ DB)
- ปุ่ม "ถัดไป" disabled จนกว่าจำนวนห้องรวม (มีอยู่แล้ว + เพิ่มใหม่ในเซสชันนี้) ≥ 1

**ขั้นตอน 3 — Approval Chain:**
- โหลดค่าปัจจุบันจาก `system_config` (query ตรง) มา prefill dropdown ทั้ง 3 ช่อง
- Dropdown เลือกจากตาราง `users`: `admin_id` filter `role='admin'`, `approver1_id`/`approver2_id` filter `role IN ('approver','admin')`
- เก็บค่าที่เลือกไว้ใน local state เท่านั้น ยังไม่ submit

**ขั้นตอน 4 — Business Hours:**
- โหลดค่าปัจจุบันจาก `system_config` มา prefill (`office_start_hour`, `office_end_hour`, `holidays`)
- ฟอร์ม: office_start_hour/office_end_hour (number input), holidays (textarea คอมมาคั่นวันที่ รูปแบบเดียวกับ `/dashboard/settings`)
- ปุ่ม "เสร็จสิ้น": เรียก `update-approval-chain` ด้วยข้อมูลรวมจากขั้นตอน 3+4 → สำเร็จแล้วเรียก `complete-setup` → สำเร็จแล้ว `router.push("/dashboard")`

### 2. Edge Function `complete-setup`

- Method: POST, `verify_jwt=true`, ไม่มี request body
- Logic: หา identity + ตรวจ role เป็น `admin` เท่านั้น (dual-client pattern เดียวกับทุก Edge Function ในโปรเจกต์) → ดึง `system_config.id` (แถวเดียว) → `UPDATE system_config SET setup_completed = true WHERE id = <id>` → คืน `{ success: true }`
- แยกจาก `update-approval-chain` ตามหลัก "หนึ่ง Edge Function ทำหนึ่งอย่าง" ที่ยึดมาตลอดโปรเจกต์ — ไม่แก้ไข Edge Function เดิมที่ทดสอบผ่านแล้ว

### 3. แก้ไข `lib/supabase/middleware.ts`

เพิ่มเงื่อนไขต่อจากจุดที่ตรวจ `requiredRoles`/`profile.role` ที่มีอยู่แล้ว (เฉพาะกรณี pathname ตรงกับ prefix `/dashboard` และ role เป็น `admin`):

```
ถ้า profile.role === 'admin' และ pathname.startsWith('/dashboard'):
  query system_config.setup_completed
  ถ้า query สำเร็จ และ setup_completed === false:
    redirect ไป /setup
  ถ้า query ล้มเหลวหรือไม่พบแถว:
    ไม่ redirect (fail-open — ไม่ให้ query เดียวพังทั้งแอป)
```

**ขอบเขตจำกัด:** ตรวจเฉพาะ `/dashboard/*` เท่านั้น ไม่บังคับกับ `/home`/`/booking`/`/calendar`/`/profile`/`/approver` เพื่อไม่ให้กระทบ role อื่นและไม่เพิ่ม query โดยไม่จำเป็นในหน้าที่ role อื่นเข้าบ่อย

## Data Flow

```
Admin เข้า /setup
  → ขั้นตอน 2: query rooms (แสดงรายการ) + insert rooms (quick-add)
  → ขั้นตอน 3: query system_config (prefill) + query users (dropdown options)
  → ขั้นตอน 4: query system_config (prefill)
  → กด "เสร็จสิ้น": fetch update-approval-chain (chain+hours รวมกัน) → fetch complete-setup → router.push("/dashboard")

Admin ที่ setup_completed=false เข้า /dashboard/* หน้าไหนก็ตาม
  → middleware query system_config.setup_completed → redirect ไป /setup
```

## Error Handling

| กรณี | การจัดการ |
|---|---|
| ผู้เรียก `complete-setup` ไม่ใช่ admin | `ForbiddenError("ท่านไม่มีสิทธิ์ดำเนินการนี้")` |
| ไม่พบ session | `UnauthorizedError("ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่")` |
| `fetch()` ไป Edge Function ล้มเหลว (network) | try/catch/finally ตาม Global Constraint มาตรฐาน — แสดงข้อความ "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" ปุ่ม "เสร็จสิ้น" กดซ้ำได้ (idempotent ทั้งสอง Edge Function) |
| Query `system_config` ใน middleware ล้มเหลว | fail-open ไม่ redirect บังคับ |
| ห้องยังไม่มีเลย (ขั้นตอน 2) | ปุ่ม "ถัดไป" disabled ไม่ error |

## Testing (Success Criteria)

1. `npx tsc --noEmit` และ `npm run build` ผ่าน, route list มี `/setup`
2. Login `admin@test.local` เข้า `/setup` ตรงๆ ทาง URL เห็นขั้นตอน 1 (intro)
3. นำทางไปขั้นตอน 2 — เห็นรายชื่อห้องที่มีอยู่แล้ว (จาก seed data), ปุ่ม "ถัดไป" enabled ทันทีเพราะมีห้องอยู่แล้ว
4. เพิ่มห้องใหม่ผ่าน quick-add form ในขั้นตอน 2 → เห็นห้องใหม่ปรากฏในรายการทันที
5. นำทางไปขั้นตอน 3 — เห็น dropdown prefill ด้วยค่าเดิมจาก seed data (admin@test.local, approver1@test.local, approver2@test.local)
6. นำทางไปขั้นตอน 4 — เห็นค่า business hours prefill ตรงกับ seed data (8, 17)
7. กด "ย้อนกลับ" จากขั้นตอน 4 กลับไปขั้นตอน 3 → ค่าที่เลือกไว้ยังอยู่ (state ไม่หาย)
8. Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/setup` ตรงๆ ทาง URL → ถูก middleware บล็อก redirect ไป `/home` (prefix `/setup` มีอยู่แล้วใน ROUTE_ROLES จาก sub-project ก่อนหน้า)
9. **ทดสอบไม่ได้ในเซสชันนี้ (deferred ให้ผู้ใช้หลัง deploy):** ทดสอบ auto-redirect จริงโดย flip `system_config.setup_completed = false` แล้วเข้า `/dashboard` ด้วย admin ควรถูก redirect ไป `/setup` อัตโนมัติ, ทดสอบกด "เสร็จสิ้น" จริงหลัง deploy `complete-setup` และ `update-approval-chain` (deploy แล้วจาก sub-project 1) → ตรวจว่า redirect ไป `/dashboard` และ `setup_completed` กลายเป็น `true` จริง
