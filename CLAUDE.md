# CLAUDE.md

คำแนะนำนี้ให้ Claude Code อ่านทุกครั้งก่อนเริ่มทำงานในโปรเจกต์นี้ อ้างอิงเอกสารเพิ่มเติมที่ `/docs/PRODUCT.md` (business logic), `/docs/SCHEMA.md` (database) และ `/AGENTS.md` (MCP tools & workflow)

## Project Overview

ระบบจองห้องประชุมออนไลน์ของมหาวิทยาลัยราชภัฏลำปาง (LPRU) — พัฒนาใหม่โดยอ้างอิงระบบเดิม (README_meeting.md) เป็น reference แต่ปรับปรุงสถาปัตยกรรมและเพิ่มฟีเจอร์ Approval Chain, Integration Health, Reporting

## Tech Stack

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **Backend:** Supabase (PostgreSQL, Auth, RLS, Edge Functions, Realtime)
- **Auth:** Google OAuth จำกัดเฉพาะ `@g.lpru.ac.th` (2 ชั้น: Google Consent Screen + Auth Hook + Middleware)
- **Notification:** LINE Messaging API (Flex Message + Postback) — เป็น supplement เท่านั้น ไม่ใช่ primary interface
- **Automation:** Make.com (Free Plan — 2 scenarios, 1,000 credits/เดือน) — สร้าง/ลบ Google Calendar event + Discord notify
- **Hosting:** Vercel (Hobby Free Plan) — ยอมรับความเสี่ยงเรื่อง ToS non-commercial แล้ว มี monitoring ทดแทน
- **Font:** Sarabun (ภาษาไทย)
- **Testing:** Vitest (unit/integration) + Playwright (E2E)

## Environment Setup

- **ใช้ Supabase Cloud ตรงเลย** — ไม่ใช้ Docker local เนื่องจากระบบพึ่ง public URL (LINE Webhook, Make.com) ตั้งแต่ต้น
- **Supabase Project:** สร้าง org ใหม่ด้วยอีเมลมหาวิทยาลัย (แยกจาก personal account) — ดู project_id ใน `AGENTS.md`
- **Test users:** รัน `supabase/migrations/014_seed_data.sql` ใน Supabase Dashboard SQL Editor — `user@test.local`, `admin@test.local`, `approver1@test.local`, `approver2@test.local` / password `test1234`
- **Production เดียว:** ไม่มี staging แยก (ข้อจำกัดงบประมาณ) — รัน migration ผ่าน `apply_migration` MCP tool เท่านั้น ตรวจสอบด้วย `list_migrations` ก่อนทุกครั้ง
- `NODE_ENV=development` จะ bypass domain check ใน middleware — **ห้ามให้ค่านี้หลุดไปยัง production โดยเด็ดขาด** ตรวจ Vercel Environment Variables เสมอว่า `NODE_ENV=production`

## Supabase MCP Superpowers — ใช้ได้เลยไม่ต้องพิมพ์ SQL เอง

Agent มี Supabase MCP tools 15 ตัวที่ใช้งานได้โดยตรง — **อ่าน `AGENTS.md` ก่อนเสมอ** สำหรับ workflow มาตรฐานและกฎการใช้งาน

```
apply_migration         → รัน DDL migration (ใช้แทน execute_sql สำหรับ schema)
execute_sql             → query และ seed data
list_tables             → ดู schema ปัจจุบัน (verbose=true สำหรับรายละเอียด column)
list_migrations         → ตรวจว่า migration ไหนรันไปแล้ว
list_extensions         → ตรวจ extension ก่อนใช้ btree_gist
generate_typescript_types → สร้าง types/database.ts หลัง schema เปลี่ยน
deploy_edge_function    → deploy Edge Function พร้อม verify_jwt
list_edge_functions     → ดู Edge Functions ที่มีอยู่
get_logs                → debug: edge-function / postgres / auth / realtime
get_advisors            → ตรวจ security/performance หลัง migrate
get_project_url         → ดึง API URL สำหรับ .env
get_publishable_keys    → ดึง anon key สำหรับ .env
list_projects           → หา project_id (เรียกก่อนเสมอ)
```

## Commands ที่ใช้บ่อย (CLI)

```bash
supabase secrets set KEY=value  # ตั้งค่า secret สำหรับ Edge Function
supabase secrets list           # ดูรายชื่อ secret (ไม่แสดงค่าจริง)
npm run dev                     # รัน Next.js dev server
npm run test                    # รัน unit + integration tests (Vitest)
npx playwright test             # รัน E2E tests
```

## Critical Rules — ห้ามละเมิด

