-- ============================================================
-- 023_lock_system_config_writes.sql
-- ปิดช่องโหว่: admin เขียน system_config ตรงจาก client ได้
-- (bypass validateNotificationSettings() ใน update-notification-settings
--  และ validation ของ update-approval-chain, ไม่มี activity_logs audit row)
--
-- แก้โดยถอด client-facing UPDATE policy ออกทั้งหมด — ตามแพตเทิร์นเดียวกับ
-- bookings/booking_slots ใน 013_rls_policies.sql ("ผ่าน Edge Function
-- (service_role) เท่านั้น — ไม่มี client UPDATE policy") เพราะ service_role
-- bypass RLS อยู่แล้ว จึงไม่ต้องมี policy ฝั่ง client สำหรับ UPDATE
-- ============================================================

DROP POLICY IF EXISTS "system_config: admin update" ON system_config;

-- ไม่มี INSERT/DELETE policy อยู่แล้วสำหรับ system_config (เขียนผ่าน
-- service_role เท่านั้น) — migration นี้จึงปิดเฉพาะ UPDATE ที่เคยเปิดไว้
