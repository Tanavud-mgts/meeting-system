# AGENTS.md

คู่มือสำหรับ AI Agent ที่ทำงานในโปรเจกต์นี้ — อธิบาย tools ที่ใช้ได้, ลำดับการทำงาน, และข้อห้ามสำคัญ

## Tools ที่ใช้ได้ผ่าน Supabase MCP (15 tools)

### กลุ่ม 1 — Project & Connection

| Tool | หน้าที่ | ต้องใช้เมื่อ |
|---|---|---|
| `list_projects` | ดูโปรเจกต์ทั้งหมดใน org | ก่อนเริ่มทุกครั้ง เพื่อได้ `project_id` |
| `get_project` | ดูรายละเอียดโปรเจกต์ | ตรวจสอบ region, status |
| `get_project_url` | ดึง API URL | ใช้ใน `.env` และ Supabase client config |
| `get_publishable_keys` | ดึง anon key | ใช้ใน `.env` ฝั่ง client (public) |

### กลุ่ม 2 — Database

| Tool | หน้าที่ | ต้องใช้เมื่อ |
|---|---|---|
| `apply_migration` | รัน DDL (CREATE TABLE, ALTER, etc.) | **ใช้แทน `execute_sql` เสมอ สำหรับ DDL** |
| `execute_sql` | รัน SQL ทั่วไป (SELECT, INSERT) | query ตรวจข้อมูล, seed data |
| `list_tables` | ดูตารางทั้งหมด | ตรวจสอบก่อน migrate, verbose=true สำหรับ schema |
| `list_migrations` | ดูประวัติ migration | ตรวจว่า migration ไหนรันไปแล้ว |
| `list_extensions` | ดู extensions ที่ติดตั้ง | ตรวจก่อนใช้ btree_gist, uuid-ossp |
| `generate_typescript_types` | สร้าง TypeScript types จาก schema | หลัง migrate ทุกครั้งที่ schema เปลี่ยน |

### กลุ่ม 3 — Edge Functions

| Tool | หน้าที่ | ต้องใช้เมื่อ |
|---|---|---|
| `deploy_edge_function` | deploy Edge Function | เขียน/แก้ Edge Function เสร็จแล้ว |
| `list_edge_functions` | ดู Edge Functions ที่มีอยู่ | ตรวจก่อน deploy ซ้ำ |

### กลุ่ม 4 — Monitoring & Debugging

| Tool | หน้าที่ | ต้องใช้เมื่อ |
|---|---|---|
| `get_logs` | ดู logs ย้อนหลัง 24 ชม. | debug error ใน Edge Function, Auth, DB |
| `get_advisors` | ดู security/performance warnings | หลัง migrate ทุกครั้ง |

### กลุ่ม 5 — Project Lifecycle

| Tool | หน้าที่ | ต้องใช้เมื่อ |
|---|---|---|
| `confirm_cost` | ยืนยันค่าใช้จ่ายก่อนสร้าง branch | ต้องเรียกก่อน `create_branch` เสมอ |
| `create_branch` | สร้าง dev branch | **Free Plan ไม่รองรับ — ห้ามใช้** |

---

## Workflow มาตรฐานที่ Agent ต้องทำตาม

### เมื่อเริ่มงานใหม่ทุกครั้ง

```
1. list_projects                  → ได้ project_id
2. list_tables (verbose=false)    → เห็นภาพรวม schema ปัจจุบัน
3. list_migrations                → รู้ว่า migration ไหนรันไปแล้ว
4. อ่าน CLAUDE.md + PRODUCT.md + SCHEMA.md
```

### เมื่อต้องรัน Migration

```
1. list_migrations                → ตรวจว่าชื่อซ้ำไหม
2. list_extensions                → ตรวจ extension ก่อนใช้
3. apply_migration(name, sql)     → รัน DDL  ←  ใช้ tool นี้เสมอ ไม่ใช้ execute_sql
4. get_advisors(type="security")  → ตรวจ RLS ทันทีหลัง migrate
5. get_advisors(type="performance")
6. generate_typescript_types      → อัปเดต types/database.ts
```

### เมื่อต้อง Debug

```
1. get_logs(service="edge-function") → ดู error ล่าสุด
2. get_logs(service="postgres")      → ดู DB error
3. get_logs(service="auth")          → ดู auth error
4. execute_sql(query)                → query ตรวจข้อมูลโดยตรง
```

### เมื่อ Deploy Edge Function

```
1. list_edge_functions            → ตรวจชื่อซ้ำ
2. deploy_edge_function(...)      → deploy พร้อม verify_jwt=true เสมอ
3. get_logs(service="edge-function") → ตรวจ error หลัง deploy
```

