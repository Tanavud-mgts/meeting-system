# Track D (sub-project 5) — จัดการข้อมูล (`/dashboard/data`)

## บริบท

ต่อจาก Track D sub-project 1-4 (rooms/users/settings, bookings list+direct-cancel, activity log, dashboard overview — เสร็จแล้วในเวิร์กทรีเดียวกัน) — sub-project นี้สร้างหน้า `/dashboard/data` ตาม `docs/PRODUCT.md` ("Admin: /dashboard/data — Export, retention settings, danger zone") ครอบคลุม 3 concern: Export ข้อมูลเป็นไฟล์, แก้ retention period ของ log, และปุ่มล้าง log เก่าทันที

สโคปนี้ซับซ้อนกว่า sub-project ก่อนหน้าเพราะมี **3 Edge Function แยกกัน** (มากกว่าทุก sub-project ที่ผ่านมาซึ่งมีอย่างมาก 1 Edge Function ต่อ sub-project) ตามหลักการ "หนึ่ง Edge Function ทำหนึ่งอย่าง" ที่ยึดมาตลอดทั้งโปรเจกต์

## ขอบเขต

**อยู่ในขอบเขตนี้:**
- `supabase/functions/export-data/index.ts` — export CSV 3 ชุดข้อมูล (bookings, approval_history, users)
- `supabase/functions/update-retention-settings/index.ts` — แก้ retention period ใน `system_config`
- `supabase/functions/cleanup-logs-now/index.ts` — เรียก `cleanup_old_logs()` ทันที
- หน้า `/dashboard/data` — 3 ส่วน: Export, Retention Settings, Danger Zone

**ไม่อยู่ในขอบเขตนี้ (เก็บไว้ให้ sub-project ถัดไปของ Track D):**
- `/dashboard/integrations` (Integration Health), `/setup` (wizard)
- Export เป็นไฟล์ `.xlsx` จริง — ใช้ CSV แทน (เปิดใน Excel ได้ปกติ) เพื่อไม่ต้องเพิ่ม dependency ใหม่ในเซสชันที่ไม่มี Deno CLI ทดสอบ
- Export ชุด "reports" (room utilization, department summary) — เป็น aggregate view ที่ซับซ้อนกว่า เก็บไว้ให้หน้า `/dashboard/reports` ในอนาคตถ้ามี

## สถาปัตยกรรม / Components

### 1. `supabase/functions/export-data/index.ts`

- Method: POST, `verify_jwt=true`
- Request body: `{ dataset: 'bookings' | 'approval_history' | 'users' }`
- Logic:
  1. หา identity + ตรวจ role เป็น `admin` เท่านั้น (dual-client pattern เดียวกับ track อื่น) → ไม่ใช่ admin → `ForbiddenError("ท่านไม่มีสิทธิ์ดำเนินการนี้")`
  2. Validate `dataset` เป็นหนึ่งใน 3 ค่าที่กำหนด → ไม่ใช่ → `ValidationError("ประเภทข้อมูลไม่ถูกต้อง")`
  3. Query ข้อมูลตาม `dataset`:
     - `bookings` → `booking_detail` view ทั้งหมด (service-role client ไม่ติด RLS อยู่แล้ว ไม่ต้อง filter เพิ่ม) คอลัมน์: `ref_id, title, room_name, requester_name, requester_department, final_status, start_time, end_time, attendees, created_at`
     - `approval_history` → `staff_activity_timeline` filter `.eq('event_type', 'approval')` คอลัมน์: `actor_name, related_ref, sub_type, detail, occurred_at`
     - `users` → ตาราง `users` ทั้งหมด คอลัมน์: `full_name, email, role, department, created_at`
  4. สร้าง CSV string เอง (escape comma/quote/newline ตาม RFC 4180 — ครอบค่าด้วย `"` และ double-up `"` ที่อยู่ในค่า ถ้าค่ามี comma/quote/newline) — บรรทัดแรกเป็น header ภาษาไทย
  5. คืน `Response` พร้อม header `Content-Type: text/csv; charset=utf-8` และ `Content-Disposition: attachment; filename="<dataset>-YYYYMMDD.csv"` (วันที่ปัจจุบันแบบ Bangkok time)

### 2. `supabase/functions/update-retention-settings/index.ts`

- Method: POST, `verify_jwt=true`
- Request body: `{ activity_log_retention_months: number, integration_log_retention_months: number, line_token_retention_days: number }`
- Logic:
  1. หา identity + ตรวจ role เป็น `admin` → ไม่ใช่ → `ForbiddenError`
  2. Validate ทั้ง 3 ค่าเป็นจำนวนเต็มบวก (`Number.isInteger(x) && x > 0`) → ไม่ผ่าน → `ValidationError("ค่าที่กรอกต้องเป็นจำนวนเต็มบวก")`
  3. ดึง `system_config.id` (แถวเดียว) แล้ว `UPDATE system_config SET activity_log_retention_months=..., integration_log_retention_months=..., line_token_retention_days=... WHERE id=<id>`
  4. คืนแถวที่อัปเดตแล้ว

### 3. `supabase/functions/cleanup-logs-now/index.ts`

