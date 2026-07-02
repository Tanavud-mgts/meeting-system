# Track B — อนุมัติการจอง (`/approver`, `/approver/history`)

## บริบท

Track ที่สองจาก 4 track ที่ทำขนานกันในแต่ละ worktree หลัง Foundation phase เสร็จ (middleware role-gated, layout ร่วม, `_shared/` modules) — สร้างกลไกอนุมัติจริงตาม Global Approval Chain (Admin → Approver1 → Approver2) ที่กำหนดไว้ใน `docs/PRODUCT.md` ส่วนที่ 2 และล็อกไว้ใน Architecture Decisions ของ CLAUDE.md (chain เดียวทุกห้อง ไม่มีข้อยกเว้น)

Track A (worktree แยกต่างหาก ยังไม่ merge เข้า main) สร้าง `/booking` + `create-booking` ที่ทำให้เกิด booking สถานะ `pending`, `current_step=0` — เป็นจุดเริ่มต้นของ chain ที่ track นี้จะทำงานต่อ

## ขอบเขต

**อยู่ในขอบเขตนี้:**
- `supabase/functions/_shared/processApproval.ts` — โมดูลกลางตาม CLAUDE.md กฎข้อ 2 (ห้ามเขียน approval logic ซ้ำที่อื่น)
- `supabase/functions/approve-booking/index.ts`
- หน้า `/approver` — คิวรออนุมัติของตัวเอง
- หน้า `/approver/history` — ประวัติการอนุมัติของตัวเองเท่านั้น

**ไม่อยู่ในขอบเขตนี้ (เก็บไว้ให้ track/รอบถัดไป):**
- LINE postback (`line-webhook` Edge Function, `approval_tokens` table) — ทุกฟีเจอร์ต้องทำงานบนเว็บได้ 100% อยู่แล้วตาม CLAUDE.md จึงเริ่มจากเว็บก่อน
- `/approver/cancel-requests` — แยกไป Track C (เป็นเรื่อง cancellation ไม่ใช่ approval)
- Make.com webhook เรียกจริง / สร้าง Google Calendar event จริง — เขียน extension point ไว้ในโค้ดแต่ยังไม่เรียก
- `/dashboard/reports` — เป็นหน้ารายงาน ไม่ใช่ approval mechanics

## สถาปัตยกรรม / Components

### 1. `supabase/functions/_shared/processApproval.ts` (โมดูลกลางใหม่)

Signature: `processApproval(client, { bookingId, step, approverId, action, note })`

รับ Supabase client (service_role, dependency injection ตาม pattern เดียวกับ `logIntegration()` ที่มีอยู่แล้ว) เพื่อให้ไฟล์นี้ไม่ผูกกับ `@supabase/supabase-js` โดยตรง

Logic:
1. ดึง booking ปัจจุบัน (`final_status`, `current_step`) — ถ้าไม่พบ throw `NotFoundError`
2. ถ้า `final_status !== 'pending'` → throw `ConflictError("คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติแล้ว")` (มีคนจัดการไปแล้ว หรือ user ยกเลิกไปแล้ว)
3. ถ้า `current_step !== step - 1` → throw `ForbiddenError("ไม่ใช่คิวของท่านในขณะนี้")` (ยังไม่ถึงคิว หรือมีคนอนุมัติ step ก่อนหน้าไปแล้วระหว่างที่กำลังโหลดหน้า)
4. INSERT เข้า `approval_logs (booking_id, approver_id, step, action, note)` — ถ้าเกิด unique constraint violation (`23505` บน `UNIQUE(booking_id, step)`) → throw `ConflictError("มีการดำเนินการนี้ไปแล้ว")` — **นี่คือกลไกกัน race condition ทั้งหมดของ track นี้** ไม่สร้างหรือแตะ `approval_tokens` เลย (เก็บไว้ให้ LINE track ใช้ในอนาคต)
5. ถ้า `action === 'rejected'` → UPDATE `bookings SET final_status = 'rejected' WHERE id = bookingId` (จบ chain ทันทีตาม PRODUCT.md — ไม่แตะ `current_step`)
6. ถ้า `action === 'approved'` และ `step < 3` → UPDATE `bookings SET current_step = step WHERE id = bookingId`
7. ถ้า `action === 'approved'` และ `step === 3` → UPDATE `bookings SET current_step = 3, final_status = 'approved' WHERE id = bookingId` แล้วเรียกฟังก์ชัน stub `triggerCalendarSync(booking)` ที่ยังไม่ทำอะไรจริง (มี comment ชัดเจนว่าเป็น extension point สำหรับ Make.com ในอนาคต) — **ไม่เรียก `logIntegration()` ตรงจุดนี้** เพราะยังไม่มีการเรียก external service จริง การ log ว่า "success" ทั้งที่ไม่ได้เรียกอะไรเลยจะผิดตามเจตนาของกฎข้อ 5

### 2. `supabase/functions/approve-booking/index.ts`

- Method: POST, `verify_jwt=true`
- Request body: `{ booking_id: string, action: 'approved' | 'rejected', note?: string }`
- Logic:
  1. หา identity ผู้เรียกผ่าน `auth.getUser()` (pattern เดียวกับ `create-booking` ใน Track A — anon-key client แยกจาก service-role client)
  2. ดึง `system_config` (`admin_id`, `approver1_id`, `approver2_id`) ด้วย service-role client
  3. เทียบ `user.id` กับทั้งสามฟิลด์ เพื่อหาว่าผู้เรียกคือ step ไหน (`admin_id` → step 1, `approver1_id` → step 2, `approver2_id` → step 3) — ถ้าไม่ตรงกับฟิลด์ไหนเลย throw `ForbiddenError("ท่านไม่ได้อยู่ใน Approval Chain")`
  4. เรียก `processApproval(adminClient, { bookingId: body.booking_id, step, approverId: user.id, action: body.action, note: body.note })`
  5. สำเร็จ → คืน `{ booking_id, step, action, current_step, final_status }` (state ล่าสุดของ booking หลังอัปเดต)

