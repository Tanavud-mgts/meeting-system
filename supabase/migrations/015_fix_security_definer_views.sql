-- ============================================================
-- 015_fix_security_definer_views.sql
-- Fix: views ใน 012_views.sql ถูกสร้างแบบ default (SECURITY DEFINER
-- behavior) ทำให้ query ผ่าน view ข้าม RLS ของตารางที่ join อยู่ทั้งหมด
-- แก้โดยตั้ง security_invoker = true ให้ view รันด้วยสิทธิ์ผู้ query จริง
-- ============================================================

ALTER VIEW booking_detail              SET (security_invoker = true);
ALTER VIEW pending_approvals           SET (security_invoker = true);
ALTER VIEW department_booking_summary  SET (security_invoker = true);
ALTER VIEW room_utilization_monthly    SET (security_invoker = true);
ALTER VIEW staff_activity_timeline     SET (security_invoker = true);
ALTER VIEW integration_monthly_usage   SET (security_invoker = true);