1. **Error Handling:** ทุก Edge Function ต้องห่อด้วย `withErrorHandling()` จาก `_shared/handler.ts` ไม่เขียน try-catch เองแยกกัน ให้ throw `AppError` subclass ที่เหมาะสมจาก `_shared/errors.ts` แทน
2. **Approval Logic:** ต้องเรียกผ่าน shared function `processApproval()` เท่านั้น ไม่ว่าจะมาจากเว็บหรือ LINE postback — ห้ามเขียน approval logic ซ้ำในที่อื่น เพื่อป้องกัน logic แตกเป็น 2 ชุด
3. **RLS ก่อนเสมอ:** ก่อนเขียน policy ใหม่ ให้ดู policy ที่มีอยู่แล้วใน `supabase/migrations/013_rls_policies.sql` ก่อน อย่าเขียนซ้ำหรือขัดแย้งกัน
4. **Business Hours:** ต้องอ่านจาก `system_config` table เสมอ (`office_start_hour`, `office_end_hour`, `holidays`) ห้าม hardcode 8-17 น. ในโค้ด
5. **Integration Logging:** ทุกครั้งที่เรียก external service (LINE, Make.com, Google Calendar) ต้อง log ผ่าน `logIntegration()` เข้า `integration_health` table เสมอ ทั้งกรณีสำเร็จและล้มเหลว
6. **Race Condition:** จุดที่ใช้ atomic update (`approval_tokens.is_used`, `line_link_tokens.is_used`) ต้อง UPDATE พร้อมเงื่อนไข WHERE เดิม (เช่น `WHERE is_used = false`) เสมอ ไม่ SELECT แล้วค่อย UPDATE แยกกัน
7. **Secrets:** Service role key และ secret ทุกตัวที่ severity สูง/วิกฤต (ดู `docs/SECURITY.md` ถ้ามี) ต้องอยู่ใน Supabase Edge Function Secrets เท่านั้น ห้ามอยู่ใน `NEXT_PUBLIC_*` env variable หรือ frontend code เด็ดขาด
8. **Migration:** ห้าม `DROP COLUMN`/`DROP TABLE` ตรงๆ ใน production (เพราะมี production เดียวไม่มี staging) — ถ้าต้องลบให้ deprecate ก่อน (เปลี่ยนชื่อเป็น `_deprecated_xxx`) แล้วค่อยลบทีหลังเมื่อมั่นใจ
9. **Copyright/Content:** ไม่ต้องพิเศษเรื่องนี้สำหรับโค้ด แต่ข้อความ UI ทั้งหมดต้องเป็นภาษาไทยที่เป็นทางการเหมาะกับหน่วยงานราชการ
10. **Design Tokens:** ก่อนเขียน UI component ใดๆ ต้องอ่าน `docs/DESIGN.md` ก่อนเสมอ — ใช้ CSS variable หรือ Tailwind utility class จาก token เท่านั้น ห้าม hardcode สี, spacing, font ตรงๆ ในโค้ด

## Architecture Decisions ที่ล็อกไว้แล้ว (ห้ามเปลี่ยนโดยไม่ปรึกษาก่อน)

- **Global Approval Chain เดียวทุกห้อง** (Admin → Approver1 → Approver2) — ไม่ใช่ per-room chain แม้แต่ห้อง VIP
- **ไม่มี Booking Quota** — จองได้ไม่จำกัดจำนวน
- **LINE เป็น supplement เท่านั้น** — ทุกฟีเจอร์ต้องทำงานบนเว็บได้ครบ 100% โดยไม่ต้องพึ่ง LINE (Approver ไม่เชื่อม LINE ก็ยังอนุมัติผ่านเว็บได้)
- **ไม่มี Import ข้อมูล** — มีแค่ Export
- **Approver มีสิทธิ์เห็น Reports เหมือน Admin** — ไม่ filter ตามหน่วยงานตัวเอง
- **Cancellation Rules:** pending ยกเลิกได้ทันทีโดย User เจ้าของ / approved ต้องขออนุมัติจาก Admin / Admin-Approver ยกเลิกได้ทันทีไม่ต้องขอใคร
- **Log Retention:** activity_logs และ integration_health ลบอัตโนมัติตาม retention period ที่ตั้งค่าได้ (default 6 เดือน) / approval_logs และ cancellation_logs เก็บถาวรตลอดไป (audit ราชการ)
- **Production เดียว** — ไม่มี staging environment แยก เนื่องจากข้อจำกัดงบประมาณและ Supabase Free Plan จำกัด 2 โปรเจกต์ต่อ organization

## Free Plan Constraints ที่ต้องคำนึงถึงตลอดการเขียนโค้ด

| Service | Limit | ผลกระทบต่อโค้ด |
|---|---|---|
| Supabase | 500MB storage, หยุดอัตโนมัติถ้าไม่มี activity 7 วัน | ต้องมี keep-alive ping ทุก 5 วัน |
| Make.com | 2 active scenarios, 1,000 credits/เดือน | Google Calendar เท่านั้น (Discord ยิงตรงจาก Edge Function) — Router แยก create/delete ใน scenario เดียว รับ gcal_event_id กลับทาง webhook response |
| LINE OA | 500 push messages/เดือน | Reply message ไม่จำกัด แต่ push ต้องประหยัด — เตือน Admin เมื่อใกล้เต็ม |
| Vercel Hobby | Function timeout 10 วินาที | Export function ที่ใช้เวลานานให้เรียก Supabase Edge Function ตรง ไม่ผ่าน Next.js API Route |

## Related Docs

- `/AGENTS.md` — Supabase MCP tools ทั้ง 15 ตัว, workflow มาตรฐาน, กฎการใช้งาน **อ่านก่อนทำงานทุกครั้ง**
- `/docs/PRODUCT.md` — Business logic, roles, states, page list ทั้งหมด
- `/docs/SCHEMA.md` — Database schema, ERD, RLS summary
- `/docs/DESIGN.md` — Design tokens (สี/spacing/typography), component patterns, mobile strategy, Tailwind config **อ่านก่อนเขียน UI ทุกครั้ง**
- `/supabase/migrations/` — Migration files 001-014 (รันผ่าน `apply_migration` MCP tool ตามลำดับเท่านั้น)
