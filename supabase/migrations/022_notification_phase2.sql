-- ============================================================
-- 022_notification_phase2.sql
-- เฟส 2 ของระบบแจ้งเตือน: Discord + WeLPRU push + flow ยืนยัน staff_id
-- ============================================================

-- ============================================================
-- (1) welpru_link_tokens — ลอก pattern line_link_tokens (009)
-- Flow: เว็บ generate token → ส่ง push ทดสอบ → user แตะลิงก์ยืนยัน
-- ============================================================
CREATE TABLE welpru_link_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_id   text        NOT NULL,
  token      text        NOT NULL UNIQUE,
  is_used    boolean     NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_welpru_token
  ON welpru_link_tokens (token)
  WHERE is_used = false;

ALTER TABLE welpru_link_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "welpru_link_tokens: own only"
  ON welpru_link_tokens FOR ALL
  USING (user_id = auth.uid());

-- ============================================================
-- (2) users.welpru_verified_at — NULL = ยังไม่ยืนยัน
-- Trigger: staff_id ถูกแก้ → reset เป็นยังไม่ยืนยัน (data-integrity เท่านั้น
-- ไม่ใช่ trigger สร้างข้อความแจ้งเตือน — คนละเรื่องกับที่ตัดทิ้งใน spec)
-- ============================================================
ALTER TABLE users ADD COLUMN welpru_verified_at timestamptz;

CREATE OR REPLACE FUNCTION reset_welpru_verification_on_staff_id_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
    NEW.welpru_verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reset_welpru_verification
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION reset_welpru_verification_on_staff_id_change();

-- ขยาย anonymize (020) ให้ล้าง welpru_verified_at ด้วย (PDPA) — trigger ด้านบน
-- จะล้างให้อยู่แล้วเพราะ SET staff_id=NULL ด้วย แต่ระบุตรงๆ ไว้ให้ชัดเจน
-- เผื่อผู้อ่านโค้ดในอนาคตตรวจ anonymize function โดยไม่ไล่ trigger ตาม
CREATE OR REPLACE FUNCTION public.anonymize_user_on_delete_request(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.users SET
    full_name          = 'ผู้ใช้ที่ถูกลบ',
    email               = 'deleted-' || id || '@anonymized.local',
    line_user_id        = NULL,
    department          = NULL,
    phone               = NULL,
    staff_id            = NULL,
    welpru_verified_at  = NULL
  WHERE id = p_user_id;
END;
$$;

-- ============================================================
-- (3) system_config — master toggle 3 ช่องทาง + per-event override
-- ============================================================
ALTER TABLE system_config
  ADD COLUMN welpru_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN discord_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN line_enabled    boolean NOT NULL DEFAULT false,
  ADD COLUMN notification_settings jsonb NOT NULL DEFAULT '{}';

-- ============================================================
-- (4) ขยาย CHECK constraints
-- ============================================================
ALTER TABLE integration_health DROP CONSTRAINT integration_health_service_check;
ALTER TABLE integration_health ADD CONSTRAINT integration_health_service_check
  CHECK (service IN ('make_com', 'line', 'google_calendar', 'vercel', 'internal', 'welpru', 'discord'));

ALTER TABLE consent_records DROP CONSTRAINT consent_records_consent_type_check;
ALTER TABLE consent_records ADD CONSTRAINT consent_records_consent_type_check
  CHECK (consent_type IN ('privacy_policy', 'line_linking', 'welpru_linking'));

-- ============================================================
-- (5) ขยาย cleanup_old_logs() — เก็บกวาด welpru_link_tokens ที่ใช้แล้ว
-- ใช้ line_token_retention_days เดิม (ไม่เพิ่ม config ใหม่ตาม spec)
-- คง logic เดิมทั้งหมดจากเฟส 1 (021) ไว้ครบ เพิ่มแค่ clause ใหม่
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
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

  DELETE FROM notifications
    WHERE is_read = true
      AND created_at < now() - (cfg.activity_log_retention_months || ' months')::interval;

  DELETE FROM welpru_link_tokens
    WHERE is_used = true
      AND created_at < now() - (cfg.line_token_retention_days || ' days')::interval;
END;
$$;
