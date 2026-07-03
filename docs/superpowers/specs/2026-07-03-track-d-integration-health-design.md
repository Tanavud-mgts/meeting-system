# Track D (sub-project 6) — Integration Health (`/dashboard/integrations`)

## บริบท

ต่อจาก Track D sub-project 1-5 (rooms/users/settings, bookings list+direct-cancel, activity log, dashboard overview, data management — เสร็จแล้วในเวิร์กทรีเดียวกัน) — sub-project นี้สร้างหน้า `/dashboard/integrations` ตาม `docs/PRODUCT.md` ("Integration Health Dashboard (Make.com/LINE/Supabase quota)") ให้ Admin ดูสถานะการเชื่อมต่อ external service (LINE, Make.com, Google Calendar) และรายการที่ล้มเหลวล่าสุดสำหรับ debug

**สถานะปัจจุบันของโค้ด (สำคัญต่อการทดสอบ):** ยังไม่มี Edge Function ใดเรียก `logIntegration()` จริงในโปรเจกต์นี้เลย (grep ยืนยันแล้ว) — ตาราง `integration_health` จะว่างเปล่าเสมอในเซสชันนี้ หน้านี้ต้อง handle empty state ให้ถูกต้อง ไม่ error เมื่อไม่มีข้อมูล

## ขอบเขต

**อยู่ในขอบเขตนี้:**
- หน้า `/dashboard/integrations` — 2 ส่วน: Quota Summary (การ์ดต่อ service) + Failed Logs (รายการที่ล้มเหลวล่าสุด พร้อม filter+pagination)
- Read-only ล้วน — ไม่มี Edge Function ในสโคปนี้ ไม่มีการเขียนข้อมูลใดๆ

**ไม่อยู่ในขอบเขตนี้:**
- การเรียก external service จริง (LINE/Make.com/Google Calendar Edge Function) — เป็นงานของ track อื่นในอนาคต ไม่ใช่สโคปของหน้านี้
- Supabase storage/auto-pause quota — ตาราง `integration_health`'s `service` CHECK constraint ไม่มีค่า `'supabase'` (มีแค่ `make_com`/`line`/`google_calendar`/`vercel`/`internal`) จึงไม่มีข้อมูลมาแสดง ตัดออกจากสโคป
- `/setup` (First-time Setup Wizard) — เก็บไว้ให้ sub-project ถัดไปของ Track D

## สถาปัตยกรรม / Components

### หน้า `/dashboard/integrations`

Read-only page ล้วน ไม่มี Edge Function — query ตรงจาก client ทั้งสองส่วน (RLS บังคับ admin-only อยู่แล้วที่ชั้น database):
- `integration_health` มี policy `"integration_health: admin only"` (`USING (auth_role() = 'admin')`, migration 013)
- View `integration_monthly_usage` ตั้ง `security_invoker = true` แล้ว (migration 015) จึงสืบทอด RLS ของตารางต้นทางเมื่อ query ผ่าน view

**ส่วนที่ 1 — Quota Summary:**
- Query view `integration_monthly_usage` (คอลัมน์: `service, total_calls, success_count, failed_count, last_called_at` — กรองเฉพาะเดือนปัจจุบันอยู่แล้วในตัว view)
- แสดงการ์ด 5 ใบตายตัวตามลำดับ CHECK constraint: `make_com`, `line`, `google_calendar`, `vercel`, `internal` — service ที่ไม่มี row ใน view (ยังไม่เคยถูกเรียกเดือนนี้) แสดงเป็น `total_calls=0, success_count=0, failed_count=0, last_called_at=null` แทนที่จะซ่อนการ์ดทิ้ง
- เฉพาะการ์ด `make_com` และ `line` เพิ่มบรรทัดอ้างอิง limit จาก Free Plan (CLAUDE.md): `make_com` → "1,000 credits/เดือน", `line` → "500 push/เดือน" พร้อมข้อความ caveat ชัดเจนในหน้า: **"นับรวมทุกการเรียก ไม่ได้แยก push/reply หรือแปลงเป็น credit จริง ใช้เป็นข้อมูลอ้างอิงคร่าวๆ เท่านั้น"** — `google_calendar`/`vercel`/`internal` ไม่มี reference limit เพราะ CLAUDE.md ไม่ได้ระบุ quota ไว้สำหรับ 3 อันนี้

