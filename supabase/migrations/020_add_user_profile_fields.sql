-- ============================================================
-- 020_add_user_profile_fields.sql
-- เพิ่มฟิลด์โปรไฟล์ที่ผู้ใช้กรอกเอง: staff_id (รหัสบุคลากร), phone (เบอร์โทร)
-- ระบบเฉพาะบุคลากร ไม่มีนักศึกษา จึงไม่มี user_type/student_id
-- และขยายฟังก์ชัน PDPA anonymize ให้เคลียร์ฟิลด์ใหม่ด้วย
--
-- รันใน Supabase SQL Editor (ไม่มี MCP) แบบเดียวกับ 018/019
-- ADD COLUMN IF NOT EXISTS → รันซ้ำได้ปลอดภัย
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone    text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_id text;

-- ขยาย anonymize ให้ลบ phone + staff_id ด้วย (PDPA)
-- หมายเหตุ: CREATE OR REPLACE จะล้าง proconfig (SET clauses) ของฟังก์ชันเดิม
-- จึงต้อง re-pin `SET search_path = public` ไว้ (hardening จาก migration 016)
-- ส่วน GRANT/REVOKE (migration 018) จะคงอยู่ข้าม REPLACE แต่ re-assert เพื่อความชัวร์
CREATE OR REPLACE FUNCTION anonymize_user_on_delete_request(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE users SET
    full_name    = 'ผู้ใช้ที่ถูกลบ',
    email        = 'deleted-' || id || '@anonymized.local',
    line_user_id = NULL,
    department   = NULL,
    phone        = NULL,
    staff_id     = NULL
  WHERE id = p_user_id;
  -- approval_logs, bookings ยังอ้างอิง id เดิมได้ เพื่อ audit trail
  -- แต่ JOIN มาแล้วจะเห็นแค่ "ผู้ใช้ที่ถูกลบ" ไม่เห็นชื่อจริง
END;
$$;

REVOKE EXECUTE ON FUNCTION public.anonymize_user_on_delete_request(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.anonymize_user_on_delete_request(uuid) TO authenticated;
