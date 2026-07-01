-- ============================================================
-- 007_approval_system.sql
-- ต้องมาหลัง bookings + users
-- ============================================================

-- ============================================================
-- approval_logs — บันทึกทุกการตัดสินใจในแต่ละ step
-- เก็บถาวร ไม่มีการลบ (หลักฐานราชการ)
-- ============================================================
CREATE TABLE approval_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  approver_id  uuid        NOT NULL REFERENCES users(id),
  step         int         NOT NULL CHECK (step BETWEEN 1 AND 3),
  action       text        NOT NULL CHECK (action IN ('approved', 'rejected')),
  note         text,
  acted_at     timestamptz DEFAULT now(),

  -- แต่ละ step บันทึกได้ครั้งเดียวต่อ booking — ป้องกัน race condition
  UNIQUE (booking_id, step)
);

CREATE INDEX idx_approval_logs_booking ON approval_logs (booking_id);

-- ============================================================
-- approval_tokens — one-time token ส่งไปใน LINE Flex Message
-- ใช้ทั้งเว็บและ LINE postback — ต้องเป็น token เดียวกัน
-- ============================================================
CREATE TABLE approval_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  approver_id  uuid        NOT NULL REFERENCES users(id),
  step         int         NOT NULL CHECK (step BETWEEN 1 AND 3),
  is_used      boolean     NOT NULL DEFAULT false,
  -- default 48 ชั่วโมง เพื่อให้ Approver มีเวลาพอ
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  created_at   timestamptz DEFAULT now()
);

-- UNIQUE partial index: แต่ละ step มี active token (is_used=false) ได้แค่ 1 อัน
CREATE UNIQUE INDEX idx_tokens_active_step
  ON approval_tokens (booking_id, step)
  WHERE (is_used = false);

CREATE INDEX idx_tokens_booking ON approval_tokens (booking_id);
