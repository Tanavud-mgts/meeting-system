# PRODUCT.md

สรุป Business Logic ทั้งหมดของระบบจองห้องประชุม LPRU สำหรับให้ AI Agent อ้างอิงก่อนเขียนโค้ดหรือออกแบบ UI ใดๆ

## ภาพรวม

ระบบจองห้องประชุมออนไลน์สำหรับมหาวิทยาลัยราชภัฏลำปาง รองรับ 3 บทบาทผู้ใช้ (User, Approver, Admin) พร้อม Approval Chain 3 ขั้นตอนที่ทำงานได้ทั้งบนเว็บและผ่าน LINE

---

## 1. Roles และสิทธิ์

### User (ผู้ใช้ทั่วไป)
- จองห้องประชุม, ดูปฏิทินภาพรวม, ดูประวัติการจองของตัวเอง
- ยกเลิกการจองที่ยังเป็น `pending` ได้ทันที
- ขอยกเลิกการจองที่ `approved` แล้ว (ต้องรอ Admin อนุมัติคำขอยกเลิก)
- เชื่อม/ยกเลิกเชื่อม LINE ผ่าน OTP

### Approver (ผู้อนุมัติ)
- มีสิทธิ์ทั้งหมดของ User
- อนุมัติ/ปฏิเสธคำขอจองในขั้นตอนของตน (step 2 หรือ step 3 ของ chain)
- พิจารณาคำขอยกเลิกการจองที่ approved แล้ว
- เห็น Reports/สถิติเหมือน Admin ทุกอย่าง (ไม่ filter ตามหน่วยงานตัวเอง)
- ดูประวัติการทำงานของตัวเองเท่านั้น (ไม่เห็นของคนอื่น)

### Admin (ผู้ดูแลระบบ)
- มีสิทธิ์ทั้งหมดของ Approver
- เป็นขั้นตอนแรกเสมอของ Approval Chain (step 1)
- จัดการห้องประชุม (CRUD), จัดการผู้ใช้/role/หน่วยงาน
- ตั้งค่า Approval Chain, เวลาทำการ, วันหยุด
- ยกเลิกการจองใดๆ ได้ทันทีโดยไม่ต้องขออนุมัติจากใคร
- เห็นประวัติการทำงานของทุกคนในระบบ
- จัดการข้อมูล (Export, retention settings), ดู Integration Health

---

## 2. Approval Chain

**Global Chain เดียวใช้กับทุกห้อง ไม่มีข้อยกเว้น** (ไม่ใช่ per-room chain แม้แต่ห้อง VIP)

```
ผู้จองส่งคำขอ (status=pending, step=0)
    ↓
Admin อนุมัติ (step=1) ──ปฏิเสธ→ จบ chain ทันที (rejected)
    ↓ อนุมัติ
Approver 1 อนุมัติ (step=2) ──ปฏิเสธ→ จบ chain ทันที (rejected)
    ↓ อนุมัติ
Approver 2 อนุมัติ (step=3) ──ปฏิเสธ→ จบ chain ทันที (rejected)
    ↓ อนุมัติครบ
final_status = approved → trigger Make.com → สร้าง Google Calendar Event
```

- Chain กำหนดใน `system_config` table (`admin_id`, `approver1_id`, `approver2_id`) — Admin เปลี่ยนได้จากหน้าเว็บ ไม่ต้องแก้ Database ตรง
- **ปฏิเสธที่ step ไหนก็ตาม จบ chain ทันที ไม่ส่งต่อคนถัดไป**
- อนุมัติทำได้ทั้งบนเว็บและผ่าน LINE Flex Message (postback) — logic ต้องใช้ shared function เดียวกัน (`processApproval()`) ผลลัพธ์ต้องเหมือนกันเป๊ะไม่ว่าจะมาจากช่องทางไหน
- ทุกคำขอมี one-time token (`approval_tokens`) ผูกกับ booking_id + step + approver_id เพื่อป้องกันการอนุมัติซ้ำหรือคนอื่นสวมสิทธิ์

---

## 3. Booking States (final_status)

| Status | ความหมาย | Transition ต่อไปได้ |
|---|---|---|
| `pending` | รอ Admin อนุมัติขั้นแรก | → approved / rejected / cancelled / cancelled_by_admin |
| `approved` | ผ่านครบทุก step ของ chain | → cancel_requested / cancelled_by_admin |
| `rejected` | ถูกปฏิเสธกลางทางใน chain | (สิ้นสุด) |
| `cancelled` | User ยกเลิกเองขณะยังเป็น pending | (สิ้นสุด) |
| `cancel_requested` | User ขอยกเลิกหลัง approved แล้ว รอ Admin พิจารณา | → approved (ถูกปฏิเสธคำขอยกเลิก) / cancelled (อนุมัติให้ยกเลิก) |
| `cancelled_by_admin` | Admin/Approver ยกเลิกเองโดยตรง ไม่ต้องรอใคร | (สิ้นสุด) |

**กฎการยกเลิก:**
- `pending` → User เจ้าของหรือ Admin ยกเลิกได้ทันที ไม่ต้องขออนุมัติ
- `approved` → User เจ้าของต้องส่งคำขอยกเลิก (พร้อมเหตุผลบังคับกรอก) รอ Admin อนุมัติ/ปฏิเสธ
- Admin/Approver ยกเลิกโดยตรงได้ทุกสถานะ ไม่ต้องขอใคร แต่ต้องกรอกเหตุผล
- ยกเลิกสำเร็จ (จาก approved) ต้อง trigger Make.com ลบ Google Calendar Event ด้วย `gcal_event_id` ที่บันทึกไว้

