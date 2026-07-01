# SCHEMA.md

อ้างอิง Database Schema ทั้งหมดของระบบจองห้องประชุม LPRU ไฟล์ migration จริงอยู่ที่ `/supabase/migrations/001-014` — ไฟล์นี้เป็นสรุปสำหรับ AI Agent ใช้ก่อนเขียน query หรือแก้ schema ใดๆ

## Migration Order (ต้องรันตามลำดับเท่านั้น)

```
001_extensions.sql          → uuid-ossp, btree_gist, pgcrypto
002_users_and_auth.sql      → users table + auth_role() function
003_system_config.sql       → system_config (singleton row)
004_rooms.sql                → rooms table
005_bookings.sql             → bookings table (ตารางหลัก)
006_booking_slots.sql        → booking_slots + EXCLUDE constraint
007_approval_system.sql      → approval_logs, approval_tokens
008_cancellation_system.sql  → cancellation_logs
009_line_integration.sql     → line_link_tokens
010_monitoring_logs.sql      → activity_logs, integration_health
011_triggers_business_logic.sql → triggers ทั้งหมด
012_views.sql                → views ทั้งหมด
013_rls_policies.sql         → RLS policies ทั้งหมด
014_seed_data.sql            → seed data (dev/staging เท่านั้น ห้ามรัน production)
```

**กฎสำคัญ:** ห้าม DROP COLUMN/TABLE ตรงๆ ใน production เดียว — deprecate ก่อนเสมอ

---

## ERD สรุป

```
users ──┬─→ bookings (requester_id)
        ├─→ approval_logs (approver_id)
        ├─→ approval_tokens (approver_id)
        ├─→ cancellation_logs (cancelled_by)
        ├─→ line_link_tokens (user_id)
        └─→ system_config (admin_id / approver1_id / approver2_id)

rooms ──→ bookings (room_id)

bookings ──┬─→ booking_slots (1:1, สร้างอัตโนมัติผ่าน trigger)
           ├─→ approval_logs (booking_id)
           ├─→ approval_tokens (booking_id)
           └─→ cancellation_logs (booking_id)
```

---

## ตารางหลักทั้งหมด (9 ตาราง + 2 monitoring)

### `users`
| Column | Type | หมายเหตุ |
|---|---|---|
| id | uuid PK | = auth.users.id |
| full_name, email | text | email UNIQUE |
| role | text | 'user' \| 'approver' \| 'admin' |
| line_user_id | text UNIQUE | NULL จนกว่าจะผูก LINE |
| department | text | สำหรับ reporting |

### `system_config` (singleton — มีแค่ 1 row เสมอ)
| Column | Type | หมายเหตุ |
|---|---|---|
| admin_id, approver1_id, approver2_id | uuid FK→users | Global Approval Chain |
| office_start_hour, office_end_hour | int | default 8, 17 |
| holidays | jsonb | array ของวันที่ string |
| activity_log_retention_months | int | default 6 |
| integration_log_retention_months | int | default 6 |
| line_token_retention_days | int | default 7 |
| setup_completed | boolean | guard สำหรับ /setup wizard |

### `rooms`
capacity, status ('available'/'busy'/'maintenance'), equipment (jsonb)

### `bookings` (ตารางหลัก)
| Column | หมายเหตุ |
|---|---|
| ref_id | UNIQUE, auto-gen โดย trigger รูปแบบ `BK-YYYYMMDD-XXX` |
| final_status | ดู state list ใน PRODUCT.md |
| current_step | 0-3 |
| gcal_event_id | เก็บไว้ลบ Calendar ตอนยกเลิก |
| cancellation_reason | text |

Constraint: `valid_time` (end > start), validate ผ่าน trigger `validate_booking_hours()` (อ่านจาก system_config)

### `booking_slots`
มี `room_id` (sync จาก bookings ผ่าน trigger) + EXCLUDE constraint กัน double-booking:
```sql
EXCLUDE USING gist (room_id WITH =, tstzrange(start_time, end_time) WITH &&)
```

### `approval_logs`
UNIQUE (booking_id, step) — ป้องกันบันทึกซ้ำ step เดิม

### `approval_tokens`
one-time use token ผูก booking_id + step + approver_id, `is_used` boolean, `expires_at` (default 48 ชม.)

