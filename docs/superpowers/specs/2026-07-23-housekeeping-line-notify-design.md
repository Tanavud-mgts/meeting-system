# Design: ระบบแจ้งเตือนกลุ่มแม่บ้าน (LINE Group Notifications)

วันที่: 2026-07-23
สถานะ: อนุมัติดีไซน์แล้ว รอ review spec

## 1. เป้าหมายและที่มา

แม่บ้าน (housekeeping) มีหน้าที่ **เตรียมห้องก่อนประชุม** (จัดโต๊ะ-เก้าอี้ตามจำนวนคน, เตรียมน้ำ, เปิดแอร์/ไฟ, เปิดห้อง) และ **เก็บ/ทำความสะอาดหลังเลิก** ปัจจุบันแม่บ้านไม่มีช่องทางรับข้อมูลการจองที่อนุมัติแล้วแบบอัตโนมัติ ต้องให้เจ้าหน้าที่แจ้งเอง

ระบบนี้ส่งข้อมูลที่จำเป็นต่องานเตรียมห้องเข้า **LINE กลุ่มแม่บ้าน** อัตโนมัติ 3 เหตุการณ์ โดยยึดหลัก "ส่งเฉพาะข้อมูลที่แม่บ้านใช้ทำงานได้จริง" และ "เน้นงานระยะใกล้ (วันนี้/พรุ่งนี้) ไม่สร้าง noise จากการจองล่วงหน้าไกล"

LINE เป็น supplement — ระบบเว็บยังทำงานครบ 100% โดยไม่พึ่งฟีเจอร์นี้ (ตามหลักการใน CLAUDE.md)

## 2. ขอบเขต — 3 เหตุการณ์

| # | เหตุการณ์ | กลไก trigger | เงื่อนไขการส่ง |
|---|---|---|---|
| A | สรุปห้องประชุมพรุ่งนี้ (daily digest) | pg_cron รายชั่วโมง → edge function เช็คเวลาเอง | ส่งวันละครั้ง เมื่อชั่วโมงปัจจุบัน (Asia/Bangkok) = `housekeeping_digest_hour` และยังไม่ส่งวันนี้ |
| B | อนุมัติขั้นสุดท้าย (final approved) | hook ใน `notifyApprovalOutcome` (flow เดิม) | เฉพาะ booking ที่ `start_time` ตรงกับ "วันนี้หรือพรุ่งนี้" (Asia/Bangkok) |
| C | ยกเลิก approved booking | hook ใน `processCancellation` (ครอบทั้ง decide-cancellation และ direct-cancel) | เฉพาะ booking ที่ `start_time` ตรงกับ "วันนี้หรือพรุ่งนี้" (Asia/Bangkok) |

**นิยาม "วันนี้/พรุ่งนี้":** วันที่ของ `start_time` เมื่อแปลงเป็นเขตเวลา Asia/Bangkok เท่ากับวันที่ปัจจุบันหรือ +1 วัน

**เหตุผลของ near-term gate (B/C):** ถ้าจองล่วงหน้า 3 สัปดาห์แล้วเพิ่งอนุมัติ แม่บ้านรับ real-time ตอนนี้ก็ยังทำอะไรไม่ได้ ตัวสรุปพรุ่งนี้ (A) คือเครื่องมือหลัก ส่วน real-time มีค่าเฉพาะเคสอนุมัติ/ยกเลิกกระชั้น (จองวันนี้เพื่อพรุ่งนี้ หรือยกเลิกของที่แม่บ้านกำลังจะเตรียม)

## 3. เนื้อหาข้อความ

### 3.1 Daily digest (A)

เรียงตาม `start_time` จากเช้าไปเย็น:

```
📋 ห้องประชุมพรุ่งนี้ (จ. 24 ก.ค. 68) — 3 รายการ

1) 09:00–12:00 น. | ห้องประชุมสภา ชั้น 8
   ประชุมสภาวิชาการ · 25 คน
   โดย: สมชาย ใจดี (คณะครุศาสตร์)
   📝 จัดโต๊ะรูปตัว U + เตรียมน้ำ 25 ที่
   [BK-20260724-001]

2) 13:30–15:00 น. | ห้องประชุมย่อย 2
   ...
```

