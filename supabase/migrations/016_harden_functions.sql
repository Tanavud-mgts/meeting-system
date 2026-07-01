-- ============================================================
-- 016_harden_functions.sql
-- Fix: function_search_path_mutable (WARN) — ป้องกัน search_path
-- hijacking โดย pin search_path ให้ทุก function ที่ทราบที่มาแน่นอน
-- Fix: extension_in_public (WARN) — ย้าย btree_gist ออกจาก public
-- Fix: ลด anon exposure ของ auth_role()/requester_check() ผ่าน RPC
-- หมายเหตุ: ไม่แตะ rls_auto_enable() เพราะไม่พบที่มาในไฟล์ migration ใดๆ
--           ต้องตรวจสอบที่มาก่อนตัดสินใจแก้/ลบ
-- ============================================================

ALTER FUNCTION public.auth_role() SET search_path = public;
ALTER FUNCTION public.sync_slot_room_id() SET search_path = public;
ALTER FUNCTION public.check_slot_available(uuid, timestamptz, timestamptz) SET search_path = public;
ALTER FUNCTION public.generate_ref_id() SET search_path = public;
ALTER FUNCTION public.validate_booking_hours() SET search_path = public;
ALTER FUNCTION public.create_booking_slot() SET search_path = public;
ALTER FUNCTION public.release_slot_on_cancel() SET search_path = public;
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.cleanup_old_logs() SET search_path = public;
ALTER FUNCTION public.anonymize_user_on_delete_request(uuid) SET search_path = public;
ALTER FUNCTION public.requester_check(uuid) SET search_path = public;

-- ย้าย btree_gist ออกจาก public schema ตามคำแนะนำของ Supabase advisor
ALTER EXTENSION btree_gist SET SCHEMA extensions;

-- anon ไม่จำเป็นต้องเรียกสองฟังก์ชันนี้ผ่าน RPC ตรงๆ (auth.uid() เป็น NULL
-- เสมอสำหรับ anon ทำให้ผลลัพธ์ไม่มีประโยชน์อยู่แล้ว) — authenticated ยังเรียกได้
-- ตามเดิมเพราะ RLS policies ต้องใช้ตอน evaluate
REVOKE EXECUTE ON FUNCTION public.auth_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.requester_check(uuid) FROM anon;