- Method: POST, `verify_jwt=true`, ไม่มี request body
- Logic:
  1. หา identity + ตรวจ role เป็น `admin` → ไม่ใช่ → `ForbiddenError`
  2. เรียก `adminClient.rpc('cleanup_old_logs')` (ฟังก์ชันมีอยู่แล้วจาก migration 011 — ลบ `activity_logs`/`integration_health` ที่เก่าเกิน retention period ปัจจุบันใน `system_config`, และ `line_link_tokens` ที่ใช้แล้วเก่าเกิน `line_token_retention_days` — **ไม่แตะ** `approval_logs`/`cancellation_logs` เพราะฟังก์ชันไม่ได้ลบ 2 ตารางนี้อยู่แล้วตามที่ออกแบบไว้)
  3. คืน `{ success: true }`

### 4. หน้า `/dashboard/data`

**ส่วนที่ 1 — Export ข้อมูล:** 3 ปุ่ม กดแล้ว `fetch()` ไป `export-data` พร้อม `dataset` ที่ตรงกัน → รับ response เป็น `blob()` → สร้าง `URL.createObjectURL()` → สร้าง `<a>` ชั่วคราวพร้อม `download` attribute คลิกอัตโนมัติ → `URL.revokeObjectURL()` ทิ้ง — ปุ่มที่กด disabled+เปลี่ยนข้อความเป็น "กำลังสร้างไฟล์..." ระหว่างรอ (ต่อปุ่ม แยกกัน ไม่ใช่ global loading state)

**ส่วนที่ 2 — Retention Settings:** โหลดค่าปัจจุบันจาก `system_config` ตรงจาก client (RLS "staff read" อนุญาต Admin อ่านอยู่แล้ว) ฟอร์ม 3 ช่อง number input → submit เรียก `update-retention-settings` → แสดงข้อความสำเร็จ/error

**ส่วนที่ 3 — Danger Zone:** กรอบสีแดง (`border-danger-border`, `bg-danger-surface`) แยกชัดเจนจากส่วนอื่น ปุ่ม "ล้าง log เก่าทันที" → confirm dialog เตือนว่าจะลบ `activity_logs`/`integration_health` ที่เก่าเกิน retention period ปัจจุบันถาวร กู้คืนไม่ได้ (ระบุชัดว่า `approval_logs`/`cancellation_logs` ไม่ถูกแตะ) → confirm → เรียก `cleanup-logs-now`

## Data Flow

```
Admin เปิด /dashboard/data
  → query system_config (สำหรับ retention form)

กด export → fetch export-data (dataset=X) → blob → trigger download ผ่าน <a> ชั่วคราว

แก้ retention form → submit → เรียก update-retention-settings → UPDATE system_config

กด "ล้าง log เก่าทันที" → confirm dialog → เรียก cleanup-logs-now → RPC cleanup_old_logs()
```

## Error Handling สรุป

| กรณี | Error Class | ข้อความ |
|---|---|---|
| ผู้เรียกไม่ใช่ admin (ทั้ง 3 Edge Function) | `ForbiddenError` | "ท่านไม่มีสิทธิ์ดำเนินการนี้" |
| `dataset` ไม่ถูกต้อง | `ValidationError` | "ประเภทข้อมูลไม่ถูกต้อง" |
| ค่า retention ไม่ใช่จำนวนเต็มบวก | `ValidationError` | "ค่าที่กรอกต้องเป็นจำนวนเต็มบวก" |
| `fetch()` ล้มเหลว (network/ไม่ deploy) | — | "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" — **ทุกจุดที่ `fetch()` ไป Edge Function ต้องห่อด้วย try/catch/finally เสมอ** (บทเรียนจาก sub-project 1's final review) |

## Testing (Success Criteria)

1. `npx tsc --noEmit` และ `npm run build` ผ่าน (Edge Function verify ด้วย manual review เท่านั้น เหมือนทุก track เพราะไม่มี Deno CLI/Supabase CLI/MCP ในเซสชันนี้)
2. Login `admin@test.local` เปิด `/dashboard/data` เห็นค่า retention ปัจจุบันจาก seed data (`activity_log_retention_months`=6, `integration_log_retention_months`=6, `line_token_retention_days`=7)
3. ทดสอบกดปุ่ม export ทั้ง 3 ปุ่ม — ตรวจว่า `fetch` ถูกเรียกด้วย `dataset` ที่ถูกต้องและปุ่มแสดง loading state ระหว่างรอ (ทดสอบผลลัพธ์ไฟล์จริงต้องรอ deploy Edge Function)
4. ทดสอบ validation ฟอร์ม retention — กรอกค่าติดลบ/ไม่ใช่ตัวเลข → ตรวจว่า client-side หรือ server-side reject ตามที่ออกแบบ
5. กด "ล้าง log เก่าทันที" → เห็น confirm dialog พร้อมข้อความเตือนที่ระบุชัดว่าตารางไหนถูกลบ/ไม่ถูกลบ
6. Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/dashboard/data` ตรงๆ ทาง URL → ถูก middleware บล็อก redirect ไป `/home` (ครอบคลุมด้วย prefix `/dashboard` อยู่แล้ว ไม่ต้องแก้ middleware เพิ่ม)
7. **หลัง deploy Edge Function (ผู้ใช้ทำเอง):** ทดสอบ export จริงแต่ละ dataset → เปิดไฟล์ CSV ที่ได้ตรวจว่าข้อมูลถูกต้องครบ, ทดสอบแก้ retention จริง → ตรวจ `system_config` อัปเดตถูกต้อง, ทดสอบ "ล้าง log เก่าทันที" จริง → ตรวจว่า `activity_logs`/`integration_health` เก่าถูกลบ แต่ `approval_logs`/`cancellation_logs` ไม่ถูกแตะ
