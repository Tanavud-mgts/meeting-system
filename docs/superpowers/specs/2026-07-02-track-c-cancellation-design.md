# Track C — ยกเลิกการจอง (`/profile/bookings`, `/approver/cancel-requests`)

## บริบท

Track ที่สามจาก 4 track ที่ทำขนานกันในแต่ละ worktree หลัง Foundation phase เสร็จ (middleware role-gated, layout ร่วม, `_shared/` modules) — สร้างกลไกยกเลิกการจองจริงตามกฎที่ล็อกไว้ใน CLAUDE.md ("Cancellation Rules: pending ยกเลิกได้ทันทีโดย User เจ้าของ / approved ต้องขออนุมัติจาก Admin / Admin-Approver ยกเลิกได้ทันทีไม่ต้องขอใคร") และ `docs/PRODUCT.md` ส่วนที่ 3 (Booking States)

Track A (worktree แยก ยังไม่ merge) สร้าง `/booking` + `create-booking`, Track B (worktree แยก ยังไม่ merge) สร้าง approval chain — booking ที่ผ่าน chain ครบจะมี `final_status='approved'` พร้อม `gcal_event_id` (จาก stub `triggerCalendarSync` ของ Track B) เป็นจุดเริ่มต้นที่ track นี้ทำงานต่อ

## ขอบเขต

**อยู่ในขอบเขตนี้:**
- `supabase/functions/_shared/processCancellation.ts` — โมดูลกลาง export 2 ฟังก์ชัน: `requestCancellation()` (ฝั่ง User) และ `decideCancellation()` (ฝั่ง Admin/Approver)
- `supabase/functions/request-cancellation/index.ts`
- `supabase/functions/decide-cancellation/index.ts`
- หน้า `/profile/bookings` — ประวัติการจองของ User เอง + ปุ่มยกเลิก/ขอยกเลิก
- หน้า `/approver/cancel-requests` — คิวคำขอยกเลิกของ Admin/Approver

**ไม่อยู่ในขอบเขตนี้ (เก็บไว้ให้ track/รอบถัดไป):**
- **Direct-cancel-anytime ของ Admin/Approver** ("ยกเลิกการจองใดๆ ได้ทันทีโดยไม่ต้องขออนุมัติจากใคร") — ไม่มีหน้าใน Track C ที่ใช้งาน UI นี้ (อยู่ที่ `/dashboard/bookings` ซึ่งเป็นขอบเขต Track D) จึงไม่สร้าง backend function ล่วงหน้าตาม YAGNI — Track D จะสร้างเองตอนมีหน้ารองรับจริง
- LINE postback สำหรับคำขอยกเลิก — เหมือน Track B ทุกฟีเจอร์ต้องทำงานบนเว็บได้ 100% อยู่แล้ว
- Make.com webhook เรียกจริงเพื่อลบ Google Calendar Event — เขียน stub `triggerCalendarDelete()` ไว้ (extension point) แต่ยังไม่เรียกจริง เหมือน `triggerCalendarSync()` ของ Track B
- `/dashboard/bookings` (Admin ดูรายการจองทั้งหมด) — ขอบเขต Track D

## สถาปัตยกรรม / Components

### 1. `supabase/functions/_shared/processCancellation.ts` (โมดูลกลางใหม่)

แยกเป็น 2 ฟังก์ชันตาม "ใครเป็นคนกด" แทนที่จะรวมเป็นฟังก์ชันเดียวแบบ `processApproval()` — เพราะ precondition และผลลัพธ์ (ตารางที่บันทึก, เงื่อนไขสถานะตั้งต้น) ต่างกันมากระหว่างฝั่ง user กับฝั่ง staff แยกฟังก์ชันจะอ่านง่ายและทดสอบแยกส่วนได้ชัดกว่า

#### `requestCancellation(client, { bookingId, requesterId, reason })`

รับ Supabase client (service_role, dependency injection ตาม pattern เดียวกับ `processApproval()`)

