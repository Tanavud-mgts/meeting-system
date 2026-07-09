-- ============================================================
-- 021_notifications.sql
-- In-App notifications (เฟส 1 ของระบบแจ้งเตือน)
-- INSERT ทำผ่าน Edge Function (service_role) เท่านั้น — ไม่มี INSERT policy
-- ============================================================

CREATE TABLE notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key  text        NOT NULL,
  title      text        NOT NULL,
  body       text,
  link       text,
  is_read    boolean     NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  read_at    timestamptz
);

-- ดึง unread ของผู้ใช้เร็ว
CREATE INDEX idx_notifications_unread  ON notifications (user_id) WHERE is_read = false;
-- ดึงรายการล่าสุดของผู้ใช้
CREATE INDEX idx_notifications_user    ON notifications (user_id, created_at DESC);
-- สำหรับ cleanup job
CREATE INDEX idx_notifications_created ON notifications (created_at);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- อ่าน/แก้/ลบ ได้เฉพาะของตัวเอง (pattern เดียวกับ line_link_tokens / consent_records)
CREATE POLICY "notifications: read own"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notifications: update own"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications: delete own"
  ON notifications FOR DELETE
  USING (user_id = auth.uid());

-- Realtime: ให้ client subscribe INSERT ได้
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ขยาย cleanup_old_logs: ลบแจ้งเตือนที่อ่านแล้วเก่ากว่า retention เดิม
-- (ใช้ activity_log_retention_months ไม่เพิ่ม config ใหม่ ตาม spec)
-- คง SET search_path = public (hardening migration 016) และ logic เดิมทั้งหมด
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
END;
$$;
