-- ============================================================
-- 008_cancellation_system.sql
-- ต้องมาหลัง bookings + users
-- ============================================================

-- ============================================================
-- cancellation_logs — บันทึกทุกการยกเลิก
-- เก็บถาวร ไม่มีการลบ (หลักฐานราชการ)
-- ============================================================
CREATE TABLE cancellation_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  cancelled_by  uuid        NOT NULL REFERENCES users(id),
  role          text        NOT NULL CHECK (role IN ('user', 'approver', 'admin')),
  -- สถานะก่อนยกเลิก เพื่อ audit ย้อนหลัง
  prev_status   text        NOT NULL,
  -- เหตุผลบังคับกรอก (ตรวจที่ Edge Function)
  reason        text        NOT NULL,
  cancelled_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_cancel_booking ON cancellation_logs (booking_id);
CREATE INDEX idx_cancel_by ON cancellation_logs (cancelled_by);
