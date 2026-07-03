# Track D (sub-project 1) — จัดการห้อง/ผู้ใช้/ตั้งค่าระบบ (`/dashboard/rooms`, `/dashboard/users`, `/dashboard/settings`)

## บริบท

Track D ทั้งหมดครอบคลุม 9 หน้าของ Admin ตาม `docs/PRODUCT.md` ส่วนที่ 6 (`/setup`, `/dashboard`, `/dashboard/rooms`, `/dashboard/users`, `/dashboard/bookings`, `/dashboard/settings`, `/dashboard/data`, `/dashboard/integrations`, `/dashboard/activity`) ซึ่งกว้างเกินไปสำหรับ implementation plan เดียว จึงแบ่งเป็น sub-project — นี่คือ sub-project แรก ครอบคลุมเฉพาะ 3 หน้าที่เป็น CRUD form ธรรมดาบนตารางที่มีอยู่แล้ว (`rooms`, `users`, `system_config`) ไม่มี integration ภายนอกเกี่ยวข้อง

หน้าที่เหลือ (`/setup`, `/dashboard` overview, `/dashboard/bookings`, `/dashboard/data`, `/dashboard/integrations`, `/dashboard/activity`) จะแยกเป็น sub-project ถัดไป

## ขอบเขต

**อยู่ในขอบเขตนี้:**
- `supabase/functions/update-approval-chain/index.ts` — Edge Function เดียวของ sub-project นี้
- `supabase/migrations/018_harden_anonymize_execute_grant.sql` — ปิดช่องโหว่ `PUBLIC EXECUTE` ของ `anonymize_user_on_delete_request()` ตามแพทเทิร์นของ migration 017
- หน้า `/dashboard/rooms` — CRUD ห้องประชุม
- หน้า `/dashboard/users` — แก้ role/department + PDPA anonymize
- หน้า `/dashboard/settings` — Approval Chain, เวลาทำการ, วันหยุด

**ไม่อยู่ในขอบเขตนี้ (เก็บไว้ให้ sub-project ถัดไป):**
- `/setup` First-time Setup Wizard — ไม่จำเป็นสำหรับ dev/test เพราะ `system_config` มี seed data อยู่แล้ว
- `/dashboard` (หน้าภาพรวม), `/dashboard/bookings` (รายการจองทั้งหมด + direct-cancel-anytime ที่ Track C เว้นไว้), `/dashboard/data` (Export/retention/danger zone), `/dashboard/integrations` (Integration Health), `/dashboard/activity` (audit log รวม)
- "สร้างผู้ใช้ใหม่" — `users.id` อ้างอิง `auth.users(id)` โดยตรง ผู้ใช้ถูกสร้างผ่าน login (OAuth/password) เท่านั้น ไม่มี insert policy ให้สร้างตรงจาก dashboard
- Hard delete ผู้ใช้ — ใช้ PDPA anonymize แทนตามที่ตกลง (ลบแถว `users` ตรงจะทิ้ง `auth.users` ค้างไว้ เสี่ยงข้อมูลไม่สอดคล้องกัน)

## สถาปัตยกรรม / Components

### หลักการแบ่ง Edge Function vs Direct Client Write

`docs/SCHEMA.md` ระบุรายการที่ "ต้อง Query ผ่าน Edge Function เท่านั้น" ไว้ชัดเจน — `rooms` และ `users.role`/`users.department` **ไม่อยู่ในรายการนั้น** และ RLS (`013_rls_policies.sql`) อนุญาต Admin เขียนตรงอยู่แล้ว (`rooms: admin write/update/delete`, `users: admin update all`) จึงใช้ direct client CRUD ได้โดยไม่ต้องมี Edge Function

