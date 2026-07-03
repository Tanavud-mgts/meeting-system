# Track A — จองห้อง (`/booking`)

## บริบท

หลัง Foundation phase (Supabase client helpers, role-gated middleware, shared app layout, `_shared/` Edge Function modules) เสร็จแล้ว งานนี้เป็น track แรกจาก 4 track ที่ทำขนานกันในแต่ละ worktree — สร้าง flow การจองห้องจริง (ยังไม่รวมขั้นตอนอนุมัติซึ่งเป็นคนละ track)

`/booking` เป็น 2-step flow ตาม `docs/PRODUCT.md`: ขั้นที่ 1 ค้นหาห้องว่างตามวันเวลา → ขั้นที่ 2 กรอกรายละเอียด สร้าง booking สถานะ `pending` step 0 (รอ Admin อนุมัติเป็นขั้นแรกของ Approval Chain — ขั้นตอนอนุมัติเองไม่ได้อยู่ใน scope นี้)

**`/calendar` ไม่รวมอยู่ใน scope นี้** — แยกเป็น spec ต่างหากในอนาคต เพราะเป็น read-only view ที่ค่อนข้างอิสระจาก booking creation flow

## ปัญหาที่พบระหว่างสำรวจ (นอกเหนือแผนเดิม)

`system_config` (เก็บ `office_start_hour`/`office_end_hour`/`holidays`) มี RLS policy `system_config: staff read` อนุญาตแค่ `approver`/`admin` เท่านั้น — user ธรรมดา (ผู้จองห้องส่วนใหญ่) อ่านตรงไม่ได้ แต่ต้องใช้ข้อมูลนี้จำกัดช่วงเวลาใน UI ตั้งแต่ต้น จึงต้องมี Edge Function เพิ่มเติมนอกเหนือจาก `create-booking` ที่วางแผนไว้เดิม

## ขอบเขต

**อยู่ในขอบเขตนี้:**
- หน้า `/booking` แบบ 2-step (ค้นหา → กรอกรายละเอียด)
- Edge Function `get-booking-config` (ใหม่ ไม่อยู่ใน AGENTS.md เดิม)
- Edge Function `create-booking`

**ไม่อยู่ในขอบเขตนี้:**
- `/calendar` — แยก spec ทีหลัง
- ขั้นตอนอนุมัติ (`approve-booking`, หน้า `/approver`) — Track B
- ยกเลิกการจอง — Track C

## สถาปัตยกรรม / Components

### 1. `get-booking-config` Edge Function

- Method: GET, `verify_jwt=true`
- ใช้ service_role client อ่าน `system_config` (bypass RLS เพราะ user ธรรมดาอ่านตรงไม่ได้)
- คืนเฉพาะ `{ office_start_hour, office_end_hour, holidays }` — **ไม่คืนฟิลด์อื่น** (เช่น `admin_id`, `approver1_id`) เพื่อไม่ให้ user ธรรมดาเห็นข้อมูลที่ไม่จำเป็น
- ห่อด้วย `withErrorHandling()` ตามกฎ CLAUDE.md ข้อ 1
- เรียกตอนโหลดหน้า `/booking` ครั้งแรก เพื่อจำกัด min/max ของ time picker และ disable วันหยุดใน date picker ตั้งแต่ต้น (ไม่ปล่อยให้เลือกอิสระแล้วค่อย error ตอนส่ง)

### 2. ขั้นที่ 1 — ค้นหาห้องว่าง (client-side query ตรง ไม่ผ่าน Edge Function)

Filter: วันที่ + เวลาเริ่ม-จบ เท่านั้น (ไม่มี filter ความจุ/อุปกรณ์เพิ่มในรอบนี้)

Query ตรงจาก Supabase client (RLS อนุญาต authenticated อ่าน `rooms` และ `booking_slots` อยู่แล้ว — ไม่ต้องผ่าน Edge Function):
1. ดึง `rooms` ทั้งหมดที่ `status != 'maintenance'` (`status = 'busy'` ยังคงแสดงในผลค้นหา ปล่อยให้ตรวจ overlap จริงตัดสิน)
2. ดึง `booking_slots` ที่ `tstzrange(start_time, end_time)` overlap กับช่วงเวลาที่ผู้ใช้เลือก
3. ห้องที่มี `booking_slots` overlap (จับคู่ทาง `room_id`) = ไม่ว่าง → แสดงแบบ disabled จาง (ตาม DESIGN.md) ห้องอื่นเลือกได้ปกติ

เรียงตามความจุ (capacity) จากน้อยไปมาก

### 3. ขั้นที่ 2 — กรอกรายละเอียด

ฟอร์ม: `title` (ชื่อการประชุม), `activity` (รายละเอียดกิจกรรม), `attendees` (จำนวนผู้เข้าร่วม)

Validation ฝั่ง client ก่อนส่ง: `attendees` ต้องไม่เกิน `capacity` ของห้องที่เลือก (แสดง error message ทันทีไม่ต้องรอ round-trip ไป server)

### 4. `create-booking` Edge Function

