-- ============================================================
-- 025_fix_validate_booking_hours.sql
-- แก้ validate_booking_hours() ให้เทียบเวลาเต็มรวมนาที (เดิมเทียบแค่ชั่วโมง)
-- + เพิ่มเช็ค end > start และกันจองข้ามวัน
-- CREATE OR REPLACE เท่านั้น ไม่ DROP (Critical Rule #8)
-- ต้องคง `SET search_path = public` ที่ 016_harden_functions เคยตั้งไว้
-- (CREATE OR REPLACE จะล้าง per-function config ถ้าไม่ระบุซ้ำ)
-- trigger trg_validate_hours เดิมชี้ที่ฟังก์ชันนี้อยู่แล้ว
-- ============================================================
CREATE OR REPLACE FUNCTION validate_booking_hours()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cfg          record;
  booking_date date;
  start_local  timestamp;
  end_local    timestamp;
BEGIN
  SELECT office_start_hour, office_end_hour, holidays
  INTO cfg
  FROM system_config LIMIT 1;

  -- ถ้ายังไม่มี system_config (ช่วง setup) ให้ผ่านไปก่อน
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  start_local := NEW.start_time AT TIME ZONE 'Asia/Bangkok';
  end_local   := NEW.end_time   AT TIME ZONE 'Asia/Bangkok';
  booking_date := start_local::date;

  -- ตรวจวันหยุด (holidays เป็น JSON array ของ date string)
  IF cfg.holidays ? booking_date::text THEN
    RAISE EXCEPTION 'ไม่สามารถจองในวันหยุด: %', booking_date
      USING ERRCODE = 'P0001';
  END IF;

  -- เวลาจบต้องมากกว่าเวลาเริ่ม
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'เวลาจบต้องมากกว่าเวลาเริ่ม'
      USING ERRCODE = 'P0001';
  END IF;

  -- ต้องอยู่ในวันเดียวกัน (กันจองข้ามวันที่ ::time จะเทียบพลาด)
  IF start_local::date <> end_local::date THEN
    RAISE EXCEPTION 'ไม่สามารถจองข้ามวันได้'
      USING ERRCODE = 'P0001';
  END IF;

  -- ตรวจเวลาทำการ (เทียบเวลาเต็มรวมนาที)
  IF start_local::time < make_time(cfg.office_start_hour, 0, 0)
     OR end_local::time > make_time(cfg.office_end_hour, 0, 0)
  THEN
    RAISE EXCEPTION 'อยู่นอกเวลาทำการ (%:00 - %:00 น.)',
      cfg.office_start_hour, cfg.office_end_hour
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