- บรรทัด `📝 ...` แสดงเฉพาะเมื่อมี `notes_for_staff`
- ถ้าพรุ่งนี้ไม่มีการประชุม → ส่งข้อความสั้น "พรุ่งนี้ (จ. 24 ก.ค. 68) ไม่มีการประชุม" เพื่อให้แม่บ้านรู้ว่าระบบยังทำงานปกติ (ไม่ใช่ระบบล่ม)
- นับเฉพาะ booking ที่ `final_status = 'approved'`

### 3.2 Real-time approved (B)

```
✅ ยืนยันการประชุม (พรุ่งนี้)
🕐 09:00–12:00 น. | ห้องประชุมสภา ชั้น 8
ประชุมสภาวิชาการ · 25 คน
โดย: สมชาย ใจดี (คณะครุศาสตร์)
📝 จัดโต๊ะรูปตัว U + เตรียมน้ำ 25 ที่
[BK-20260724-001]
```

คำว่า "(วันนี้)" หรือ "(พรุ่งนี้)" ปรับตาม `start_time`

### 3.3 Real-time cancelled (C)

```
❌ ยกเลิกการประชุม (พรุ่งนี้)
🕐 09:00–12:00 น. | ห้องประชุมสภา ชั้น 8
ประชุมสภาวิชาการ
[BK-20260724-001]
ไม่ต้องเตรียมห้องนี้แล้ว
```

### รูปแบบทั่วไป

- ทุกข้อความเป็น **plain text push เข้า LINE group** (ไม่ใช่ Flex/ปุ่ม เพราะแม่บ้านเป็นผู้รับข้อมูล ไม่ต้องกดโต้ตอบ)
- วันที่/เวลาใช้ formatter เดิมจาก `notify.ts` (`formatThaiDate`, `formatThaiTimeRange`) เขตเวลา Asia/Bangkok เลขอารบิก ปีพุทธศักราช
- ข้อความเป็นภาษาไทยเป็นทางการเหมาะกับหน่วยงานราชการ (CLAUDE.md ข้อ 9)

## 4. Schema Changes (migration ใหม่ `015_housekeeping_notify.sql`)

> ห้าม DROP ตรงๆ — ทุกอย่างเป็น ADD COLUMN / CREATE เท่านั้น

### 4.1 `bookings`
```sql
ALTER TABLE bookings ADD COLUMN notes_for_staff text;
```
หมายเหตุถึงแม่บ้าน (การจัดห้อง/อุปกรณ์/น้ำ) — ผู้จองกรอกได้ ไม่บังคับ

### 4.2 `system_config` (singleton)
```sql
ALTER TABLE system_config ADD COLUMN housekeeping_enabled           boolean NOT NULL DEFAULT false;
ALTER TABLE system_config ADD COLUMN housekeeping_line_group_id     text;
ALTER TABLE system_config ADD COLUMN housekeeping_digest_hour       int NOT NULL DEFAULT 17 CHECK (housekeeping_digest_hour BETWEEN 0 AND 23);
ALTER TABLE system_config ADD COLUMN housekeeping_digest_last_sent_on date;
```
- `housekeeping_enabled` — master toggle (default ปิด จนกว่า Admin จะตั้งค่า group ID ครบ)
- `housekeeping_line_group_id` — LINE group ID ที่ OA อยู่ในกลุ่ม
- `housekeeping_digest_hour` — ชั่วโมง (Asia/Bangkok) ที่ต้องการให้ส่งสรุปพรุ่งนี้
- `housekeeping_digest_last_sent_on` — วันที่ส่ง digest ล่าสุด (guard กันส่งซ้ำในวันเดียวกัน)

### 4.3 View `booking_detail`
เพิ่มคอลัมน์ที่ notify module ต้องใช้ (ปัจจุบันมี ref_id, requester_name, room_name, start_time, end_time, cancellation_reason แล้ว):
```sql
-- recreate view เพิ่ม: notes_for_staff, department, attendees, activity, title
```
`department` มาจาก JOIN `users.department` ของผู้จอง

### 4.4 pg_cron + pg_net
```sql
-- ตรวจ list_extensions ก่อน
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- cron รายชั่วโมง เรียก edge function ผ่าน pg_net (ตัว fn เช็คเวลาเอง)
SELECT cron.schedule(
  'housekeeping-digest-hourly',
  '0 * * * *',
  $$ select net.http_post(
       url := '<SUPABASE_URL>/functions/v1/send-housekeeping-digest',
       headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
     ) $$
);
```
> URL/key ใส่ผ่านค่าจริงตอน apply migration (ไม่ commit ค่า secret) — pg_cron ยิงทุกชั่วโมงยังช่วย keep-alive Supabase ไปในตัว