Logic:
1. ดึง booking ปัจจุบัน (`final_status`, `requester_id`) — ถ้าไม่พบ throw `NotFoundError("ไม่พบรายการจองนี้")`
2. ถ้า `reason` ว่างหรือเป็นแค่ whitespace → throw `ValidationError("กรุณากรอกเหตุผลการยกเลิก")`
3. ถ้า `booking.requester_id !== requesterId` → throw `ForbiddenError("ท่านไม่มีสิทธิ์ยกเลิกรายการนี้")`
4. ถ้า `final_status === 'pending'`:
   - `UPDATE bookings SET final_status='cancelled' WHERE id=bookingId AND final_status='pending'`
   - ถ้าอัปเดตได้ 0 แถว → throw `ConflictError("รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า")` (race guard ตาม CLAUDE.md กฎข้อ 6 — atomic UPDATE พร้อมเงื่อนไข WHERE เดิม)
   - `INSERT INTO cancellation_logs (booking_id, cancelled_by, role, prev_status, reason) VALUES (bookingId, requesterId, 'user', 'pending', reason)`
5. ถ้า `final_status === 'approved'`:
   - `UPDATE bookings SET final_status='cancel_requested', cancellation_reason=reason WHERE id=bookingId AND final_status='approved'`
   - ถ้าอัปเดตได้ 0 แถว → throw `ConflictError(...)` เดียวกัน
   - **ไม่ insert `cancellation_logs`** — ยังไม่มีอะไรถูกยกเลิกจริง แค่ส่งคำขอ (`cancellation_logs` มีไว้บันทึกเฉพาะการยกเลิกที่เกิดขึ้นจริงเท่านั้น)
6. สถานะอื่น (`rejected`, `cancelled`, `cancelled_by_admin`, `cancel_requested`) → throw `ConflictError("รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า")` (ไม่ใช่สถานะที่ขอยกเลิกได้)

Return: `{ bookingId, newStatus: 'cancelled' | 'cancel_requested' }`

#### `decideCancellation(client, { bookingId, deciderId, role, decision })`

`decision: 'approve' | 'reject'`, `role: 'admin' | 'approver'` (ของผู้ตัดสินใจ ใช้บันทึกลง log)

Logic:
1. ดึง booking ปัจจุบัน (`final_status`, `cancellation_reason`) — ถ้าไม่พบ throw `NotFoundError("ไม่พบรายการจองนี้")`
2. ถ้า `decision` ไม่ใช่ `'approve'`/`'reject'` → throw `ValidationError("การกระทำไม่ถูกต้อง")`
3. ถ้า `final_status !== 'cancel_requested'` → throw `ConflictError("รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า")`
4. ถ้า `decision === 'approve'`:
   - `UPDATE bookings SET final_status='cancelled' WHERE id=bookingId AND final_status='cancel_requested'`
   - ถ้าอัปเดตได้ 0 แถว → throw `ConflictError(...)`
   - `INSERT INTO cancellation_logs (booking_id, cancelled_by, role, prev_status, reason) VALUES (bookingId, deciderId, role, 'cancel_requested', booking.cancellation_reason)` — ใช้เหตุผลเดิมของ User ที่เก็บไว้ตอนส่งคำขอ
   - เรียก `triggerCalendarDelete(bookingId)` — stub เหมือน `triggerCalendarSync()` ของ Track B **ไม่เรียก `logIntegration()`** เพราะยังไม่มีการเรียก external service จริง
5. ถ้า `decision === 'reject'`:
   - `UPDATE bookings SET final_status='approved' WHERE id=bookingId AND final_status='cancel_requested'`
   - ถ้าอัปเดตได้ 0 แถว → throw `ConflictError(...)`
   - `INSERT INTO activity_logs (actor_id, action, target_type, target_id, detail) VALUES (deciderId, 'reject_cancel_request', 'booking', bookingId, jsonb_build_object('reason', booking.cancellation_reason))` — ไม่ใช้ `cancellation_logs` เพราะไม่มีอะไรถูกยกเลิกจริง

Return: `{ bookingId, newStatus: 'cancelled' | 'approved' }`

```ts
// Extension point: เมื่อ Make.com webhook พร้อมใช้งาน (มี MAKE_WEBHOOK_URL
// secret ตั้งไว้แล้ว) ให้เรียก withRetry() + logIntegration() ที่นี่เพื่อลบ
// Google Calendar event ด้วย gcal_event_id — ยังไม่เรียกจริงในตอนนี้
function triggerCalendarDelete(_bookingId: string): void {
  // TODO (future track): เรียก Make.com webhook จริง
}
```

