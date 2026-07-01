# SECURITY.md

บันทึกประวัติการแก้ไขปัญหาความปลอดภัยที่เจอจาก Supabase Security Advisor และเหตุผลของ warning ที่ตั้งใจปล่อยไว้ (ไม่ใช่บั๊ก) — อ่านก่อนตอบคำถามเรื่อง security advisor ในอนาคต จะได้ไม่ต้องสืบซ้ำ

## Migration ที่เกี่ยวข้องกับ Security

| Migration | แก้อะไร |
|---|---|
| `015_fix_security_definer_views.sql` | Views ทั้ง 6 ตัวใน `012_views.sql` ถูกสร้างแบบ default ทำให้รันด้วยสิทธิ์เจ้าของ view (bypass RLS ของตารางที่ join) แก้โดยตั้ง `security_invoker = true` ให้ทุก view |
| `016_harden_functions.sql` | ตั้ง `search_path` ให้ function ที่ทราบที่มาทั้งหมด (กัน search_path hijacking) + ย้าย extension `btree_gist` ออกจาก schema `public` ไปที่ `extensions` |
| `017_fix_public_execute_grants.sql` | Revoke `EXECUTE` จาก `PUBLIC` บน `auth_role()` และ `requester_check(uuid)` แล้ว grant กลับให้เฉพาะ `authenticated` (revoke จาก `anon` เฉยๆ ใน 016 ไม่พอ เพราะ Postgres grant `EXECUTE` ให้ `PUBLIC` โดย default ตอนสร้าง function เสมอ ต้อง revoke จาก `PUBLIC` ตรงๆ ถึงตัดสิทธิ์ `anon` ได้จริง) |

## Warning ที่ยอมรับได้ (ตั้งใจปล่อยไว้ ไม่ใช่บั๊ก)

| Warning | Function | เหตุผล |
|---|---|---|
| `anon_security_definer_function_executable` / `authenticated_security_definer_function_executable` | `rls_auto_enable()` | Function ประเภท `event_trigger` (Supabase-managed, ไม่ได้มาจาก migration ของโปรเจกต์นี้) ทำหน้าที่เปิด RLS อัตโนมัติทุกครั้งที่มี `CREATE TABLE` ใหม่ใน schema `public` — เรียกตรงผ่าน SQL/RPC ไม่ได้จริง (Postgres จะ error ทันที) แม้ linter จะเห็นว่ามี `EXECUTE` grant อยู่ ก็ไม่มีทางถูกเรียกใช้นอกบริบท event trigger ได้ |
| `authenticated_security_definer_function_executable` | `auth_role()`, `requester_check(uuid)` | **ตั้งใจ** — RLS policies เกือบทุกตาราง (`users`, `bookings`, `system_config`, `approval_logs`, `cancellation_logs`, `activity_logs`, `integration_health`) เรียก function สองตัวนี้ตอน evaluate policy ถ้า revoke `EXECUTE` จาก `authenticated` ด้วย ระบบอนุมัติทั้งหมดจะพังทันที (approver/admin query อะไรไม่ได้เลย) จำเป็นต้องเป็น `SECURITY DEFINER` เพื่ออ่าน `users.role` โดยไม่ชนกับ RLS ของตาราง `users` เอง (ป้องกัน infinite recursion) |

## หมายเหตุ: เอกสารไม่ตรงกับ schema จริง

- `docs/SCHEMA.md` สรุปว่ามี "9 ตารางหลัก + 2 monitoring" (11 ตาราง) แต่ [013_rls_policies.sql](../supabase/migrations/013_rls_policies.sql) เปิด RLS ให้ 13 ตาราง จริง — เพิ่ม `consent_records` และ `secret_rotation_log` ที่ SCHEMA.md ไม่ได้พูดถึงเลย ควรอัปเดต SCHEMA.md ให้ตรงกับของจริงในโอกาสถัดไป
