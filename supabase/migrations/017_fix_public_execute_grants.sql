-- ============================================================
-- 017_fix_public_execute_grants.sql
-- Fix: 016 revoke จาก anon เฉยๆ ไม่พอ เพราะ Postgres grant EXECUTE
-- ให้ PUBLIC โดย default ตอนสร้าง function เสมอ ต้อง revoke จาก
-- PUBLIC ตรงๆ ถึงจะตัดสิทธิ์ anon ได้จริง แล้วค่อย grant กลับให้
-- authenticated เท่านั้น เพราะ RLS policies ยังต้องเรียกใช้อยู่
-- หมายเหตุ: ไม่แตะ rls_auto_enable() เหมือนเดิม — เป็น Supabase-managed
--           event trigger function เรียกตรงผ่าน RPC ไม่ได้จริงอยู่แล้ว
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.auth_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.requester_check(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requester_check(uuid) TO authenticated;