### 2. `supabase/functions/request-cancellation/index.ts`

- Method: POST, `verify_jwt=true`
- Request body: `{ booking_id: string, reason: string }`
- Logic:
  1. หา identity ผู้เรียกผ่าน `auth.getUser()` (dual-client pattern เดียวกับ `create-booking`/`approve-booking`)
  2. เรียก `requestCancellation(adminClient, { bookingId: body.booking_id, requesterId: user.id, reason: body.reason })`
  3. สำเร็จ → คืนผลลัพธ์ของ `requestCancellation()`

### 3. `supabase/functions/decide-cancellation/index.ts`

- Method: POST, `verify_jwt=true`
- Request body: `{ booking_id: string, decision: 'approve' | 'reject' }`
- Logic:
  1. หา identity ผู้เรียกผ่าน `auth.getUser()`
  2. ดึง `role` ของผู้เรียกจากตาราง `users` ด้วย service-role client — ถ้า `role` ไม่ใช่ `'admin'`/`'approver'` → throw `ForbiddenError("ท่านไม่มีสิทธิ์พิจารณาคำขอยกเลิก")`
  3. เรียก `decideCancellation(adminClient, { bookingId: body.booking_id, deciderId: user.id, role, decision: body.decision })`
  4. สำเร็จ → คืนผลลัพธ์ของ `decideCancellation()`

### 4. หน้า `/profile/bookings`

Query ตรงจาก Supabase browser client: `booking_detail` view `WHERE requester_id = auth.uid()` เรียงตาม `created_at DESC` (RLS "bookings: user reads own" ครอบคลุมอยู่แล้ว — `booking_detail` เป็น view ธรรมดา ไม่ใช่ `SECURITY DEFINER` จึงสืบ RLS ของตารางฐานตามปกติ)

- แสดงสถานะเป็นภาษาไทย: `pending`→"รออนุมัติ", `approved`→"อนุมัติแล้ว", `cancel_requested`→"รอ Admin พิจารณาคำขอยกเลิก", `rejected`→"ถูกปฏิเสธ", `cancelled`/`cancelled_by_admin`→"ยกเลิกแล้ว"
- ปุ่มยกเลิกแสดงเฉพาะการ์ดที่ `final_status` เป็น `pending` (ข้อความปุ่ม "ยกเลิกการจอง") หรือ `approved` (ข้อความปุ่ม "ขอยกเลิกการจอง") เท่านั้น — ข้อความต่างกันเพื่อสื่อผลลัพธ์ที่ต่างกัน (ทันที vs ต้องรออนุมัติ)
- กดปุ่ม → dialog บังคับกรอกเหตุผล (textarea, required, client-side validate ไม่ให้ว่าง) → confirm → เรียก `request-cancellation` → สำเร็จ รีโหลดรายการ

### 5. หน้า `/approver/cancel-requests`

Query ตรงจาก client: `booking_detail` view (หรือ `bookings` join `rooms`,`users`) `WHERE final_status = 'cancel_requested'` เรียงตาม `created_at ASC` (RLS "bookings: user reads own, staff reads all" ให้ approver/admin อ่านทุกแถวอยู่แล้ว)

- แสดงเหตุผลที่ User กรอกไว้ (`cancellation_reason`) เด่นชัดในการ์ด
- ปุ่ม "อนุมัติการยกเลิก" / "ปฏิเสธคำขอ" → confirm dialog (ไม่มี input เพิ่มจาก Admin/Approver — ใช้เหตุผลเดิมของ User) → เรียก `decide-cancellation` → สำเร็จ รีโหลดคิว
- Middleware gate route นี้ด้วย `["approver","admin"]` เหมือน `/approver`, `/approver/history` ของ Track B

## Data Flow