**ส่วนที่ 2 — Failed Logs:**
- Query `integration_health` filter `.eq("status", "failed")` + optional `.eq("service", selectedService)` เมื่อเลือก filter, `.order("created_at", { ascending: false })` explicit (ไม่พึ่ง default order — บทเรียนจาก sub-project 3's activity page)
- Filter dropdown: "ทั้งหมด" + 5 ตัวเลือก service
- Pagination แบบ `.range()` + `count: 'exact'`, `PAGE_SIZE = 20` (รูปแบบเดียวกับ `/dashboard/bookings` และ `/dashboard/activity`) — filter เปลี่ยนแล้วต้อง reset หน้ากลับไปหน้า 1
- แต่ละแถวแสดง: service (badge สี `danger-*` เพราะกรองมาเฉพาะ failed), `error_detail`, `created_at` — ไม่แสดง `payload` (JSON ดิบ ตัด YAGNI เพราะไม่มี use case ที่ต้องอ่าน)
- Empty state: "ไม่พบรายการที่ล้มเหลว" (คาดว่าจะเจอ empty state นี้เสมอในเซสชันนี้)

## Data Flow

```
Admin เปิด /dashboard/integrations
  → query integration_monthly_usage (quota summary, 5 การ์ดตายตัว)
  → query integration_health WHERE status='failed' [AND service=X] ORDER BY created_at DESC (failed logs, filter+pagination)

ไม่มีการเขียนข้อมูลใดๆ ในหน้านี้
```

## Error Handling

| กรณี | การจัดการ |
|---|---|
| Query `integration_monthly_usage` ล้มเหลว | `loadError` state, ข้อความ "ไม่สามารถโหลดข้อมูล Quota ได้" |
| Query `integration_health` ล้มเหลว | `loadError` state แยก, ข้อความ "ไม่สามารถโหลดรายการที่ล้มเหลวได้" |
| ไม่มีข้อมูล (empty state ปกติ) | ไม่ใช่ error — แสดงการ์ด 0 ทั้งหมด + ข้อความ "ไม่พบรายการที่ล้มเหลว" |

ไม่มี Edge Function ในสโคปนี้ จึงไม่มี `fetch()` ที่ต้องห่อ try/catch/finally (ต่างจาก sub-project 5) — query ทั้งหมดเป็น Supabase client-side query ตรง ใช้ pattern เดียวกับ `/dashboard/activity` และ `/dashboard` overview

## Testing (Success Criteria)

1. `npx tsc --noEmit` และ `npm run build` ผ่าน, route list มี `/dashboard/integrations`
2. Login `admin@test.local` เปิด `/dashboard/integrations` เห็นการ์ด quota ครบ 5 service ทั้งหมดแสดง 0 (เพราะไม่มี seed data ใน `integration_health`) ไม่ error
3. เห็นบรรทัด reference limit เฉพาะการ์ด `make_com`/`line` พร้อม caveat ข้อความ — `google_calendar`/`vercel`/`internal` ไม่มีบรรทัดนี้
4. ส่วน Failed Logs แสดง "ไม่พบรายการที่ล้มเหลว" (empty state ปกติ ไม่ error)
5. ทดสอบ filter dropdown เปลี่ยนค่า → ไม่ error แม้ผลลัพธ์ว่างเปล่า, หน้า pagination reset กลับ 1
6. Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/dashboard/integrations` ตรงๆ ทาง URL → ถูก middleware บล็อก redirect ไป `/home` (ครอบคลุมด้วย prefix `/dashboard` อยู่แล้ว ไม่ต้องแก้ middleware เพิ่ม)

ทุกข้อทดสอบได้ในเซสชันนี้ครบ 100% — ไม่มี Edge Function ให้ deploy ในสโคปนี้ ไม่มีขั้นตอนที่ deferred ให้ผู้ใช้
