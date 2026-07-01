-- ============================================================
-- 006_booking_slots.sql
-- ต้องมาหลัง bookings และ extensions (btree_gist จาก 001)
-- ใช้ตรวจ double-booking ผ่าน EXCLUDE constraint
-- ============================================================

CREATE TABLE booking_slots (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  room_id     uuid,        -- sync จาก bookings ผ่าน trigger trg_sync_room_id
  start_time  timestamptz NOT NULL,
  end_time    timestamptz NOT NULL
);

-- ============================================================
-- sync room_id จาก bookings เข้า booking_slots
-- จำเป็นเพราะ EXCLUDE constraint ต้องตรวจ overlap แยกตามห้อง
-- ============================================================
CREATE OR REPLACE FUNCTION sync_slot_room_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT room_id INTO NEW.room_id
  FROM bookings WHERE id = NEW.booking_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_room_id
  BEFORE INSERT ON booking_slots
  FOR EACH ROW EXECUTE FUNCTION sync_slot_room_id();

-- ============================================================
-- EXCLUDE constraint — หัวใจของการป้องกัน double-booking
-- ป้องกัน 2 booking ที่มี room_id เดียวกัน และช่วงเวลาซ้อนทับกัน
-- ต้องการ btree_gist extension (ติดตั้งใน 001)
-- ============================================================
ALTER TABLE booking_slots ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (
    room_id    WITH =,
    tstzrange(start_time, end_time) WITH &&
  );

-- Index สำหรับ query ตรวจ availability
CREATE INDEX idx_slots_time ON booking_slots
  USING gist (room_id, tstzrange(start_time, end_time));

-- ============================================================
-- Helper function ตรวจห้องว่างก่อน INSERT (ใช้ใน Frontend ก็ได้)
-- ไม่รวม booking ที่ถูกยกเลิก/ปฏิเสธแล้ว
-- ============================================================
CREATE OR REPLACE FUNCTION check_slot_available(
  p_room_id  uuid,
  p_start    timestamptz,
  p_end      timestamptz
) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM booking_slots bs
    JOIN bookings b ON b.id = bs.booking_id
    WHERE b.room_id = p_room_id
      AND b.final_status NOT IN ('cancelled', 'cancelled_by_admin', 'rejected')
      AND tstzrange(bs.start_time, bs.end_time) && tstzrange(p_start, p_end)
  )
$$;
