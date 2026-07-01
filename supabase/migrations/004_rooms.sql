-- ============================================================
-- 004_rooms.sql
-- ไม่มี dependency กับตารางอื่น
-- ============================================================

CREATE TABLE rooms (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  capacity    int         NOT NULL CHECK (capacity > 0),
  status      text        NOT NULL DEFAULT 'available'
                            CHECK (status IN ('available', 'busy', 'maintenance')),
  -- JSON array ของอุปกรณ์ เช่น ["projector","whiteboard","mic"]
  equipment   jsonb       NOT NULL DEFAULT '[]',
  created_at  timestamptz DEFAULT now()
);
