-- ============================================================
-- 018_harden_anonymize_execute_grant.sql
-- Fix: anonymize_user_on_delete_request() (011) ไม่เคยถูกรวมใน
-- การ harden EXECUTE grant ของ 017 เพราะตอนนั้นยังไม่มีหน้า UI
-- เรียกใช้จริง — Track D เปิดใช้งานผ่าน /dashboard/users เป็น
-- จุดแรก จึงต้องปิดช่องโหว่ PUBLIC EXECUTE ตามแพทเทิร์นเดียวกับ
-- 017 ก่อน — Postgres grant EXECUTE ให้ PUBLIC โดย default เสมอ
-- ตอนสร้างฟังก์ชัน (RLS ภายในฟังก์ชันป้องกันการแก้ข้อมูลคนอื่น
-- อยู่แล้วแม้ไม่ revoke แต่ revoke เพื่อ defense-in-depth)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.anonymize_user_on_delete_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_user_on_delete_request(uuid) TO authenticated;
