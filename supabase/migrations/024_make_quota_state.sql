-- ============================================================
-- 024_make_quota_state.sql
-- เพิ่ม state สำหรับ dedupe การเตือนโควตา Make.com (tier 0/80/95)
-- additive เท่านั้น (Rule 8) — เขียนได้เฉพาะ service_role (migration 023)
-- ============================================================

ALTER TABLE system_config
  ADD COLUMN IF NOT EXISTS make_quota_last_tier integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN system_config.make_quota_last_tier IS
  'tier การเตือนโควตา Make.com ล่าสุดที่แจ้งไปแล้ว (0/80/95) — ใช้ dedupe; reset เป็น 0 อัตโนมัติเมื่อรอบบิลใหม่ usage ตกต่ำกว่า 80%';