---

## 4. LINE Integration — เป็น Supplement เท่านั้น

**หลักการสำคัญ: ทุกฟีเจอร์ต้องทำงานบนเว็บได้ครบ 100% โดยไม่ต้องพึ่ง LINE** — LINE เป็นแค่ช่องทางแจ้งเตือนเสริมให้ Approver ไม่พลาดการอนุมัติ ไม่ใช่ primary interface

- เชื่อม LINE ผ่าน OTP: Approver scan QR เพิ่มเพื่อน LINE OA → พิมพ์ `/link XXXXXX` ในแชท → ระบบผูก `line_user_id` อัตโนมัติ (ไม่ใช้ LIFF)
- Push message ต่อการจอง 1 รายการที่ผ่าน chain ครบ: แจ้ง Admin (step1) + Approver1 (step2) + Approver2 (step3) + ผู้จอง (ผลลัพธ์สุดท้าย) = 4 ครั้ง — ต้องระวัง 500 push/เดือน ของ Free Plan
- Approver ที่ยังไม่เชื่อม LINE จะไม่ได้รับ push แต่ยังเห็นคำขอผ่านหน้าเว็บ `/approver` ได้ปกติ — ระบบต้อง fallback ไม่ throw error

---

## 5. Free Plan Limits ที่ส่งผลต่อ Design

| Service | Limit สำคัญ | ผลต่อการออกแบบ |
|---|---|---|
| Supabase | 500MB, auto-pause หลังไม่มี activity 7 วัน | ต้องมี keep-alive job ทุก 5 วัน |
| Make.com | 2 scenarios, 1,000 credits/เดือน | ใช้ Router module แยก action (create/cancel) ในภายใน scenario เดียว |
| LINE OA | Push 500 ข้อความ/เดือน | ต้องมี Quota Usage Alert เตือน Admin ก่อนเต็ม |
| Vercel Hobby | Function timeout 10 วิ | Export ข้อมูลเรียก Edge Function ตรง ไม่ผ่าน Next.js API route |

---

## 6. รายการหน้าทั้งหมด (18 หน้า)

### User (6 หน้า)
- `/login` — Google OAuth เฉพาะ `@g.lpru.ac.th`
- `/home` — Dashboard ภาพรวม: การจองที่กำลังจะถึง, แจ้งเตือน, สถิติส่วนตัว
- `/booking` — จองห้อง (ขั้นที่ 1 ค้นหาห้องว่างตามวันเวลา → ขั้นที่ 2 กรอกรายละเอียด)
- `/calendar` — ปฏิทินภาพรวมแบบ FullCalendar (วัน/สัปดาห์/เดือน) คลิกดูรายละเอียด
- `/profile/bookings` — ประวัติการจอง + ยกเลิก
- `/profile` — ข้อมูลส่วนตัว + เชื่อม LINE ด้วย OTP

### Approver (+4 หน้า จาก User)
- `/approver` — Queue คำขอรอการอนุมัติ พร้อม highlight รอนาน
- `/approver/cancel-requests` — พิจารณาคำขอยกเลิกจาก User
- `/approver/history` — ประวัติการทำงานของตัวเอง
- `/dashboard/reports` — รายงาน (สิทธิ์ร่วมกับ Admin)

### Admin (+8 หน้า จาก Approver)
- `/setup` — First-time Setup Wizard (4 ขั้นตอน: intro → เพิ่มห้อง → Approval Chain → business hours)
- `/dashboard` — ภาพรวมระบบ
- `/dashboard/rooms` — จัดการห้องประชุม CRUD
- `/dashboard/users` — จัดการผู้ใช้/role/หน่วยงาน
- `/dashboard/bookings` — รายการจองทั้งหมดในระบบ
- `/dashboard/settings` — Approval Chain, เวลาทำการ, วันหยุด
- `/dashboard/data` — Export, retention settings, danger zone
- `/dashboard/integrations` — Integration Health Dashboard (Make.com/LINE/Supabase quota)
- `/dashboard/activity` — ประวัติการทำงานรวมของทุกคน

---

## 7. Data Management

- **Export เท่านั้น ไม่มี Import** — Export เป็น Excel: bookings, approval history, users, reports
- **Retention:** `activity_logs` และ `integration_health` ลบอัตโนมัติตาม `system_config.activity_log_retention_months` (default 6 เดือน) — ปรับได้จากหน้าเว็บ
- **ห้ามลบ:** `approval_logs`, `cancellation_logs` เก็บถาวรเสมอ (หลักฐานราชการ)
- **PDPA:** ขอ consent ตอน login ครั้งแรกและตอนเชื่อม LINE — สิทธิ์ "ขอลบบัญชี" ใช้วิธี anonymize (ลบชื่อ/อีเมล/LINE ID) แทน hard delete เพื่อรักษา audit trail

## 8. Reporting

- รายงานหลักที่ต้องมี: สรุปการใช้ห้องรายเดือน/รายปี (Room Utilization), สรุปการจองรายบุคคล/หน่วยงาน (ต้องมี `users.department`)
- Approver เห็นเหมือน Admin ทุกอย่าง ไม่ filter ตามหน่วยงานตัวเอง