## 5. โค้ด — โมดูลและไฟล์

### 5.1 `_shared/housekeepingNotify.ts` (ใหม่)

หลักการ: **ไม่ throw เด็ดขาด** (ห่อ try/catch ทุก export เหมือน `bookingNotify.ts`) และ **log ทุกครั้ง** ผ่าน `logIntegration()` (CLAUDE.md ข้อ 5)

```ts
// ส่งข้อความเข้า group ถ้าเปิดใช้งาน + มี group ID + quota ไม่เต็ม → log ผล
async function sendToHousekeepingGroup(client, text): Promise<void>

// B: hook หลัง approved — เช็ค near-term ก่อนส่ง
export async function notifyHousekeepingApproved(client, bookingId): Promise<void>

// C: hook หลัง cancelled (จาก approved) — เช็ค near-term ก่อนส่ง
export async function notifyHousekeepingCancelled(client, bookingId): Promise<void>

// สร้างข้อความ digest จากรายการ (testable, pure)
export function buildDigestMessage(rows, forDate): string

// A: time-gate + idempotency + query พรุ่งนี้ + ส่ง (เรียกจาก edge fn)
export async function sendHousekeepingDigest(client): Promise<void>

// helper: start_time เป็นวันนี้/พรุ่งนี้ (Asia/Bangkok) หรือไม่ (testable, pure)
export function isNearTerm(startTimeIso, nowIso): "today" | "tomorrow" | null
```

`sendHousekeepingDigest` logic:
1. อ่าน `system_config` — ถ้า `housekeeping_enabled=false` หรือไม่มี group ID → return
2. คำนวณชั่วโมงปัจจุบัน Asia/Bangkok — ถ้า ≠ `housekeeping_digest_hour` → return
3. ถ้า `housekeeping_digest_last_sent_on` = วันนี้ (Asia/Bangkok) → return (กันส่งซ้ำ)
4. query booking `approved` ที่ `start_time` ตกวันพรุ่งนี้ (Asia/Bangkok) เรียงตามเวลา
5. `buildDigestMessage()` → `sendToHousekeepingGroup()`
6. อัปเดต `housekeeping_digest_last_sent_on = วันนี้` (ทำหลังส่งสำเร็จ เพื่อ retry ได้ถ้าชั่วโมงยังไม่ผ่าน)

### 5.2 `_shared/lineClient.ts` (แก้)
เพิ่ม:
```ts
export async function pushTextToGroup(groupId: string, text: string): Promise<void>
```
ใช้ LINE push API `to: groupId, messages:[{type:'text', text}]` — โครงเดียวกับ `pushFlex`

### 5.3 quota guard
ก่อน push เข้า group ให้ตรวจ `countLinePushesThisMonth()` (มีอยู่แล้วใน `notify.ts`) ถ้า ≥ 500 → ข้าม + log `service:'internal', payload:{skipped:'line_quota'}` ทุก group push สำเร็จ log `service:'line', status:'success', payload:{kind:'push', target:'housekeeping'}` เพื่อให้นับรวมโควตาถูกต้อง
> พิจารณา extract ตัวนับ/guard quota จาก `notify.ts` เป็น helper ที่ใช้ร่วมได้ เพื่อไม่ให้ logic แตกเป็น 2 ชุด

### 5.4 `send-housekeeping-digest/index.ts` (edge fn ใหม่)
โครงเหมือน `check-make-quota/index.ts` — สร้าง admin client, เรียก `sendHousekeepingDigest(client)`, ห่อ `withErrorHandling()`

### 5.5 Hook เข้า flow เดิม
- `bookingNotify.ts` → ใน `notifyApprovalOutcome` เมื่อ `result.finalStatus === "approved"` เพิ่มเรียก `notifyHousekeepingApproved(client, bookingId)` (fire-and-forget)
- `processCancellation.ts` → เมื่อ booking เดิมเป็น `approved` แล้วถูกยกเลิกสำเร็จ (ทั้ง path decide-cancellation อนุมัติยกเลิก และ direct-cancel) เพิ่มเรียก `notifyHousekeepingCancelled(client, bookingId)`

