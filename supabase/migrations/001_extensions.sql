-- ============================================================
-- 001_extensions.sql
-- ต้องรันก่อนไฟล์อื่นทั้งหมด
-- จำเป็นสำหรับ EXCLUDE constraint (btree_gist) และ gen_random_uuid()
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
