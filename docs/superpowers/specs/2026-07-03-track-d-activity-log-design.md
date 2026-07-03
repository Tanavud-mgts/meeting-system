# Track D (sub-project 3) — ประวัติการทำงานรวม (`/dashboard/activity`)

## บริบท

ต่อจาก Track D sub-project 1 (rooms/users/settings) และ sub-project 2 (bookings list + direct-cancel, ทั้งคู่เสร็จแล้วในเวิร์กทรีเดียวกัน) — sub-project นี้สร้างหน้า `/dashboard/activity` ให้ Admin เห็นประวัติการทำงานรวมของทุกคนในระบบ (อนุมัติ, ปฏิเสธ, ยกเลิก, เปลี่ยนการตั้งค่า) ตาม `docs/PRODUCT.md` ("Admin: เห็นประวัติการทำงานของทุกคนในระบบ")

หน้านี้เป็น **read-only ทั้งหมด** ใช้ view `staff_activity_timeline` ที่มีอยู่แล้วจาก migration 012 (`UNION ALL` ของ `approval_logs` + `cancellation_logs` (เฉพาะ staff) + `activity_logs`) ซึ่งมี `security_invoker = true` ตั้งไว้แล้วจาก migration 015 — ไม่มี Edge Function ใหม่ในสโคปนี้

## ขอบเขต

**อยู่ในขอบเขตนี้:**
- หน้า `/dashboard/activity` — timeline รวม พร้อม filter `event_type` และ pagination

**ไม่อยู่ในขอบเขตนี้ (เก็บไว้ให้ sub-project ถัดไปของ Track D):**
- `/dashboard` (ภาพรวม), `/dashboard/data` (Export/retention/danger zone), `/dashboard/integrations` (Integration Health), `/setup` (wizard)

## สถาปัตยกรรม / Components

### หน้า `/dashboard/activity`

- Query ตรงจาก client: `staff_activity_timeline` view — **ระบุ `.order("occurred_at", { ascending: false })` ชัดเจนในฝั่ง client เสมอ** แม้ view จะมี `ORDER BY` ท้ายสุดในตัวเองอยู่แล้วก็ตาม (Postgres ไม่การันตีว่า query ผ่าน view จะรักษาลำดับจาก view definition เดิมถ้าไม่ระบุ ORDER BY ตอน query จริง — gotcha ที่พบบ่อย)
- Filter: dropdown เลือก `event_type` (`approval`/`cancellation`/`config_change`) — ค่าเริ่มต้น "ทั้งหมด" ไม่ filter
- Pagination: page-based เหมือน `/dashboard/bookings` ของ sub-project 2 (`.range(from, to)` + `{count: 'exact'}`, หน้าละ 20 รายการ, ปุ่ม "ก่อนหน้า"/"ถัดไป")
- แสดงแต่ละ event เป็นการ์ด: label ประเภทเหตุการณ์ภาษาไทย (มาจาก `event_type`+`sub_type` รวมกัน), `actor_name`, `related_ref` (ถ้าไม่ null), `detail` (ถ้าไม่ null), เวลาที่เกิดขึ้น (`occurred_at`, format ด้วย `toLocaleString("th-TH")`)

**Label mapping สำหรับ event_type/sub_type:**

| event_type | sub_type | label ภาษาไทย |
|---|---|---|
| `approval` | `approved` | "อนุมัติคำขอจอง" |
| `approval` | `rejected` | "ปฏิเสธคำขอจอง" |
| `cancellation` | `user_cancel` | "ผู้ใช้ยกเลิกการจอง" |
| `cancellation` | `staff_cancel` | "เจ้าหน้าที่ยกเลิกการจอง" |
| `config_change` | (ค่าอื่นๆ) | fallback แสดง `sub_type` ตรงๆ (ยังไม่มี event ประเภทนี้ให้เห็นจริงในเซสชันนี้ เพราะ track ที่ log เข้า `activity_logs` — เช่น Track C's `reject_cancel_request` — ยังไม่ merge เข้า worktree นี้) |

## Data Flow

```
Admin เปิด /dashboard/activity
  → query staff_activity_timeline (filter event_type ถ้าเลือกไว้) + pagination
  → แสดง timeline พร้อม label ภาษาไทย, ผู้กระทำ, booking ref (ถ้ามี), เวลา
```

ไม่มีการเขียนข้อมูลในหน้านี้เลย (read-only ทั้งหมด) จึงไม่มี Edge Function ในสโคปนี้

## Error Handling สรุป

| กรณี | ข้อความ |
|---|---|
| โหลดข้อมูลไม่สำเร็จ | "ไม่สามารถโหลดประวัติการทำงานได้" |
| ไม่มีข้อมูล (หลัง filter) | "ไม่พบประวัติการทำงาน" |

## Testing (Success Criteria)

1. `npx tsc --noEmit` และ `npm run build` ผ่าน
2. Login `admin@test.local` เปิด `/dashboard/activity` เห็น event จาก seed data (`approval_logs` จาก Booking 1-4 ที่มีอยู่แล้ว) เรียงตามเวลาล่าสุดก่อน — เห็นทั้งของ Admin และ Approver1/2 (ไม่ filter ตามตัวเอง เพราะเป็น Admin)
3. ทดสอบ filter `event_type` — เลือก "การอนุมัติ" เห็นเฉพาะ event ประเภท `approval`, เลือก "ทั้งหมด" กลับมาเห็นครบ
4. ทดสอบ pagination — ตรวจว่าปุ่ม "ถัดไป"/"ก่อนหน้า" ทำงานถูกต้องตามจำนวนข้อมูลจริง
5. Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/dashboard/activity` ตรงๆ ทาง URL → ถูก middleware บล็อก redirect ไป `/home` (ครอบคลุมด้วย `/dashboard` prefix → `["admin"]` ที่มีอยู่แล้ว ไม่ต้องแก้ middleware เพิ่ม)