### 3. หน้า `/approver` — คิวรออนุมัติ

Query ตรงจาก Supabase browser client (RLS อนุญาต `approver`/`admin` อ่าน `system_config` ตรงอยู่แล้ว — ต่างจาก Track A ที่ user ธรรมดาอ่านไม่ได้ จึงไม่ต้องมี Edge Function สำหรับอ่าน config ใน track นี้):

1. Query `system_config` หา step ของ user ปัจจุบัน (เทียบ `auth.uid()` กับ `admin_id`/`approver1_id`/`approver2_id`)
2. Query `bookings` (join `rooms`, `users` เพื่อแสดงรายละเอียด) `WHERE final_status = 'pending' AND current_step = (step ของตัวเอง - 1)` เรียงตาม `created_at ASC` (เก่าสุดก่อน)
3. คำนวณ `waiting_minutes` ฝั่ง client จาก `created_at` — การ์ดที่รอนานเกิน 2 ชั่วโมง (120 นาที) ใช้ style `card-urgent` (ขอบเหลือง) ตาม `docs/DESIGN.md`
4. ปุ่มอนุมัติ/ปฏิเสธต่อการ์ด → เปิด dialog confirm (ตาม DESIGN.md pattern) → เรียก `approve-booking`

### 4. หน้า `/approver/history`

Query ตรงจาก client: `approval_logs WHERE approver_id = auth.uid()` (join `bookings` เพื่อแสดง `ref_id`/`title`) เรียงตาม `acted_at DESC` — เฉพาะของตัวเองเท่านั้นตาม PRODUCT.md ("ดูประวัติการทำงานของตัวเองเท่านั้น (ไม่เห็นของคนอื่น)") ไม่ใช้ `staff_activity_timeline` view เพราะ view นั้นรวม cancellation events ด้วยซึ่งเป็นของ Track C

## Data Flow

```
Approver เปิด /approver
  → query system_config หา step ของตัวเอง
  → query bookings ที่ current_step ตรงกับคิวตัวเอง
  → แสดงการ์ด (urgent ถ้ารอ >2 ชม.)

กดอนุมัติ/ปฏิเสธ → confirm dialog → เรียก approve-booking
  → หา step จาก system_config เทียบ JWT
  → processApproval() ตรวจ+บันทึก+อัปเดต state
  → สำเร็จ: การ์ดหายจากคิว (step ถัดไปหรือจบ chain)
  → ล้มเหลว (ConflictError จากการกดซ้ำ/คนอื่นอนุมัติไปก่อน): แสดงข้อความ รีเฟรชคิว
```

## Error Handling สรุป

| กรณี | Error Class | ข้อความ |
|---|---|---|
| ไม่พบ booking | `NotFoundError` | "ไม่พบคำขอนี้" |
| booking ไม่ได้อยู่สถานะ pending แล้ว | `ConflictError` | "คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติแล้ว" |
| ยังไม่ถึงคิวของตัวเอง (current_step ไม่ตรง) | `ForbiddenError` | "ไม่ใช่คิวของท่านในขณะนี้" |
| ผู้เรียกไม่ได้อยู่ใน Approval Chain เลย | `ForbiddenError` | "ท่านไม่ได้อยู่ใน Approval Chain" |
| อนุมัติ step เดิมซ้ำ (unique constraint 23505) | `ConflictError` | "มีการดำเนินการนี้ไปแล้ว" |

## Testing (Success Criteria)

1. `npx tsc --noEmit` และ `npm run build` ผ่าน (สำหรับไฟล์ frontend — Edge Functions ยังคง verify ด้วย manual review เท่านั้น เหมือน Track A เพราะไม่มี Deno CLI/Supabase CLI/MCP)
2. Login เป็น `admin@test.local` เปิด `/approver` → เห็นเฉพาะ booking ที่ `current_step=0` (จาก seed data — Booking 1 "ทดสอบ ประชุมคณะกรรมการ" ตรงเงื่อนไขนี้)
3. Login เป็น `approver1@test.local` เปิด `/approver` → ไม่เห็น Booking 1 (ยังไม่ถึงคิว current_step ต้องเป็น 1)
4. Admin กดอนุมัติ Booking 1 → `current_step` เป็น 1, การ์ดหายจากคิว admin
5. Login เป็น `approver1@test.local` อีกครั้ง → เห็น Booking 1 แล้ว (current_step=1 ตรงคิว)
6. ทดสอบกดอนุมัติซ้ำ 2 ครั้งติดกันเร็วๆ (จำลอง double-click) → ครั้งที่สองต้องได้ `ConflictError` ไม่ใช่การอนุมัติซ้อนกัน 2 รอบ (ตรวจใน DB ว่า `approval_logs` มีแค่ 1 แถวต่อ step)
7. ปฏิเสธที่ step ใดก็ตาม → `final_status = 'rejected'` ทันที ไม่มี approver ถัดไปเห็นคำขอนี้ในคิวอีก
8. `/approver/history` ของ `admin@test.local` แสดงเฉพาะการกระทำของ admin เอง ไม่เห็นของ approver1/approver2
