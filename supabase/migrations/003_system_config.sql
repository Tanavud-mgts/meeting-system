-- ============================================================
-- 003_system_config.sql
-- ต้องมาหลัง users เพราะ FK ไปหา users
-- Singleton table — มีแค่ 1 row เสมอ
-- ============================================================

CREATE TABLE system_config (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Global Approval Chain (ใช้กับทุกห้อง ไม่มีข้อยกเว้น)
  admin_id                        uuid        REFERENCES users(id),
  approver1_id                    uuid        REFERENCES users(id),
  approver2_id                    uuid        REFERENCES users(id),

  -- Business Hours
  office_start_hour               int         NOT NULL DEFAULT 8,
  office_end_hour                 int         NOT NULL DEFAULT 17,

  -- วันหยุด เก็บเป็น JSON array ของ date string เช่น ["2025-04-13","2025-12-31"]
  holidays                        jsonb       NOT NULL DEFAULT '[]',

  -- Data Retention Settings (หน่วย: เดือน/วัน)
  activity_log_retention_months   int         NOT NULL DEFAULT 6,
  integration_log_retention_months int        NOT NULL DEFAULT 6,
  line_token_retention_days       int         NOT NULL DEFAULT 7,

  -- First-time Setup Wizard guard
  setup_completed                 boolean     NOT NULL DEFAULT false,

  updated_at                      timestamptz DEFAULT now()
);

-- บังคับให้มีแค่ 1 row โดยใช้ unique index บน expression คงที่
CREATE UNIQUE INDEX idx_system_config_singleton ON system_config ((true));