---

## กฎการใช้งาน Tools

### ✅ ทำได้

- ใช้ `apply_migration` สำหรับทุก DDL (CREATE, ALTER, DROP, CREATE INDEX)
- ใช้ `execute_sql` สำหรับ SELECT ตรวจข้อมูล และ seed data
- รัน `get_advisors` ทุกครั้งหลัง migrate เพื่อตรวจ RLS ที่อาจขาด
- รัน `generate_typescript_types` ทุกครั้งที่ schema เปลี่ยน
- deploy Edge Function ด้วย `verify_jwt=true` เสมอ ยกเว้น webhook endpoint ที่ใช้ custom auth

### ❌ ห้ามทำ

- **ห้าม** ใช้ `execute_sql` สำหรับ DDL (ใช้ `apply_migration` แทน)
- **ห้าม** DROP TABLE / DROP COLUMN โดยตรง — deprecate ก่อนเสมอ
- **ห้าม** deploy Edge Function ด้วย `verify_jwt=false` โดยไม่มีเหตุผล
- **ห้าม** `create_branch` เพราะ Supabase Free Plan ไม่รองรับ (paid feature)
- **ห้าม** เปลี่ยน `system_config` ผ่าน `execute_sql` ตรงๆ — ต้องผ่าน Edge Function `update-approval-chain`
- **ห้าม** UPDATE `bookings.final_status` ผ่าน `execute_sql` โดยตรง ยกเว้น seed data

---

## Project ID

> **หมายเหตุ:** กรอก project_id จริงหลังสร้าง Supabase project แล้ว

```
PROJECT_ID = sbmbdngrutkjugsmmfxa
```

วิธีหา project_id:
```
Supabase Dashboard → Project Settings → General → Reference ID
```

---

## Edge Functions ที่ต้อง Deploy (ตามลำดับ)

```
_shared/errors.ts          → error classes (ไม่ deploy แยก เป็น shared module)
_shared/handler.ts         → withErrorHandling wrapper
_shared/lineClient.ts      → LINE messaging interface
_shared/retry.ts           → withRetry utility

auth-hook                  → verify_jwt=false (Supabase เรียกเอง)
line-webhook               → verify_jwt=false (LINE Platform เรียก, ใช้ signature แทน)
generate-line-otp          → verify_jwt=true
create-booking             → verify_jwt=true
approve-booking            → verify_jwt=true
cancel-booking             → verify_jwt=true
update-approval-chain      → verify_jwt=true
export-data                → verify_jwt=true
integration-health-summary → verify_jwt=true
keep-alive                 → verify_jwt=false (Make.com Scheduler เรียก, ใช้ secret header แทน)
cleanup-old-logs           → verify_jwt=false (Make.com Scheduler เรียก, ใช้ secret header แทน)
monthly-backup             → verify_jwt=false (Make.com Scheduler เรียก, ใช้ secret header แทน)
```

---

## Design Reference

ก่อนสร้างหรือแก้ไข UI component ใดๆ ให้อ่าน `/docs/DESIGN.md` ก่อนเสมอ

| ส่วน | ใช้เมื่อ |
|---|---|
| Section 1 — Color | เลือกสีปุ่ม, badge, status, background |
| Section 2 — Spacing & Radius & Shadow | กำหนด padding, gap, border-radius, box-shadow |
| Section 3 — Typography | font-size, font-weight ที่ถูกต้อง |
| Section 4 — Component Patterns | copy CSS pattern ของ card, button, badge, form, dialog, skeleton |
| Section 5 — Mobile Strategy | breakpoint 768px, Bottom Nav, Sidebar→Drawer, Table→Card |
| Section 7 — Tailwind Config | ใช้ utility class ผ่าน token แทน hardcode |

**ห้าม hardcode สี HEX, px spacing, หรือ font-size ตรงๆ ในโค้ด** — ใช้ CSS variable หรือ Tailwind token เสมอ

---

## Secrets ที่ต้อง Set ก่อน Deploy Edge Functions

```bash
supabase secrets set LINE_CHANNEL_SECRET=<จาก LINE Developers Console>
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=<จาก LINE Developers Console>
supabase secrets set MAKE_WEBHOOK_URL=<จาก Make.com scenario>
supabase secrets set MAKE_WEBHOOK_SECRET=<สร้างเอง random string>
```

ตรวจสอบ: `supabase secrets list` (แสดงแค่ชื่อ ไม่แสดงค่าจริง)
