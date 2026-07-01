-- ============================================================
-- 012_views.sql
-- ต้องมาหลังทุกตารางและ trigger ถูกสร้างแล้ว (001-011)
-- View ทั้งหมดใช้เพื่อลด complexity ที่ Frontend ต้อง JOIN เอง
-- ============================================================

-- ============================================================
-- booking_detail — JOIN ครบ สำหรับแสดงผลรายการจอง
-- ใช้ใน: /profile/bookings, /dashboard/bookings, /approver queue
-- ============================================================
CREATE VIEW booking_detail AS
SELECT
  b.id,
  b.ref_id,
  b.title,
  b.activity,
  b.attendees,
  b.start_time,
  b.end_time,
  b.final_status,
  b.current_step,
  b.gcal_event_id,
  b.cancellation_reason,
  b.created_at,
  r.id           AS room_id,
  r.name         AS room_name,
  r.capacity     AS room_capacity,
  r.equipment    AS room_equipment,
  u.id           AS requester_id,
  u.full_name    AS requester_name,
  u.email        AS requester_email,
  u.line_user_id AS requester_line_id,
  u.department   AS requester_department
FROM bookings b
JOIN rooms r ON r.id = b.room_id
JOIN users u ON u.id = b.requester_id;

-- ============================================================
-- pending_approvals — Queue รออนุมัติ เรียงตาม created_at (เก่าสุดก่อน)
-- ใช้ใน: /approver, /dashboard (Admin queue)
-- ============================================================
CREATE VIEW pending_approvals AS
SELECT
  b.id,
  b.ref_id,
  b.title,
  b.activity,
  b.attendees,
  b.start_time,
  b.end_time,
  b.final_status,
  b.current_step,
  b.created_at,
  r.name         AS room_name,
  u.full_name    AS requester_name,
  u.email        AS requester_email,
  u.line_user_id AS requester_line_id,
  -- จำนวน step ที่ผ่านแล้ว
  (SELECT COUNT(*) FROM approval_logs al WHERE al.booking_id = b.id) AS steps_done,
  -- เวลาที่รอมาแล้ว (นาที)
  EXTRACT(EPOCH FROM (now() - b.created_at)) / 60 AS waiting_minutes
FROM bookings b
JOIN rooms r ON r.id = b.room_id
JOIN users u ON u.id = b.requester_id
WHERE b.final_status IN ('pending', 'cancel_requested')
ORDER BY b.created_at ASC;

-- ============================================================
-- department_booking_summary — รายงานตามหน่วยงาน (เดือนปัจจุบัน)
-- ใช้ใน: /dashboard/reports
-- ============================================================
CREATE VIEW department_booking_summary AS
SELECT
  u.department,
  COUNT(*)                                                                     AS total_bookings,
  SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 3600)                 AS total_hours,
  COUNT(*) FILTER (WHERE b.final_status = 'approved')                         AS approved_count,
  COUNT(*) FILTER (WHERE b.final_status IN ('rejected', 'cancelled', 'cancelled_by_admin')) AS rejected_cancelled_count
FROM bookings b
JOIN users u ON u.id = b.requester_id
WHERE b.created_at >= date_trunc('month', now())
GROUP BY u.department
ORDER BY total_bookings DESC;

-- ============================================================
-- room_utilization_monthly — อัตราการใช้ห้องเดือนปัจจุบัน
-- ใช้ใน: /dashboard/reports
-- ============================================================
CREATE VIEW room_utilization_monthly AS
SELECT
  r.id,
  r.name,
  r.capacity,
  COUNT(b.id)                                                                AS booking_count,
  COALESCE(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 3600), 0) AS used_hours
FROM rooms r
LEFT JOIN bookings b ON b.room_id = r.id
  AND b.final_status = 'approved'
  AND b.created_at >= date_trunc('month', now())
GROUP BY r.id, r.name, r.capacity;

-- ============================================================
-- staff_activity_timeline — ประวัติการทำงานรวมของ Approver/Admin
-- UNION 3 แหล่ง: approval_logs + cancellation_logs (staff) + activity_logs
-- ใช้ใน: /approver/history, /dashboard/activity
-- ============================================================
CREATE VIEW staff_activity_timeline AS
SELECT
  al.id,
  'approval'                   AS event_type,
  al.action                    AS sub_type,
  al.approver_id               AS actor_id,
  u.full_name                  AS actor_name,
  al.booking_id                AS related_id,
  b.ref_id                     AS related_ref,
  al.note                      AS detail,
  al.acted_at                  AS occurred_at
FROM approval_logs al
JOIN users u  ON u.id = al.approver_id
JOIN bookings b ON b.id = al.booking_id

UNION ALL

SELECT
  cl.id,
  'cancellation'               AS event_type,
  CASE WHEN cl.role = 'user' THEN 'user_cancel' ELSE 'staff_cancel' END AS sub_type,
  cl.cancelled_by              AS actor_id,
  u.full_name                  AS actor_name,
  cl.booking_id                AS related_id,
  b.ref_id                     AS related_ref,
  cl.reason                    AS detail,
  cl.cancelled_at              AS occurred_at
FROM cancellation_logs cl
JOIN users u   ON u.id = cl.cancelled_by
JOIN bookings b ON b.id = cl.booking_id
WHERE cl.role IN ('approver', 'admin')

UNION ALL

SELECT
  act.id,
  'config_change'              AS event_type,
  act.action                   AS sub_type,
  act.actor_id,
  u.full_name                  AS actor_name,
  act.target_id                AS related_id,
  NULL                         AS related_ref,
  act.detail::text             AS detail,
  act.created_at               AS occurred_at
FROM activity_logs act
JOIN users u ON u.id = act.actor_id
WHERE act.actor_id IS NOT NULL

ORDER BY occurred_at DESC;

-- ============================================================
-- integration_monthly_usage — สรุป quota ใช้งาน (เดือนปัจจุบัน)
-- ใช้ใน: /dashboard/integrations (Integration Health Dashboard)
-- ============================================================
CREATE VIEW integration_monthly_usage AS
SELECT
  service,
  COUNT(*)                                       AS total_calls,
  COUNT(*) FILTER (WHERE status = 'success')     AS success_count,
  COUNT(*) FILTER (WHERE status = 'failed')      AS failed_count,
  MAX(created_at)                                AS last_called_at
FROM integration_health
WHERE created_at >= date_trunc('month', now())
GROUP BY service;
