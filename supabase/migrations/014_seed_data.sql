-- ============================================================
-- 014_seed_data.sql
-- ก่อนรันไฟล์นี้ ต้องรัน scripts/create-test-users.ts ก่อนเสมอ
-- (สร้าง auth.users ผ่าน Supabase Admin API — INSERT ตรงเข้า
-- auth.users ด้วย SQL ใช้ไม่ได้กับ Supabase Cloud เพราะขาด record
-- ที่ GoTrue คาดหวังใน auth.identities และ column อื่นๆ)
-- ใช้เฉพาะสภาพแวดล้อมทดสอบเท่านั้น ห้ามรันใน production จริง
-- ============================================================

-- ============================================================
-- Public Users (ผูกกับ auth.users)
-- ============================================================
INSERT INTO users (id, full_name, email, role, department)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'ทดสอบ ผู้ใช้งาน',   'user@test.local',       'user',     'คณะวิทยาการคอมพิวเตอร์'),
  ('22222222-2222-2222-2222-222222222222', 'ทดสอบ ผู้ดูแลระบบ', 'admin@test.local',      'admin',    'สำนักงานอธิการบดี'),
  ('33333333-3333-3333-3333-333333333333', 'ทดสอบ ผู้อนุมัติ 1','approver1@test.local',  'approver', 'สำนักงานอธิการบดี'),
  ('44444444-4444-4444-4444-444444444444', 'ทดสอบ ผู้อนุมัติ 2','approver2@test.local',  'approver', 'กองบริหารงานทั่วไป');

-- ============================================================
-- System Config (row เดียว — Singleton)
-- ============================================================
INSERT INTO system_config (
  admin_id,
  approver1_id,
  approver2_id,
  office_start_hour,
  office_end_hour,
  holidays,
  setup_completed
)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  8,
  17,
  '["2025-04-13","2025-04-14","2025-04-15"]'::jsonb,
  true
);

-- ============================================================
-- Rooms (ห้องทดสอบ)
-- ============================================================
INSERT INTO rooms (id, name, capacity, status, equipment)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'ห้องประชุม 1 (Smart Classroom)',
    30,
    'available',
    '["projector","whiteboard","mic","video_conference"]'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'ห้องประชุม 2',
    20,
    'available',
    '["projector","whiteboard"]'::jsonb
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'ห้องประชุม 3',
    15,
    'available',
    '["whiteboard"]'::jsonb
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'ห้องประชุม 4 (VIP)',
    10,
    'maintenance',
    '["projector","video_conference"]'::jsonb
  );

-- ============================================================
-- Sample Bookings — ครบทุก status สำหรับทดสอบ UI
-- หมายเหตุ: ใช้ INSERT ตรง ข้าม trigger validate_booking_hours
--           เพราะ seed data ต้องการกำหนด status ได้ยืดหยุ่น
-- ============================================================

-- Booking 1: pending (รออนุมัติ Admin)
INSERT INTO bookings (
  id, ref_id, room_id, requester_id, title, activity,
  attendees, start_time, end_time, final_status, current_step
) VALUES (
  'b1111111-1111-1111-1111-111111111111',
  'BK-20250701-001',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'ทดสอบ ประชุมคณะกรรมการ',
  'ประชุมติดตามความคืบหน้าโครงการ',
  15,
  '2025-07-10 09:00:00+07',
  '2025-07-10 11:00:00+07',
  'pending',
  0
);
-- หมายเหตุ: ไม่ต้อง INSERT booking_slots เอง — trigger trg_create_slot
-- (011_triggers_business_logic.sql) สร้างให้อัตโนมัติแล้วตอน INSERT bookings
-- ด้านบน เหมือนกับ Booking 2-4 ด้านล่าง

-- Booking 2: approved (อนุมัติครบ chain)
INSERT INTO bookings (
  id, ref_id, room_id, requester_id, title, activity,
  attendees, start_time, end_time, final_status, current_step,
  gcal_event_id
) VALUES (
  'b2222222-2222-2222-2222-222222222222',
  'BK-20250701-002',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '11111111-1111-1111-1111-111111111111',
  'ทดสอบ สัมมนาบุคลากร',
  'สัมมนาพัฒนาศักยภาพบุคลากร',
  18,
  '2025-07-15 13:00:00+07',
  '2025-07-15 16:00:00+07',
  'approved',
  3,
  'test_gcal_event_id_001'
);
INSERT INTO approval_logs (booking_id, approver_id, step, action, acted_at)
VALUES
  ('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 1, 'approved', now() - interval '2 hours'),
  ('b2222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 2, 'approved', now() - interval '1 hour'),
  ('b2222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 3, 'approved', now() - interval '30 minutes');

-- Booking 3: rejected (ถูกปฏิเสธกลางทาง)
INSERT INTO bookings (
  id, ref_id, room_id, requester_id, title, activity,
  attendees, start_time, end_time, final_status, current_step
) VALUES (
  'b3333333-3333-3333-3333-333333333333',
  'BK-20250701-003',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '11111111-1111-1111-1111-111111111111',
  'ทดสอบ ถูกปฏิเสธ',
  'ประชุมทั่วไป',
  10,
  '2025-07-20 10:00:00+07',
  '2025-07-20 12:00:00+07',
  'rejected',
  1
);
INSERT INTO approval_logs (booking_id, approver_id, step, action, note, acted_at)
VALUES (
  'b3333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  1, 'rejected',
  'ห้องถูกจองสำหรับกิจกรรมพิเศษของมหาวิทยาลัยในวันนั้น',
  now() - interval '1 day'
);

-- Booking 4: cancel_requested (User ขอยกเลิก รอ Admin)
INSERT INTO bookings (
  id, ref_id, room_id, requester_id, title, activity,
  attendees, start_time, end_time, final_status, current_step,
  gcal_event_id, cancellation_reason
) VALUES (
  'b4444444-4444-4444-4444-444444444444',
  'BK-20250701-004',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '11111111-1111-1111-1111-111111111111',
  'ทดสอบ ขอยกเลิก',
  'ประชุมฉุกเฉิน',
  5,
  '2025-07-25 14:00:00+07',
  '2025-07-25 15:00:00+07',
  'cancel_requested',
  3,
  'test_gcal_event_id_002',
  'ผู้เข้าร่วมติดภารกิจเร่งด่วน ขอเลื่อนการประชุม'
);
INSERT INTO approval_logs (booking_id, approver_id, step, action, acted_at)
VALUES
  ('b4444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 1, 'approved', now() - interval '3 days'),
  ('b4444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 2, 'approved', now() - interval '2 days'),
  ('b4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 3, 'approved', now() - interval '1 day');
