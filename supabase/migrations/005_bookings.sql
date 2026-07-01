-- ============================================================
-- 005_bookings.sql
-- ตารางหลักของระบบ
-- หมายเหตุ: ไม่มี static CHECK สำหรับ office_hours
--           เพราะต้องอ่านจาก system_config — ทำเป็น trigger ใน 011 แทน
-- ============================================================

CREATE TABLE bookings (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ref_id สร้างอัตโนมัติผ่าน trigger ใน 011 รูปแบบ BK-YYYYMMDD-XXX
  ref_id               text        UNIQUE,

  room_id              uuid        NOT NULL REFERENCES rooms(id),
  requester_id         uuid        NOT NULL REFERENCES users(id),

  title                text        NOT NULL,
  activity             text        NOT NULL,
  attendees            int         NOT NULL CHECK (attendees > 0),

  start_time           timestamptz NOT NULL,
  end_time             timestamptz NOT NULL,

  -- State machine (ดูรายละเอียดใน PRODUCT.md)
  final_status         text        NOT NULL DEFAULT 'pending'
                         CHECK (final_status IN (
                           'pending',
                           'approved',
                           'rejected',
                           'cancelled',
                           'cancel_requested',
                           'cancelled_by_admin'
                         )),

  -- 0=pending, 1=admin approved, 2=approver1 approved, 3=fully approved
  current_step         int         NOT NULL DEFAULT 0
                         CHECK (current_step BETWEEN 0 AND 3),

  -- เก็บไว้เพื่อลบ Google Calendar event ตอนยกเลิก
  gcal_event_id        text,

  -- เหตุผลยกเลิก (บังคับกรอก ตรวจที่ Edge Function)
  cancellation_reason  text,

  created_at           timestamptz DEFAULT now(),

  CONSTRAINT valid_time CHECK (end_time > start_time)
);

-- Index สำหรับ query ที่ใช้บ่อยที่สุด
-- WHERE ไม่รวม status ที่ยกเลิก/ปฏิเสธแล้ว เพื่อไม่ให้ block slot ใหม่
CREATE INDEX idx_bookings_room_time ON bookings (room_id, start_time, end_time)
  WHERE final_status NOT IN ('cancelled', 'cancelled_by_admin', 'rejected');

CREATE INDEX idx_bookings_requester ON bookings (requester_id, created_at DESC);

CREATE INDEX idx_bookings_status ON bookings (final_status)
  WHERE final_status IN ('pending', 'cancel_requested');
