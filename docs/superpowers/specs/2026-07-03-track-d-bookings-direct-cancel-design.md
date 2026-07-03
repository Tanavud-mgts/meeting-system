# Track D (sub-project 2) — รายการจองทั้งหมด + ยกเลิกโดย Admin (`/dashboard/bookings`)

## บริบท

ต่อจาก Track D sub-project 1 (rooms/users/settings, เสร็จแล้วในเวิร์กทรีเดียวกัน) — sub-project นี้สร้างหน้า `/dashboard/bookings` (รายการจองทั้งหมดในระบบ) พร้อมกลไก "ยกเลิกโดยตรงได้ทุกสถานะ ไม่ต้องขอใคร" ของ Admin ตาม `docs/PRODUCT.md` ("Admin: ยกเลิกการจองใดๆ ได้ทันทีโดยไม่ต้องขออนุมัติจากใคร") ซึ่งเป็น power ที่ Track C (ยกเลิกการจอง, worktree แยกต่างหาก ยังไม่ merge) ตั้งใจเว้นไว้ไม่สร้างเพราะไม่มีหน้าใช้งานในขอบเขตของตัวเอง — sub-project นี้เป็นหน้าแรกที่ใช้งาน power นี้จริง

**หมายเหตุ cross-track:** worktree นี้ fork จาก `main@76a582c` (จุดที่ Foundation phase เสร็จ) ไม่มี `processCancellation.ts` ของ Track C อยู่ (Track C ยังไม่ merge) จึงเขียน logic การยกเลิกของ sub-project นี้แบบ self-contained ในไฟล์เดียว ไม่พยายาม import จากไฟล์ที่ไม่มีอยู่จริงในบราวช์นี้ — ถ้าตอน merge ทั้งสอง track เข้า main แล้วพบว่า logic คล้ายกันเกินไปสมควรรวม ค่อยทำเป็นงาน cleanup แยกทีหลัง

## ขอบเขต

**อยู่ในขอบเขตนี้:**
- `supabase/functions/direct-cancel-booking/index.ts` — Edge Function เดียว ไม่มี shared module แยก (มีจุดเรียกใช้เดียว ต่างจาก `processApproval()`/`processCancellation()` ของ track อื่นที่มีหลายจุดเรียกใช้)
- หน้า `/dashboard/bookings` — รายการจองทั้งหมด พร้อม filter ห้อง, pagination, ปุ่มยกเลิกโดย Admin

**ไม่อยู่ในขอบเขตนี้ (เก็บไว้ให้ sub-project ถัดไปของ Track D):**
- `/dashboard` (ภาพรวม), `/dashboard/data` (Export/retention/danger zone), `/dashboard/integrations` (Integration Health), `/dashboard/activity` (audit log รวม), `/setup` (wizard)
- Filter เพิ่มเติมนอกจากห้อง (เช่น filter ตามสถานะ, ผู้จอง, ช่วงวันที่) — ไม่ได้ขอไว้ในรอบนี้ เพิ่มทีหลังได้ถ้าจำเป็น
- Make.com webhook เรียกจริงเพื่อลบ Google Calendar Event — เขียน stub `triggerCalendarDelete()` ไว้ (extension point) เหมือน track อื่น

## สถาปัตยกรรม / Components

### 1. `supabase/functions/direct-cancel-booking/index.ts`

