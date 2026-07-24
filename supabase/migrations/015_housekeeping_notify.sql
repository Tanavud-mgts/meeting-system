-- ============================================================
-- 015_housekeeping_notify.sql
-- แจ้งเตือนกลุ่มแม่บ้าน (LINE group): สรุปพรุ่งนี้ + อนุมัติ/ยกเลิกระยะใกล้
-- ADD/CREATE ล้วน ไม่ DROP (production เดียว)
-- ============================================================

-- 1. หมายเหตุถึงแม่บ้านต่อการจอง (การจัดห้อง/อุปกรณ์/น้ำ) — ไม่บังคับ
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes_for_staff text;

-- 2. ตั้งค่าแจ้งเตือนกลุ่มแม่บ้าน (system_config เป็น singleton)
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS housekeeping_enabled            boolean NOT NULL DEFAULT false;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS housekeeping_line_group_id      text;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS housekeeping_digest_hour        int NOT NULL DEFAULT 17
                                    CHECK (housekeeping_digest_hour BETWEEN 0 AND 23);
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS housekeeping_digest_last_sent_on date;

-- 3. เพิ่ม notes_for_staff เข้า view booking_detail (recreate — เดิมมี activity/attendees/department แล้ว)
--    หมายเหตุ: CREATE OR REPLACE VIEW เพิ่มคอลัมน์ได้เฉพาะ "ต่อท้าย" เท่านั้น
--    ห้ามแทรกกลาง/สลับตำแหน่งคอลัมน์เดิม (Postgres 42P16) — notes_for_staff จึงอยู่ท้ายสุด
--    โค้ดทุกจุด select by name ลำดับคอลัมน์ไม่กระทบการใช้งาน
CREATE OR REPLACE VIEW booking_detail AS
SELECT
  b.id,
  b.ref_id,
  b.title,
  b.activity,
  b.attendees,
  b.start_time,
  b.end_time,
  b.final_status,
  b.current_step,
  b.gcal_event_id,
  b.cancellation_reason,
  b.created_at,
  r.id           AS room_id,
  r.name         AS room_name,
  r.capacity     AS room_capacity,
  r.equipment    AS room_equipment,
  u.id           AS requester_id,
  u.full_name    AS requester_name,
  u.email        AS requester_email,
  u.line_user_id AS requester_line_id,
  u.department   AS requester_department,
  b.notes_for_staff
FROM bookings b
JOIN rooms r ON r.id = b.room_id
JOIN users u ON u.id = b.requester_id;

-- 4. เปิด extension สำหรับตั้งเวลา (ตรวจ list_extensions ก่อน)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
