-- ============================================================
-- 013_rls_policies.sql
-- ต้องมาหลังสุดก่อน seed เพราะต้องมีตารางครบก่อน
-- หมายเหตุ: INSERT/UPDATE/DELETE ข้อมูลสำคัญทำผ่าน Edge Function
--           ที่ใช้ service_role key (bypass RLS) ไม่ใช่ client โดยตรง
-- ============================================================

-- เปิด RLS ทุกตาราง
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_slots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_link_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_rotation_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USERS
-- ============================================================
CREATE POLICY "users: read own or admin reads all"
  ON users FOR SELECT
  USING (id = auth.uid() OR auth_role() = 'admin');

-- user อัปเดตตัวเองได้ แต่ห้ามเปลี่ยน role ตัวเอง
CREATE POLICY "users: update own (role locked)"
  ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM users WHERE id = auth.uid())
  );

-- admin อัปเดตทุกคนได้รวมถึงเปลี่ยน role
CREATE POLICY "users: admin update all"
  ON users FOR UPDATE
  USING (auth_role() = 'admin');

CREATE POLICY "users: admin delete"
  ON users FOR DELETE
  USING (auth_role() = 'admin');

-- ============================================================
-- ROOMS — ทุก authenticated user อ่านได้, admin เขียนได้
-- ============================================================
CREATE POLICY "rooms: authenticated read"
  ON rooms FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "rooms: admin write"
  ON rooms FOR INSERT
  WITH CHECK (auth_role() = 'admin');

CREATE POLICY "rooms: admin update"
  ON rooms FOR UPDATE
  USING (auth_role() = 'admin');

CREATE POLICY "rooms: admin delete"
  ON rooms FOR DELETE
  USING (auth_role() = 'admin');

-- ============================================================
-- BOOKINGS
-- ============================================================
CREATE POLICY "bookings: user reads own, staff reads all"
  ON bookings FOR SELECT
  USING (
    requester_id = auth.uid()
    OR auth_role() IN ('approver', 'admin')
  );

-- INSERT: user จองได้เฉพาะในนามตัวเอง
CREATE POLICY "bookings: insert as self"
  ON bookings FOR INSERT
  WITH CHECK (requester_id = auth.uid());

-- UPDATE: ผ่าน Edge Function (service_role) เท่านั้น — ไม่มี client UPDATE policy
-- DELETE: ไม่มี hard delete, ใช้ final_status แทน

-- ============================================================
-- BOOKING_SLOTS — อ่านได้ทุก authenticated user (ตรวจ availability)
-- ============================================================
CREATE POLICY "booking_slots: authenticated read"
  ON booking_slots FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT/DELETE: ผ่าน trigger + service_role เท่านั้น

-- ============================================================
-- APPROVAL_LOGS
-- user เห็น log ของ booking ตัวเอง
-- approver เห็นเฉพาะที่ตัวเองทำ
-- admin เห็นทั้งหมด
-- ============================================================

-- Helper function ตรวจว่า booking_id เป็นของ user ปัจจุบันหรือไม่
CREATE OR REPLACE FUNCTION requester_check(p_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM bookings
    WHERE id = p_booking_id AND requester_id = auth.uid()
  )
$$;

CREATE POLICY "approval_logs: scoped read"
  ON approval_logs FOR SELECT
  USING (
    approver_id = auth.uid()        -- approver เห็นที่ตัวเองทำ
    OR requester_check(booking_id)  -- user เห็น log ของ booking ตัวเอง
    OR auth_role() = 'admin'        -- admin เห็นทั้งหมด
  );

-- ============================================================
-- APPROVAL_TOKENS — อ่านได้เฉพาะผู้ที่ถือ token และ admin
-- ============================================================
CREATE POLICY "approval_tokens: own or admin"
  ON approval_tokens FOR SELECT
  USING (
    approver_id = auth.uid()
    OR auth_role() = 'admin'
  );

-- ============================================================
-- CANCELLATION_LOGS — เหมือน approval_logs
-- ============================================================
CREATE POLICY "cancellation_logs: scoped read"
  ON cancellation_logs FOR SELECT
  USING (
    cancelled_by = auth.uid()
    OR requester_check(booking_id)
    OR auth_role() = 'admin'
  );

-- ============================================================
-- LINE_LINK_TOKENS — เห็นเฉพาะของตัวเอง
-- ============================================================
CREATE POLICY "line_link_tokens: own only"
  ON line_link_tokens FOR ALL
  USING (user_id = auth.uid());

-- ============================================================
-- CONSENT_RECORDS — เห็นเฉพาะของตัวเอง
-- ============================================================
CREATE POLICY "consent_records: own only"
  ON consent_records FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- SYSTEM_CONFIG — approver และ admin อ่านได้, admin เขียนได้
-- ============================================================
CREATE POLICY "system_config: staff read"
  ON system_config FOR SELECT
  USING (auth_role() IN ('approver', 'admin'));

CREATE POLICY "system_config: admin update"
  ON system_config FOR UPDATE
  USING (auth_role() = 'admin');

-- ============================================================
-- ACTIVITY_LOGS — approver เห็นเฉพาะที่ตัวเองทำ, admin เห็นทั้งหมด
-- ============================================================
CREATE POLICY "activity_logs: own or admin"
  ON activity_logs FOR SELECT
  USING (
    actor_id = auth.uid()
    OR auth_role() = 'admin'
  );

-- ============================================================
-- INTEGRATION_HEALTH — เฉพาะ admin
-- ============================================================
CREATE POLICY "integration_health: admin only"
  ON integration_health FOR SELECT
  USING (auth_role() = 'admin');

-- ============================================================
-- SECRET_ROTATION_LOG — เฉพาะ admin
-- ============================================================
CREATE POLICY "secret_rotation_log: admin only"
  ON secret_rotation_log FOR SELECT
  USING (auth_role() = 'admin');