- Method: POST, `verify_jwt=true`
- Request body: `{ booking_id: string, reason: string }`
- Logic:
  1. หา identity ผู้เรียกผ่าน `auth.getUser()` (dual-client pattern เดียวกับ track อื่น — anon-key client หา identity, service-role client ทำงานจริง)
  2. ดึง `role` ของผู้เรียกจากตาราง `users` — ต้องเป็น `'admin'` เท่านั้น (**ไม่ใช่** `'approver'` แม้ CLAUDE.md ส่วน Architecture Decisions จะเขียนกำกวมว่า "Admin-Approver ยกเลิกได้ทันทีไม่ต้องขอใคร" — เหตุผล: หน้า `/dashboard/bookings` เองเป็นหน้า Admin-only ตาม page list ของ `docs/PRODUCT.md` ส่วนที่ 6 ("Admin (+8 หน้า จาก Approver)" ไม่รวมอยู่ใน Approver's 4 หน้าเพิ่ม) middleware จึงกัน Approver ไม่ให้เข้าหน้านี้ตั้งแต่ต้นอยู่แล้ว การตรวจ role เป็น admin เท่านั้นที่ Edge Function จึงสอดคล้องกับขอบเขตจริงของ feature ที่มีอยู่แค่หน้าเดียว) → ไม่ใช่ admin → throw `ForbiddenError("ท่านไม่มีสิทธิ์ยกเลิกรายการนี้")`
  3. Validate `reason` ไม่ว่างหรือเป็นแค่ whitespace → throw `ValidationError("กรุณากรอกเหตุผลการยกเลิก")`
  4. ดึง booking ปัจจุบัน (`final_status`, `gcal_event_id`) — ไม่พบ throw `NotFoundError("ไม่พบรายการจองนี้")`
  5. ถ้า `final_status` เป็น `'cancelled'`/`'cancelled_by_admin'`/`'rejected'` อยู่แล้ว → throw `ConflictError("รายการนี้ถูกยกเลิกไปแล้ว")`
  6. `UPDATE bookings SET final_status='cancelled_by_admin' WHERE id=bookingId AND final_status = <ค่า final_status ที่อ่านมาในขั้นตอน 4>` — atomic guard ตาม CLAUDE.md กฎข้อ 6 (ป้องกัน race กับการกระทำอื่นที่เปลี่ยนสถานะพร้อมกัน เช่นมีคนกดยกเลิกซ้ำ หรือ Approver เพิ่งอนุมัติ step สุดท้ายไปพร้อมกัน) — อัปเดตได้ 0 แถว → throw `ConflictError("รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า")`
  7. `INSERT INTO cancellation_logs (booking_id, cancelled_by, role, prev_status, reason) VALUES (bookingId, admin.id, 'admin', <ค่า final_status เดิม>, reason)`
  8. ถ้า booking มี `gcal_event_id` (ไม่เป็น null — แปลว่าเคยผ่าน approved มาก่อนจึงมี event ผูกอยู่จริง) → เรียก `triggerCalendarDelete(bookingId)` — stub เขียนเองใหม่ในไฟล์นี้ (ไม่ import จาก Track C) **ไม่เรียก `logIntegration()`** เพราะยังไม่มีการเรียก external service จริง
  9. คืน `{ bookingId, newStatus: 'cancelled_by_admin' }`

```ts
// Extension point: เมื่อ Make.com webhook พร้อมใช้งาน ให้เรียก withRetry() +
// logIntegration() ที่นี่เพื่อลบ Google Calendar event ด้วย gcal_event_id
// ยังไม่เรียกจริงในตอนนี้ (เขียนแยกจาก stub เดียวกันของ Track C โดยตั้งใจ
// เพราะ worktree นี้ไม่มีไฟล์ของ Track C — ดูหมายเหตุ cross-track ด้านบน)
function triggerCalendarDelete(_bookingId: string): void {
  // TODO (future track): เรียก Make.com webhook จริง
}
```

### 2. หน้า `/dashboard/bookings`

- Query ตรงจาก client: `booking_detail` view เรียงตาม `created_at DESC` (RLS "bookings: user reads own, staff reads all" อนุญาต Admin อ่านทุกแถวอยู่แล้ว)
- Filter: dropdown เลือกห้อง (ดึงรายชื่อจาก `rooms`) — ค่าเริ่มต้น "ทุกห้อง" ไม่ filter
- Pagination: page-based ด้วย `.range(from, to)` + `{ count: 'exact' }`, ขนาดหน้าละ 20 รายการ, ปุ่ม "ก่อนหน้า"/"ถัดไป" + แสดงเลขหน้าปัจจุบัน/จำนวนหน้าทั้งหมด
- แสดงสถานะเป็นภาษาไทย (label เดียวกับที่ใช้ใน Track C's `/profile/bookings`: `pending`→"รออนุมัติ", `approved`→"อนุมัติแล้ว", `cancel_requested`→"รอ Admin พิจารณาคำขอยกเลิก", `rejected`→"ถูกปฏิเสธ", `cancelled`/`cancelled_by_admin`→"ยกเลิกแล้ว")
- ปุ่ม "ยกเลิกโดย Admin" แสดงเฉพาะการ์ดที่ `final_status` **ไม่ใช่** `cancelled`/`cancelled_by_admin`/`rejected` (แสดงกับ `pending`, `approved`, `cancel_requested` ทั้งหมด)
- กดปุ่ม → dialog บังคับกรอกเหตุผล (textarea, required, client-side validate ไม่ให้ว่าง) → confirm → เรียก `direct-cancel-booking` → สำเร็จ รีโหลดรายการ (คงหน้า/filter เดิมไว้)

## Data Flow

```
Admin เปิด /dashboard/bookings
  → query booking_detail ทั้งหมด (filter ห้องถ้าเลือกไว้) + pagination
  → แสดงรายการพร้อมสถานะและปุ่ม "ยกเลิกโดย Admin" (ยกเว้นสถานะจบแล้ว)

กด "ยกเลิกโดย Admin" → กรอกเหตุผล (บังคับ) → confirm → เรียก direct-cancel-booking
  → ตรวจ role เป็น admin
  → ตรวจสถานะปัจจุบันไม่ใช่สถานะจบแล้ว
  → UPDATE final_status='cancelled_by_admin' (atomic guard) → trg_release_slot ปลด booking_slot
  → บันทึก cancellation_logs (role='admin', prev_status=สถานะเดิม)
  → ถ้ามี gcal_event_id → trigger stub ลบปฏิทิน
  → รีโหลดรายการ (การ์ดหายปุ่ม เปลี่ยนเป็นสถานะ "ยกเลิกแล้ว")
```

## Error Handling สรุป

| กรณี | Error Class | ข้อความ |
|---|---|---|
| ไม่พบ booking | `NotFoundError` | "ไม่พบรายการจองนี้" |
| ผู้เรียกไม่ใช่ admin | `ForbiddenError` | "ท่านไม่มีสิทธิ์ยกเลิกรายการนี้" |
| ไม่กรอกเหตุผล | `ValidationError` | "กรุณากรอกเหตุผลการยกเลิก" |
| สถานะจบแล้ว (ยกเลิกซ้ำ) | `ConflictError` | "รายการนี้ถูกยกเลิกไปแล้ว" |
| กดซ้ำเร็วๆ (race guard จาก atomic UPDATE) | `ConflictError` | "รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า" |

## Testing (Success Criteria)

1. `npx tsc --noEmit` และ `npm run build` ผ่าน (Edge Function verify ด้วย manual review เท่านั้น เหมือน track อื่น เพราะไม่มี Deno CLI/Supabase CLI/MCP ในเซสชันนี้)
2. Login `admin@test.local` เปิด `/dashboard/bookings` เห็น booking ทั้งหมดจาก seed data (4 รายการ) เรียงตาม `created_at` ล่าสุดก่อน
3. ทดสอบ filter ห้อง — เลือกห้องหนึ่ง เห็นเฉพาะ booking ของห้องนั้น, เลือก "ทุกห้อง" กลับมาเห็นครบ
4. ทดสอบ pagination — ตรวจว่าปุ่ม "ถัดไป"/"ก่อนหน้า" ทำงานถูกต้องกับข้อมูลที่มี (ถ้า seed data มีน้อยกว่า 20 รายการ ปุ่ม "ถัดไป" ต้อง disabled/ไม่แสดง)
5. ปุ่ม "ยกเลิกโดย Admin" แสดงเฉพาะ Booking 1 (`pending`), 2 (`approved`), 4 (`cancel_requested`) — ไม่แสดงกับ Booking 3 (`rejected`)
6. กดยกเลิก Booking 1 (`pending`) → กรอกเหตุผล → `final_status` เป็น `cancelled_by_admin` ทันที มีแถวใหม่ใน `cancellation_logs` (`role='admin'`, `prev_status='pending'`)
7. Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/dashboard/bookings` ตรงๆ ทาง URL → ถูก middleware บล็อก redirect ไป `/home` (ครอบคลุมด้วย `/dashboard` prefix → `["admin"]` ที่มีอยู่แล้ว ไม่ต้องแก้ middleware เพิ่ม)
8. ทดสอบกดยกเลิกซ้ำ 2 ครั้งติดกันเร็วๆ (จำลอง double-click) → ครั้งที่สองได้ `ConflictError` ไม่ใช่การเปลี่ยนสถานะซ้อนกัน 2 รอบ