`system_config` **อยู่ในรายการนั้น** ("การเปลี่ยน system_config ผ่าน `/functions/v1/update-approval-chain`") แม้ RLS จะอนุญาต Admin เขียนตรงได้เช่นกัน (`system_config: admin update`) แต่สเปคระบุให้ผ่าน Edge Function เพื่อเพิ่ม validation ที่ RLS ทำไม่ได้ (ตรวจ role ของสมาชิก chain, ตรวจไม่ให้ซ้ำกัน, ตรวจความสัมพันธ์ของเวลา)

### 1. `supabase/migrations/018_harden_anonymize_execute_grant.sql`

```sql
REVOKE EXECUTE ON FUNCTION public.anonymize_user_on_delete_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_user_on_delete_request(uuid) TO authenticated;
```

เหตุผล: ฟังก์ชันนี้สร้างใน migration 011 แต่ไม่เคยถูกรวมในการ harden EXECUTE grant ของ migration 017 (ตอนนั้นยังไม่มีหน้า UI เรียกใช้จริง) เนื่องจาก Track D นี้เป็นจุดแรกที่ expose การเรียกใช้ผ่าน UI จึงควรปิดช่องโหว่ก่อน — Postgres grant `EXECUTE` ให้ `PUBLIC` โดย default เสมอตอนสร้างฟังก์ชัน (บทเรียนเดียวกับ 016/017) RLS ภายในฟังก์ชัน (ผ่าน `UPDATE users` ที่ inherit policy `users: update own`/`users: admin update all`) ป้องกันการแก้ข้อมูลคนอื่นอยู่แล้วแม้ไม่ revoke แต่ revoke เพื่อความสอดคล้องตามแพทเทิร์นที่วางไว้และ defense-in-depth

### 2. `supabase/functions/update-approval-chain/index.ts`

- Method: POST, `verify_jwt=true`
- Request body: `{ admin_id: string, approver1_id: string, approver2_id: string, office_start_hour: number, office_end_hour: number, holidays: string[] }`
- Logic:
  1. หา identity ผู้เรียกผ่าน `auth.getUser()` (dual-client pattern เดียวกับ track อื่น)
  2. ตรวจ role ของผู้เรียกจากตาราง `users` (service-role client) — ถ้าไม่ใช่ `admin` → throw `ForbiddenError("ท่านไม่มีสิทธิ์แก้ไขการตั้งค่านี้")`
  3. Validate `admin_id`, `approver1_id`, `approver2_id` ไม่ซ้ำกันเอง (ทั้ง 3 ค่าต้องต่างกัน) → ถ้าซ้ำ throw `ValidationError("ผู้อนุมัติในแต่ละขั้นตอนต้องไม่ซ้ำกัน")`
  4. Query `users` ด้วย service-role client หา role ของทั้ง 3 คน — `admin_id` ต้องมี `role='admin'`, `approver1_id`/`approver2_id` ต้องมี `role IN ('approver','admin')` — ถ้าไม่ตรง throw `ValidationError("ผู้ที่เลือกต้องมีสิทธิ์ Approver หรือ Admin")` (ถ้าหา user ไม่เจอเลย → `ValidationError` เดียวกัน ถือเป็นค่าที่เลือกไม่ถูกต้อง)
  5. Validate `office_start_hour < office_end_hour` (ทั้งคู่เป็น int ในช่วง 0-23) → ถ้าไม่ผ่าน throw `ValidationError("เวลาเปิดทำการต้องน้อยกว่าเวลาปิดทำการ")`
  6. `UPDATE system_config SET admin_id=..., approver1_id=..., approver2_id=..., office_start_hour=..., office_end_hour=..., holidays=...` (service-role client, ตาราง singleton ไม่ต้องมี WHERE เจาะจงแถว — มีแถวเดียวเสมอ)
  7. สำเร็จ → คืนค่า config ที่อัปเดตแล้ว

### 3. หน้า `/dashboard/rooms`

