-- ============================================================
-- 002_users_and_auth.sql
-- ต้องมาก่อนตารางอื่นเพราะถูก reference เยอะที่สุด
-- ============================================================

CREATE TABLE users (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     text        NOT NULL,
  email         text        NOT NULL UNIQUE,
  role          text        NOT NULL DEFAULT 'user'
                              CHECK (role IN ('user', 'approver', 'admin')),
  line_user_id  text        UNIQUE,
  department    text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_users_line ON users (line_user_id) WHERE line_user_id IS NOT NULL;
CREATE INDEX idx_users_role ON users (role);

-- ============================================================
-- auth_role() — helper function ดึง role ของ user ปัจจุบัน
-- ใช้ซ้ำในทุก RLS policy เพื่อไม่ JOIN users ทุกครั้ง
-- ============================================================
CREATE OR REPLACE FUNCTION auth_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$;
