-- ============================================================
-- 009_line_integration.sql
-- ต้องมาหลัง users
-- ============================================================

-- ============================================================
-- line_link_tokens — OTP 6 หลัก สำหรับผูก LINE account
-- Flow: เว็บ generate OTP → user พิมพ์ /link XXXXXX ใน LINE
-- ============================================================
CREATE TABLE line_link_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp         text        NOT NULL UNIQUE,
  is_used     boolean     NOT NULL DEFAULT false,
  -- หมดอายุใน 10 นาที
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  created_at  timestamptz DEFAULT now()
);

-- Index สำหรับค้นหา OTP เร็ว (ใช้ตอน LINE webhook รับ /link command)
CREATE INDEX idx_link_otp
  ON line_link_tokens (otp)
  WHERE is_used = false;

-- ============================================================
-- consent_records — บันทึก PDPA consent
-- บันทึกครั้งแรก login และครั้งแรก link LINE
-- ============================================================
CREATE TABLE consent_records (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type   text        NOT NULL
                               CHECK (consent_type IN ('privacy_policy', 'line_linking')),
  consented_at   timestamptz NOT NULL DEFAULT now(),
  -- เก็บ version เผื่อ policy เปลี่ยนในอนาคต
  policy_version text        NOT NULL DEFAULT '1.0'
);