### `cancellation_logs`
role ('user'/'approver'/'admin'), prev_status, reason (บังคับ)

### `line_link_tokens`
otp (6 หลัก, UNIQUE), is_used, expires_at (default 10 นาที)

### `activity_logs` (monitoring, ลบได้ตาม retention)
actor_id, action, target_type, target_id, detail (jsonb)

### `integration_health` (monitoring, ลบได้ตาม retention)
service ('make_com'/'line'/'google_calendar'/'vercel'/'internal'), status ('success'/'failed'), payload, error_detail

---

## Triggers สำคัญ

| Trigger | ทำงานเมื่อ | หน้าที่ |
|---|---|---|
| `trg_booking_ref_id` | BEFORE INSERT bookings | generate ref_id อัตโนมัติ |
| `trg_validate_hours` | BEFORE INSERT bookings | ตรวจ business hours + holidays จาก system_config |
| `trg_create_slot` | AFTER INSERT bookings | สร้าง booking_slot คู่กัน |
| `trg_release_slot` | AFTER UPDATE final_status | ลบ slot เมื่อ cancelled/rejected เพื่อเปิดให้จองใหม่ |
| `trg_sync_room_id` | BEFORE INSERT booking_slots | sync room_id จาก bookings |

## Views สำคัญ

- `booking_detail` — JOIN ครบ room+requester สำหรับแสดงผล
- `pending_approvals` — filter final_status IN (pending, cancel_requested)
- `department_booking_summary` — GROUP BY department (รายเดือน)
- `room_utilization_monthly` — % การใช้ห้องต่อเดือน
- `staff_activity_timeline` — UNION approval_logs + cancellation_logs + activity_logs (สำหรับหน้าประวัติการทำงาน)
- `integration_monthly_usage` — สรุป quota usage รายเดือน

---

## RLS Policy Summary (รายละเอียดเต็มใน migration 013)

| ตาราง | User เห็น | Approver เห็น | Admin เห็น |
|---|---|---|---|
| users | ตัวเอง | ตัวเอง | ทุกคน |
| rooms | ทุกห้อง (read) | ทุกห้อง (read) | ทุกห้อง (write ได้) |
| bookings | ของตัวเอง | ทุกอัน | ทุกอัน |
| approval_logs | ของ booking ตัวเอง | ที่ตัวเองทำ | ทุกอัน |
| cancellation_logs | ของ booking ตัวเอง | ที่ตัวเองทำ | ทุกอัน |
| line_link_tokens | ของตัวเอง | ของตัวเอง | ของตัวเอง |
| system_config | - | read only | read/write |
| activity_logs | - | ที่ตัวเองทำ | ทุกอัน |
| integration_health | - | - | ทุกอัน |

**หลักการ:** UPDATE ข้อมูลสำคัญ (bookings.final_status, approval_tokens.is_used) ไม่มี RLS policy ให้ client เขียนตรง — ต้องผ่าน Edge Function ที่ใช้ `service_role` key เท่านั้น (bypass RLS โดยตั้งใจ ควบคุม logic ที่ชั้น Edge Function แทน)

Helper function ที่ใช้ทุก policy: `auth_role()` — คืนค่า role ของ `auth.uid()` ปัจจุบัน ไม่ต้อง JOIN users ซ้ำทุก policy

---

## Naming Convention

- ตาราง: `snake_case` พหูพจน์ (`bookings`, `rooms`)
- Column: `snake_case`
- Foreign key: `{table_singular}_id` (เช่น `room_id`, `approver_id`)
- Boolean: ขึ้นต้น `is_` (เช่น `is_used`)
- Timestamp: ลงท้าย `_at` (เช่น `created_at`, `expires_at`)
- Status/enum column: ใช้ `CHECK constraint` ระบุค่าที่เป็นไปได้ชัดเจน ไม่ใช้ enum type แยก

## จุดที่ต้อง Query ผ่าน Edge Function เท่านั้น (ไม่ใช่ direct client query)

- ทุกการเปลี่ยน `bookings.final_status`
- ทุกการ mark `approval_tokens.is_used = true` / `line_link_tokens.is_used = true`
- การเปลี่ยน `system_config` (ผ่าน `/functions/v1/update-approval-chain`)
- การ export ข้อมูล (ผ่าน `/functions/v1/export-data`)
