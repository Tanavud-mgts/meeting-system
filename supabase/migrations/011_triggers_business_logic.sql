-- ============================================================
-- 011_triggers_business_logic.sql
-- ต้องมาหลังทุกตารางถูกสร้างแล้ว (001-010)
-- ============================================================

-- ============================================================
-- (1) Auto-generate ref_id: BK-YYYYMMDD-XXX
-- รัน BEFORE INSERT ให้ ref_id พร้อมก่อนบันทึก
-- ============================================================
CREATE OR REPLACE FUNCTION generate_ref_id()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  today    text := TO_CHAR(NOW() AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDD');
  seq_num  int;
BEGIN
  SELECT COUNT(*) + 1 INTO seq_num
  FROM bookings
  WHERE TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDD') = today;

  NEW.ref_id := 'BK-' || today || '-' || LPAD(seq_num::text, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_booking_ref_id
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION generate_ref_id();

-- ============================================================
-- (2) ตรวจ business hours + วันหยุด จาก system_config
-- แทน static CHECK constraint เพราะต้องอ่านค่า dynamic
-- ============================================================
CREATE OR REPLACE FUNCTION validate_booking_hours()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cfg          record;
  booking_date date;
BEGIN
  SELECT office_start_hour, office_end_hour, holidays
  INTO cfg
  FROM system_config LIMIT 1;

  -- ถ้ายังไม่มี system_config (ช่วง setup) ให้ผ่านไปก่อน
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  booking_date := (NEW.start_time AT TIME ZONE 'Asia/Bangkok')::date;

  -- ตรวจวันหยุด (holidays เป็น JSON array ของ date string)
  IF cfg.holidays ? booking_date::text THEN
    RAISE EXCEPTION 'ไม่สามารถจองในวันหยุด: %', booking_date
      USING ERRCODE = 'P0001';
  END IF;

  -- ตรวจเวลาทำการ
  IF EXTRACT(HOUR FROM NEW.start_time AT TIME ZONE 'Asia/Bangkok') < cfg.office_start_hour
     OR EXTRACT(HOUR FROM NEW.end_time AT TIME ZONE 'Asia/Bangkok') > cfg.office_end_hour
  THEN
    RAISE EXCEPTION 'อยู่นอกเวลาทำการ (%:00 - %:00 น.)',
      cfg.office_start_hour, cfg.office_end_hour
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_hours
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION validate_booking_hours();

-- ============================================================
-- (3) Auto-insert booking_slot เมื่อ INSERT booking
-- สร้างคู่กันอัตโนมัติ ไม่ต้องเรียกจาก application code
-- ============================================================
CREATE OR REPLACE FUNCTION create_booking_slot()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO booking_slots (booking_id, start_time, end_time)
  VALUES (NEW.id, NEW.start_time, NEW.end_time);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_slot
  AFTER INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION create_booking_slot();

-- ============================================================
-- (4) ลบ booking_slot เมื่อ final_status เปลี่ยนเป็น cancelled/rejected
-- เปิด slot ให้คนอื่นจองได้ทันทีโดยไม่ต้องรอ
-- ============================================================
CREATE OR REPLACE FUNCTION release_slot_on_cancel()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.final_status IN ('cancelled', 'cancelled_by_admin', 'rejected')
     AND OLD.final_status NOT IN ('cancelled', 'cancelled_by_admin', 'rejected')
  THEN
    DELETE FROM booking_slots WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_release_slot
  AFTER UPDATE OF final_status ON bookings
  FOR EACH ROW EXECUTE FUNCTION release_slot_on_cancel();

-- ============================================================
-- (5) updated_at สำหรับ system_config
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_system_config_updated
  BEFORE UPDATE ON system_config
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- (6) cleanup_old_logs() — เรียกจาก Make.com Scheduler
-- ลบ log ที่เก่ากว่า retention period ที่ตั้งไว้ใน system_config
-- approval_logs และ cancellation_logs ไม่อยู่ใน cleanup (เก็บถาวร)
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cfg record;
BEGIN
  SELECT activity_log_retention_months,
         integration_log_retention_months,
         line_token_retention_days
  INTO cfg
  FROM system_config LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM activity_logs
    WHERE created_at < now() - (cfg.activity_log_retention_months || ' months')::interval;

  DELETE FROM integration_health
    WHERE created_at < now() - (cfg.integration_log_retention_months || ' months')::interval;

  DELETE FROM line_link_tokens
    WHERE is_used = true
      AND created_at < now() - (cfg.line_token_retention_days || ' days')::interval;
END;
$$;

-- ============================================================
-- (7) anonymize_user_on_delete_request() — PDPA สิทธิ์ขอลบบัญชี
-- ไม่ hard delete เพราะต้องรักษา audit trail (approval/cancellation logs)
-- แค่ลบข้อมูลที่ระบุตัวตนได้ออก
-- ============================================================
CREATE OR REPLACE FUNCTION anonymize_user_on_delete_request(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users SET
    full_name    = 'ผู้ใช้ที่ถูกลบ',
    email        = 'deleted-' || id || '@anonymized.local',
    line_user_id = NULL,
    department   = NULL
  WHERE id = p_user_id;
  -- approval_logs, bookings ยังอ้างอิง id เดิมได้ เพื่อ audit trail
  -- แต่ JOIN มาแล้วจะเห็นแค่ "ผู้ใช้ที่ถูกลบ" ไม่เห็นชื่อจริง
END;
$$;