- Method: POST, `verify_jwt=true`
- Request body: `{ room_id, title, activity, attendees, start_time, end_time }`
- Logic:
  1. ดึง `room.capacity` จาก `room_id` → ถ้า `attendees > capacity` throw `ValidationError` (ตรวจซ้ำฝั่ง server กัน bypass client validation)
  2. INSERT เข้า `bookings` ด้วย service_role client (`requester_id` มาจาก JWT ของผู้เรียก ไม่รับจาก request body) — ปล่อยให้ trigger ที่มีอยู่แล้วจัดการ:
     - `trg_booking_ref_id` สร้าง `ref_id` อัตโนมัติ
     - `trg_validate_hours` ตรวจ business hours/holidays จาก `system_config` (throw error `P0001` ถ้าอยู่นอกเวลา — แม้ UI จะจำกัดไว้แล้ว แต่ยังตรวจซ้ำฝั่ง DB เป็น defense-in-depth)
     - `trg_create_slot` สร้าง `booking_slots` ให้อัตโนมัติ — **ห้าม insert `booking_slots` เองในโค้ด Edge Function** (ตรงกับ bug ที่เจอและแก้ไปแล้วใน seed data รอบก่อน ซึ่งเกิดจาก insert ซ้ำกับ trigger นี้พอดี)
  3. ดักจับ Postgres error:
     - error code `23P01` (EXCLUDE constraint `no_overlap` — จองห้องซ้อนเวลา) → แปลงเป็น `ConflictError("ห้องถูกจองแล้วในช่วงเวลานี้ กรุณาเลือกเวลาอื่น")`
     - error code `P0001` จาก `trg_validate_hours` (นอกเวลาทำการ/วันหยุด) → แปลงเป็น `ValidationError` โดยส่งข้อความจาก Postgres exception ต่อไปตรงๆ (ข้อความเป็นไทยอยู่แล้วจาก trigger)
     - error อื่นที่ไม่คาดคิด → ปล่อยให้ `withErrorHandling()` จัดการเป็น 500 ทั่วไป
  4. สำเร็จ → คืน booking ที่สร้างแล้ว (อย่างน้อยต้องมี `id`, `ref_id`)

## Data Flow

```
เปิดหน้า /booking
  → เรียก get-booking-config → ได้ office hours + holidays
  → เรนเดอร์ date/time picker จำกัดช่วงตามนั้น

ผู้ใช้เลือกวัน+เวลา → กด "ค้นหา"
  → query rooms + booking_slots ตรงจาก Supabase client
  → แสดงรายการห้อง (ว่าง/ไม่ว่าง แยกด้วย opacity)

เลือกห้องที่ว่าง → กรอก title/activity/attendees
  → ตรวจ attendees <= capacity ฝั่ง client
  → กด "ยืนยันการจอง" → เรียก create-booking

create-booking สำเร็จ → แสดง ref_id + redirect ไปหน้าที่เหมาะสม (เช่น /profile/bookings — หน้านี้ยังไม่มี ให้ redirect ไป /home ชั่วคราวจนกว่า Track C จะสร้างหน้านั้น)

create-booking ล้มเหลว (ConflictError) → แสดงข้อความ "ห้องถูกจองแล้ว" พร้อมปุ่มกลับไปขั้นที่ 1 เพื่อเลือกใหม่
```

## Error Handling สรุป

| กรณี | Error Class | ข้อความ |
|---|---|---|
| attendees เกิน capacity | `ValidationError` | "จำนวนผู้เข้าร่วมเกินความจุห้อง" |
| จองซ้อนเวลา (23P01) | `ConflictError` | "ห้องถูกจองแล้วในช่วงเวลานี้ กรุณาเลือกเวลาอื่น" |
| นอกเวลาทำการ/วันหยุด (P0001 จาก trigger) | `ValidationError` | ข้อความจาก Postgres trigger ตรงๆ |
| อื่นๆ ที่ไม่คาดคิด | (ไม่ใช่ AppError) | 500 ทั่วไปจาก `withErrorHandling()` |

## Testing (Success Criteria)

1. `npx tsc --noEmit` และ `npm run build` ผ่าน
2. เปิด `/booking` → time picker ถูกจำกัดตาม office hours จริงจาก `system_config` (ทดสอบด้วยการเปลี่ยนค่าใน DB แล้วดูว่า UI เปลี่ยนตาม)
3. ค้นหาห้องช่วงเวลาที่มีการจองอยู่แล้ว (ใช้ seed data ที่มี booking ตัวอย่าง) → ห้องนั้นแสดงเป็น disabled จาง ห้องอื่นเลือกได้ปกติ
4. กรอก attendees เกิน capacity → เห็น error ทันทีฝั่ง client ก่อนกดส่งด้วยซ้ำ
5. จองห้องสำเร็จ → เห็น `ref_id` รูปแบบ `BK-YYYYMMDD-XXX` และตรวจใน DB ว่า `booking_slots` มีแค่ 1 แถวสำหรับ booking นี้ (ไม่ใช่ 2 แถวจากการ insert ซ้ำ)
6. จองห้อง+เวลาเดียวกันซ้ำ (จากอีก user) → เห็นข้อความ "ห้องถูกจองแล้ว" ไม่ใช่ error ทั่วไป
7. จองนอกเวลาทำการ (ถ้าเข้าถึงได้ผ่านการ bypass UI เช่นเรียก Edge Function ตรง) → ยัง reject ด้วยข้อความจาก trigger ไม่ใช่ 500