```
User เปิด /profile/bookings
  → query booking_detail ของตัวเอง
  → แสดงปุ่มยกเลิก/ขอยกเลิกตามสถานะ

กดปุ่ม → กรอกเหตุผล (บังคับ) → confirm → เรียก request-cancellation
  → pending: ยกเลิกทันที (บันทึก cancellation_logs) → trg_release_slot ปลด booking_slot ให้จองใหม่ได้
  → approved: เปลี่ยนเป็น cancel_requested (ยังไม่ปลด slot — ห้องยังถูกจองอยู่จนกว่าจะอนุมัติจริง)

Admin/Approver เปิด /approver/cancel-requests
  → query booking ที่ final_status='cancel_requested'
  → เห็นเหตุผลของ User

กด "อนุมัติ" → confirm → decide-cancellation(approve)
  → final_status='cancelled' → บันทึก cancellation_logs → trg_release_slot ปลด slot → trigger stub ลบปฏิทิน

กด "ปฏิเสธ" → confirm → decide-cancellation(reject)
  → final_status กลับเป็น 'approved' → บันทึก activity_logs → booking ยังคงอยู่ในระบบตามเดิม (ไม่ปลด slot)
```

## Error Handling สรุป

| กรณี | Error Class | ข้อความ |
|---|---|---|
| ไม่พบ booking | `NotFoundError` | "ไม่พบรายการจองนี้" |
| ไม่ใช่เจ้าของ booking (`requestCancellation`) | `ForbiddenError` | "ท่านไม่มีสิทธิ์ยกเลิกรายการนี้" |
| ผู้เรียก `decide-cancellation` ไม่ใช่ approver/admin | `ForbiddenError` | "ท่านไม่มีสิทธิ์พิจารณาคำขอยกเลิก" |
| สถานะไม่ตรงเงื่อนไข (กดซ้ำ/คนอื่นตัดสินใจไปแล้ว/สถานะไม่รองรับ) | `ConflictError` | "รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า" |
| ไม่กรอกเหตุผล (`reason` ว่าง) | `ValidationError` | "กรุณากรอกเหตุผลการยกเลิก" |
| `decision` ไม่ใช่ `approve`/`reject` | `ValidationError` | "การกระทำไม่ถูกต้อง" |

## Testing (Success Criteria)

1. `npx tsc --noEmit` และ `npm run build` ผ่าน (Edge Functions verify ด้วย manual review เท่านั้น เหมือน Track A/B เพราะไม่มี Deno CLI/Supabase CLI/MCP ในเซสชันนี้)
2. Login `user@test.local` เปิด `/profile/bookings` เห็น 4 booking จาก seed data — ปุ่มยกเลิกแสดงเฉพาะ Booking 1 (`pending`) และ Booking 2 (`approved`) เท่านั้น Booking 3 (`rejected`)/Booking 4 (`cancel_requested`) ไม่มีปุ่ม
3. กด "ยกเลิกการจอง" ที่ Booking 1 → กรอกเหตุผล → `final_status` เป็น `cancelled` ทันที มีแถวใหม่ใน `cancellation_logs` (`role='user'`, `prev_status='pending'`)
4. กด "ขอยกเลิกการจอง" ที่ Booking 2 → กรอกเหตุผล → `final_status` เป็น `cancel_requested`, `cancellation_reason` ถูกบันทึก, **ไม่มี** แถวใหม่ใน `cancellation_logs`
5. Login `admin@test.local` เปิด `/approver/cancel-requests` เห็น Booking 4 (seed data) และ Booking 2 (จากข้อ 4) พร้อมเหตุผลที่ User กรอก
6. กด "อนุมัติการยกเลิก" ที่ Booking 4 → `final_status` เป็น `cancelled`, มีแถวใหม่ใน `cancellation_logs` (`role='admin'`, `prev_status='cancel_requested'`)
7. กด "ปฏิเสธคำขอ" ที่ Booking 2 → `final_status` กลับเป็น `approved`, มีแถวใหม่ใน `activity_logs` (`action='reject_cancel_request'`) **ไม่มี** แถวใหม่ใน `cancellation_logs`
8. Login `approver1@test.local` เปิด `/approver/cancel-requests` เห็นรายการเดียวกับที่ admin เห็น (ไม่ filter ตามใคร)
9. ทดสอบกดยกเลิก/ตัดสินใจซ้ำ 2 ครั้งติดกันเร็วๆ (จำลอง double-click) → ครั้งที่สองได้ `ConflictError` ไม่ใช่การเปลี่ยนสถานะซ้อนกัน 2 รอบ