### 5.6 line-webhook (แก้ — optional แต่แนะนำ)
ดัก event `type: "join"` (OA ถูกเชิญเข้ากลุ่ม) → log `source.groupId` ลง `integration_health` (service:'line', payload:{kind:'group_join', groupId}) เพื่อให้ Admin คัดลอก group ID มากรอกใน settings ได้ง่าย โดยไม่ต้องใช้เครื่องมือภายนอก

## 6. UI

### 6.1 `/booking` (step 2 กรอกรายละเอียด)
เพิ่ม textarea ไม่บังคับ: **"หมายเหตุถึงแม่บ้าน (การจัดห้อง / อุปกรณ์ / น้ำ)"** — ส่งเป็น `notes_for_staff`
ใช้ design token ตาม `docs/DESIGN.md` (CLAUDE.md ข้อ 10)

### 6.2 `create-booking` edge fn (แก้)
รับและบันทึก `notes_for_staff` (optional, trim, ตัดความยาวสูงสุดที่สมเหตุผล เช่น 500 ตัวอักษร)

### 6.3 `/dashboard/settings` (Admin)
เพิ่มส่วน **"แจ้งเตือนกลุ่มแม่บ้าน (LINE)"**:
- toggle เปิด/ปิด (`housekeeping_enabled`)
- input LINE Group ID (`housekeeping_line_group_id`) — แสดง hint ว่าดู group ID ได้จากหน้า integrations หลัง OA เข้ากลุ่ม
- เลือกชั่วโมงส่งสรุปพรุ่งนี้ (`housekeeping_digest_hour`, dropdown 00–23)
- บันทึกผ่าน edge function (ขยาย `update-notification-settings` หรือ path ตั้งค่าเดิมที่เขียน `system_config`) — เขียน `system_config` ต้องผ่าน edge fn ที่ใช้ service_role (SCHEMA.md)

## 7. Prerequisites (ต้องทำก่อนใช้จริง — ไม่ใช่ระบบทำเอง)

1. เชิญ LINE OA เข้ากลุ่มแม่บ้าน
2. คัดลอก group ID (จาก integration_health หลัง join event ตาม 5.6) มากรอกใน `/dashboard/settings`
3. เปิด toggle + ตั้งชั่วโมงส่ง

## 8. Non-Goals (YAGNI)

- ไม่มีปุ่มโต้ตอบ/ยืนยันจากฝั่งแม่บ้าน (รับข้อมูลอย่างเดียว)
- ไม่แจ้ง booking ที่จองล่วงหน้าไกล (เกินพรุ่งนี้) แบบ real-time
- ไม่ส่งเข้า Discord/WeLPRU (เหตุการณ์กลุ่มแม่บ้านเป็น LINE group เท่านั้น)
- ไม่มีเบอร์โทรผู้จอง (ระบบไม่มีฟิลด์นี้) — ใช้ชื่อ + หน่วยงานเป็นข้อมูลติดต่อ
- ไม่มีหน้า preview/ส่ง digest ด้วยมือ

## 9. ความสอดคล้องกับ Critical Rules (CLAUDE.md)

- ข้อ 1 Error Handling: edge fn ใหม่ห่อ `withErrorHandling()`; โมดูล notify ไม่ throw
- ข้อ 4 Business Hours: digest อ่านค่าเวลาจาก `system_config` ไม่ hardcode
- ข้อ 5 Integration Logging: group push ทุกครั้ง log ผ่าน `logIntegration()`
- ข้อ 8 Migration: migration 015 เป็น ADD/CREATE ล้วน ไม่ DROP
- ข้อ 9 Content: ข้อความ UI/แจ้งเตือนเป็นภาษาไทยทางการ
- ข้อ 10 Design Tokens: UI ใหม่ใช้ token จาก `docs/DESIGN.md`

## 10. Testing

- `housekeepingNotify.test.ts`: `isNearTerm()` (วันนี้/พรุ่งนี้/เกิน, ขอบเขต Asia/Bangkok ข้ามเที่ยงคืน), `buildDigestMessage()` (มี/ไม่มีรายการ, มี/ไม่มี notes_for_staff, เรียงเวลา), `sendHousekeepingDigest()` time-gate + idempotency guard (mock client)
- `lineClient.test.ts`: `pushTextToGroup` payload ถูกต้อง
- integration: approved near-term ยิง group / far-future ไม่ยิง / cancelled near-term ยิง