- Query ตรงจาก client: `rooms` เรียงตาม `name ASC`
- ฟอร์ม Create/Edit ในโหมด dialog: `name` (text, required), `capacity` (number, ต้อง > 0), `status` (select: available/busy/maintenance), `equipment` (text คั่นด้วยจุลภาค parse เป็น JSON array ตอน submit)
- Create/Edit → `INSERT`/`UPDATE` ตรงจาก client (RLS อนุญาต admin)
- ปุ่มลบต่อแถว → confirm dialog → ก่อนเรียก `DELETE` ให้ query นับ `bookings WHERE room_id = ...` ก่อนเสมอ (client-side guard กัน raw FK error จาก Postgres) — มี booking → แสดง error "ห้องนี้มีประวัติการจอง ไม่สามารถลบได้ กรุณาเปลี่ยนสถานะเป็น 'ปิดปรับปรุง' แทน" ไม่เรียก DELETE — ไม่มี booking → `DELETE` ตรง

### 4. หน้า `/dashboard/users`

- Query ตรงจาก client: `users` เรียงตาม `full_name ASC` — แสดง `full_name`, `email`, `role`, `department` (read-only: `full_name`, `email`, `line_user_id`)
- แก้ `role` (select)/`department` (text) ต่อแถว → `UPDATE` ตรงจาก client (RLS "admin update all")
- ปุ่ม "ลบข้อมูลส่วนตัว (PDPA)" ต่อแถว → confirm dialog เตือนว่าลบชื่อ/อีเมล/LINE ID ถาวร (ประวัติการจอง/อนุมัติยังอยู่) → ถ้าตรวจพบว่า `user.id` ตรงกับ `system_config.admin_id`/`approver1_id`/`approver2_id` ปัจจุบัน (query `system_config` มาเทียบก่อนแสดง dialog) ให้เพิ่มคำเตือนพิเศษในกล่อง confirm แต่ไม่บล็อกการกระทำ → confirm → เรียก `supabase.rpc('anonymize_user_on_delete_request', { p_user_id: user.id })` → รีโหลดตาราง

### 5. หน้า `/dashboard/settings`

- Query ตรงจาก client: `system_config` แถวเดียว (RLS "system_config: staff read") + `users` filter `role IN ('approver','admin')` (สำหรับ dropdown เลือก chain)
- ฟอร์ม: 3 dropdown (Admin/Approver1/Approver2 — เลือกจาก `users` ที่ query มา), `office_start_hour`/`office_end_hour` (number 0-23), `holidays` (เพิ่ม/ลบวันที่ทีละรายการ)
- Submit → เรียก `update-approval-chain` → แสดง error ภาษาไทยถ้า validation ไม่ผ่าน (ไม่ต้อง refetch ค่าฟอร์มเดิม ผู้ใช้แก้ต่อจากที่กรอกไว้ได้เลย) → สำเร็จ → แสดงข้อความยืนยันและ refetch ค่าล่าสุด

## Data Flow

```
Admin เปิด /dashboard/rooms
  → query rooms ทั้งหมด
  → Create/Edit ผ่าน form → INSERT/UPDATE ตรง (RLS อนุญาต admin)
  → Delete → เช็ค bookings ที่อ้างอิงห้องนี้ก่อน (client-side count query)
      → มี booking → แสดง error ไม่ลบ
      → ไม่มี booking → DELETE ตรง (RLS อนุญาต admin)

Admin เปิด /dashboard/users
  → query users ทั้งหมด
  → แก้ role/department → UPDATE ตรง (RLS "admin update all")
  → กด anonymize → เช็คว่าอยู่ใน chain ปัจจุบันหรือไม่ (เตือนถ้าใช่) → confirm
      → เรียก rpc('anonymize_user_on_delete_request') → RLS "admin update all" อนุญาตให้ทำแทนคนอื่นได้

Admin เปิด /dashboard/settings
  → query system_config + users (role IN approver/admin) สำหรับ dropdown
  → แก้ไข → submit → เรียก update-approval-chain Edge Function
      → validate ครบ (chain ไม่ซ้ำ, role เหมาะสม, เวลาถูกต้อง)
      → สำเร็จ: UPDATE system_config (service-role client)
      → ล้มเหลว: คืน ValidationError พร้อมข้อความไทย
```

