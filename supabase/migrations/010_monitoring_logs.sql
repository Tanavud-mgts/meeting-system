-- ============================================================
-- 010_monitoring_logs.sql
-- ต้องมาหลัง users
-- ตาราง monitoring เหล่านี้ลบได้ตาม retention policy
-- (ต่างจาก approval_logs/cancellation_logs ที่เก็บถาวร)
-- ============================================================

-- ============================================================
-- activity_logs — บันทึกทุก action สำคัญในระบบ
-- เช่น login, เปลี่ยน role, แก้ไขห้อง, เปลี่ยน Approval Chain
-- ============================================================
CREATE TABLE activity_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        REFERENCES users(id),
  action      text        NOT NULL,
  target_type text,        -- 'user' | 'room' | 'booking' | 'system_config'
  target_id   uuid,
  detail      jsonb,       -- เก็บ before/after สำหรับ audit
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_activity_actor   ON activity_logs (actor_id, created_at DESC);
CREATE INDEX idx_activity_target  ON activity_logs (target_type, target_id);
-- Index สำหรับ cleanup job
CREATE INDEX idx_activity_created ON activity_logs (created_at);

-- ============================================================
-- integration_health — log ทุกการเรียก external service
-- LINE, Make.com, Google Calendar, Vercel, internal errors
-- ============================================================
CREATE TABLE integration_health (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service      text        NOT NULL
                             CHECK (service IN (
                               'make_com',
                               'line',
                               'google_calendar',
                               'vercel',
                               'internal'
                             )),
  status       text        NOT NULL CHECK (status IN ('success', 'failed')),
  payload      jsonb,
  error_detail text,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX idx_integration_service ON integration_health (service, created_at DESC);
-- Index สำหรับ cleanup job
CREATE INDEX idx_integration_created ON integration_health (created_at);

-- ============================================================
-- secret_rotation_log — metadata ว่า key ไหน rotate เมื่อไหร่
-- ไม่เก็บค่า secret จริง เก็บแค่ชื่อและเหตุผล
-- ============================================================
CREATE TABLE secret_rotation_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_name  text        NOT NULL,
  rotated_by   uuid        REFERENCES users(id),
  reason       text        NOT NULL
                             CHECK (reason IN (
                               'scheduled',
                               'developer_offboarding',
                               'suspected_leak',
                               'other'
                             )),
  rotated_at   timestamptz DEFAULT now()
);