## Error Handling สรุป

| กรณี | ที่มา | ข้อความ |
|---|---|---|
| ลบห้องที่มีประวัติการจอง | client-side guard (ก่อนเรียก DELETE) | "ห้องนี้มีประวัติการจอง ไม่สามารถลบได้ กรุณาเปลี่ยนสถานะเป็น 'ปิดปรับปรุง' แทน" |
| capacity ไม่ใช่จำนวนเต็มบวก | client-side validate + DB `CHECK (capacity > 0)` | "จำนวนที่นั่งต้องมากกว่า 0" |
| Approval Chain มีคนซ้ำกัน | `update-approval-chain` (`ValidationError`) | "ผู้อนุมัติในแต่ละขั้นตอนต้องไม่ซ้ำกัน" |
| Chain member role ไม่เหมาะสม/ไม่พบ user | `update-approval-chain` (`ValidationError`) | "ผู้ที่เลือกต้องมีสิทธิ์ Approver หรือ Admin" |
| `office_start_hour >= office_end_hour` | `update-approval-chain` (`ValidationError`) | "เวลาเปิดทำการต้องน้อยกว่าเวลาปิดทำการ" |
| ผู้เรียก `update-approval-chain` ไม่ใช่ admin | `update-approval-chain` (`ForbiddenError`) | "ท่านไม่มีสิทธิ์แก้ไขการตั้งค่านี้" |

## Testing (Success Criteria)

1. `npx tsc --noEmit` และ `npm run build` ผ่าน (Edge Function verify ด้วย manual review เท่านั้น เหมือน track อื่น เพราะไม่มี Deno CLI/Supabase CLI/MCP ในเซสชันนี้)
2. Login `admin@test.local` เปิด `/dashboard/rooms` เห็นห้องจาก seed data ครบ, สร้างห้องใหม่ได้, แก้ไขห้องได้, ลบห้องที่ไม่มี booking ได้, ลองลบห้องที่มี booking (เช่นห้องที่ผูกกับ Booking 1 จาก seed) → ได้ error ตามที่ออกแบบ ไม่ลบ
3. Login `admin@test.local` เปิด `/dashboard/users` เห็น user จาก seed data ครบ 4 คน, เปลี่ยน role ของคนหนึ่งได้, กด anonymize คนที่ไม่ได้อยู่ใน chain → สำเร็จไม่มี warning พิเศษ, กด anonymize คนที่อยู่ใน chain (เช่น `approver1@test.local`) → เห็น warning พิเศษก่อน confirm
4. Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/dashboard/rooms`, `/dashboard/users`, `/dashboard/settings` ตรงๆ ทาง URL → ถูก middleware บล็อก redirect ไป `/home` (route เหล่านี้ครอบคลุมด้วย `/dashboard` prefix → `["admin"]` ที่มีอยู่แล้ว ไม่ต้องแก้ middleware เพิ่ม)
5. Login `admin@test.local` เปิด `/dashboard/settings` แก้ Approval Chain ให้ 2 ขั้นตอนเป็นคนเดียวกัน → ได้ validation error ไม่บันทึก, แก้ไขให้ถูกต้อง → บันทึกสำเร็จ, ทดสอบตั้ง `office_start_hour > office_end_hour` → ได้ validation error, ทดสอบเลือกคนที่ role เป็น `user` ธรรมดาเข้า chain (ถ้าทำได้ผ่าน dropdown ที่ filter ไว้แล้วควรเลือกไม่ได้อยู่แล้ว แต่ยืนยัน server-side validation ทำงานด้วยการยิง request ตรงจาก console)
