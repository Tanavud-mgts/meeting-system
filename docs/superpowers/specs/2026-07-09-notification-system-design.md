# ระบบแจ้งเตือน — In-App + WeLPRU + LINE + Discord

## บริบท

ออกแบบระบบแจ้งเตือนของระบบจองห้องประชุม โดยศึกษาจาก blueprint ของ Notebook System V5 (`notification-system-blueprint.md`) แล้วปรับให้เข้ากับสถาปัตยกรรมของโปรเจกต์นี้ — จุดต่างสำคัญคือ mutation หลักของระบบนี้อยู่ใน Supabase Edge Functions (`processApproval()` / `processCancellation()` / `create-booking`) ไม่ใช่ Next.js Server Actions แบบต้นแบบ ดังนั้น orchestrator ต้องเป็น shared module ฝั่ง Deno

**สถานะปัจจุบันของโค้ด:** ยังไม่มีช่องทางแจ้งเตือนใดถูก build เลย — LINE integration มีแค่ตาราง (`line_link_tokens`) และแผนใน AGENTS.md, ไม่มี Edge Function `line-webhook`/`generate-line-otp` จริง, ไม่มีตาราง `notifications`, `processApproval.ts` มีเพียง TODO สำหรับ Make.com webhook

**การตัดสินใจที่ยืนยันกับผู้ใช้แล้ว:**

- Discord Webhook **ยิงตรงจาก Edge Function** ไม่ผ่าน Make.com (Make.com เหลือหน้าที่ Google Calendar อย่างเดียว) — ช่องเดียวรับทุกเหตุการณ์
- WeLPRU: มี API key ได้, deep link เปิด URL ภายนอก (Vercel) ได้, ไม่ทราบ rate limit แต่ผู้ใช้น้อย, ผู้รับสูงสุด ~3 คน/เหตุการณ์
- รวม LINE (Flex Message + postback อนุมัติในแชท) ในสโคปนี้ด้วย
- ยืนยัน `staff_id` ก่อนเปิด WeLPRU push ด้วยวิธี **push ทดสอบ + กดลิงก์ยืนยัน**
- Admin ตั้งค่าได้เต็มรูปแบบ: toggle ต่อ event + **แก้ template ข้อความผ่านเว็บได้** (เหมือนต้นแบบ)
- ผู้จองได้รับแจ้งเฉพาะ**ผลลัพธ์สุดท้าย** (อนุมัติครบ/ปฏิเสธ/ยกเลิก) ไม่แจ้งความคืบหน้าทุกขั้น
- แสดงเหตุผลการปฏิเสธ/ยกเลิกในตัวข้อความเลย

## ขอบเขต

**อยู่ในขอบเขต** (สเปกเดียว แบ่ง implement 4 เฟสอิสระ):

1. **เฟส 1** — ตาราง `notifications` + orchestrator `_shared/notify.ts` + Bell UI ใน `AppNav` (ไม่พึ่ง external ใช้ได้ทันที)
2. **เฟส 2** — Discord ยิงตรง + WeLPRU push + flow ยืนยัน `staff_id`
3. **เฟส 3** — LINE: `line-webhook`, OTP linking, Flex Message postback → `processApproval()`
4. **เฟส 4** — หน้า Admin ตั้งค่า: toggle ต่อ event + template editor

**ไม่อยู่ในขอบเขต:**

- WeLPRU Group Broadcast (`/notify/group`) — broadcast ถึงบุคลากรทั้งมหาวิทยาลัยรวมคนไม่ใช้ระบบ = spam, ตัดถาวร
- DB trigger สร้าง notification อัตโนมัติ (แบบ Section 5.3 ของต้นแบบ) — ซ้ำซ้อนกับ orchestrator, hardcode ข้อความใน SQL, ข้าม toggle/template
- Manual notification โดย Admin — ตัดเป็น YAGNI ไว้พิจารณาภายหลัง
- การแก้ Make.com scenario (Google Calendar ยังทำงานตามเดิม)
- Import ข้อมูล, per-room approval chain (architecture ล็อกไว้แล้ว)

## สถาปัตยกรรมรวม

```
Edge Function ทำ mutation สำเร็จ (processApproval / processCancellation / create-booking)
        │
        ▼
notifyAndLog()  ←  supabase/functions/_shared/notify.ts
        │
        ├── Promise.allSettled([...])   ★ Fire-and-Forget — ล้มช่องไหนไม่กระทบระบบหลัก ไม่ throw เด็ดขาด
        │
        ├─ 1. In-App    → INSERT notifications (ช่องทางหลัก — เว็บทำงานครบ 100% โดยไม่พึ่งช่องอื่น)
        ├─ 2. WeLPRU    → POST /notify/user รายคน (เฉพาะ user ที่ welpru_verified_at IS NOT NULL)
        ├─ 3. LINE      → Flex Message + ปุ่มอนุมัติ (เฉพาะ Approver ที่มี line_user_id + quota ไม่เต็ม)
        ├─ 4. Discord   → Webhook ช่องเดียว (feed ทุกเหตุการณ์)
        └─ 5. logIntegration() ทุก external call → integration_health (Critical Rule 5)
```

### ตารางผู้รับ × ช่องทาง

| เหตุการณ์ | ผู้รับ | In-App | WeLPRU | LINE | Discord |
|---|---|---|---|---|---|
| ยื่นคำขอจองใหม่ | Approver ขั้นที่ 1 | ✅ | ✅ | ✅ ปุ่มอนุมัติ | ✅ |
| ขั้นก่อนหน้าอนุมัติ | Approver ขั้นถัดไป | ✅ | ✅ | ✅ ปุ่มอนุมัติ | ✅ |
| อนุมัติครบทุกขั้น | ผู้จอง | ✅ | ✅ | — | ✅ |
| ถูกปฏิเสธ (ขั้นไหนก็ตาม) | ผู้จอง | ✅ | ✅ | — | ✅ |
| ขอยกเลิกการจอง (approved) | Admin | ✅ | ✅ | ✅ | ✅ |
| ผลคำขอยกเลิก (อนุมัติ/ปฏิเสธ) | ผู้จอง | ✅ | ✅ | — | ✅ |
| ถูกยกเลิกโดย Admin/Approver | ผู้จอง | ✅ | ✅ | — | ✅ |
| LINE quota ใกล้เต็ม (400/500) | Admin | ✅ | — | — | ✅ |

### Secrets (Critical Rule 7 — ต่างจากต้นแบบที่เก็บ API key ใน DB)

`WELPRU_API_KEY`, `DISCORD_WEBHOOK_URL`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` และ `SITE_URL` (โดเมน Vercel สำหรับสร้าง deep link ยืนยัน) อยู่ใน Supabase Edge Function Secrets ทั้งหมด — เปลี่ยนค่าผ่าน `supabase secrets set` เท่านั้น (ยอมแลกความสะดวกกับความปลอดภัย เพราะเปลี่ยนไม่บ่อย) ส่วน toggle และ template อยู่ใน `system_config` เพราะไม่ใช่ secret

## Database Schema — migration `021_notifications.sql`

### (1) ตาราง `notifications`

```sql
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key  text NOT NULL,   -- 'booking_submitted', 'booking_approved', ...
  title      text NOT NULL,
  body       text,
  link       text,            -- path ภายในเว็บ เช่น '/approver', '/profile/bookings'
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  read_at    timestamptz
);
CREATE INDEX idx_notifications_unread  ON notifications (user_id) WHERE is_read = false;
CREATE INDEX idx_notifications_user    ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_created ON notifications (created_at);  -- cleanup job
```

- RLS: SELECT / UPDATE / DELETE เฉพาะ `user_id = auth.uid()` ตาม pattern `013_rls_policies.sql` — **ไม่มี INSERT policy สำหรับ authenticated** (Edge Functions ใช้ service role ซึ่ง bypass RLS — ต้นแบบใช้ `WITH CHECK (true)` ซึ่ง advisors จะเตือน)
- เพิ่มตารางเข้า Realtime publication (`ALTER PUBLICATION supabase_realtime ADD TABLE notifications`)
- Retention: ลบตาม `activity_log_retention_months` เดิมใน `cleanup-old-logs` (ไม่เพิ่ม config ใหม่)
- Link เก็บลงแถวตั้งแต่ตอนสร้าง — frontend ไม่ต้องมี route-mapping function แบบต้นแบบ

### (2) ตาราง `welpru_link_tokens` (ลอก pattern `line_link_tokens`)

```sql
CREATE TABLE welpru_link_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_id   text NOT NULL,          -- รหัสที่กำลังยืนยัน
  token      text NOT NULL UNIQUE,   -- random string ฝังใน deep link
  is_used    boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  created_at timestamptz DEFAULT now()
);
```

- Confirm ด้วย atomic `UPDATE ... WHERE token = $1 AND is_used = false AND expires_at > now()` (Critical Rule 6 — ห้าม SELECT แล้ว UPDATE แยก)
- `cleanup-old-logs` เก็บกวาด token หมดอายุด้วย `line_token_retention_days` เดิม

### (3) เพิ่มใน `users`

- `welpru_verified_at timestamptz` — NULL = ยังไม่ยืนยัน, orchestrator ส่ง WeLPRU เฉพาะคนที่ verified
- Trigger data-integrity: `staff_id` ถูกแก้ → reset `welpru_verified_at = NULL` (ไม่ใช่ trigger สร้างข้อความ — คนละเรื่องกับ trigger แจ้งเตือนที่ตัดทิ้ง)
- ขยาย `anonymize_user_on_delete_request()` ให้ล้าง `welpru_verified_at` ด้วย (PDPA)

### (4) เพิ่มใน `system_config`

```sql
welpru_enabled  boolean NOT NULL DEFAULT false,
discord_enabled boolean NOT NULL DEFAULT false,
line_enabled    boolean NOT NULL DEFAULT false,
notification_settings jsonb NOT NULL DEFAULT '{}'
-- ต่อ event: { "booking_approved": { "welpru": true, "discord": true, "line": true,
--              "title": null, "body": null } }   ← null = ใช้ default ในโค้ด
```

แก้ค่าผ่าน Edge Function ใหม่ `update-notification-settings` เท่านั้น (กฎ AGENTS.md ห้ามแก้ `system_config` ตรง) — **ไม่เพิ่มคอลัมน์นับ quota LINE**: ใช้ `COUNT(*)` จาก `integration_health WHERE service='line' AND status='success'` ของเดือนปัจจุบัน

### (5) แก้ CHECK constraints

- `integration_health.service`: เพิ่ม `'welpru'`, `'discord'` (drop + re-add constraint — ไม่ใช่ drop column ไม่ขัด Rule 8) + อัปเดต type `IntegrationService` ใน `_shared/integrationLog.ts`
- `consent_records.consent_type`: เพิ่ม `'welpru_linking'`

## Event Keys + Template ภาษาไทย

**หลักการ:** สั้น อ่านจบใน 1 วรรค, ภาษาไทยทางการ (ใช้ "ท่าน"), emoji นำหน้า 1 ตัวเป็น status indicator, title ออกแบบให้ต่ำกว่า 50 ตัวอักษรตั้งแต่แรก (truncate เป็น safety net), วันที่ พ.ศ. แบบย่อ ("15 ก.ค. 69") เวลา "09:00–12:00 น."

**ข้อความชุดเดียวใช้ทั้ง In-App และ WeLPRU** — ตัวแปร: `{booker}` `{room}` `{date}` `{time}` `{reason}` `{sent}`

| Event | ผู้รับ | Title | Body | Link |
|---|---|---|---|---|
| `booking_submitted` | Approver ขั้น 1 | 🔔 มีคำขอจองห้องประชุมใหม่ | {booker} ขอจอง{room} วันที่ {date} เวลา {time} โปรดพิจารณาอนุมัติ | `/approver` |
| `booking_step_approved` | Approver ขั้นถัดไป | 🔔 มีคำขอจองรอท่านพิจารณา | {booker} ขอจอง{room} วันที่ {date} เวลา {time} ผ่านการอนุมัติขั้นก่อนหน้าแล้ว | `/approver` |
| `booking_approved` | ผู้จอง | ✅ การจองได้รับอนุมัติแล้ว | การจอง{room} วันที่ {date} เวลา {time} ได้รับอนุมัติเรียบร้อยแล้ว | `/profile/bookings` |
| `booking_rejected` | ผู้จอง | ❌ การจองไม่ได้รับอนุมัติ | การจอง{room} วันที่ {date} ไม่ได้รับอนุมัติ เหตุผล: {reason} | `/profile/bookings` |
| `cancellation_requested` | Admin | 🔔 มีคำขอยกเลิกการจอง | {booker} ขอยกเลิกการจอง{room} วันที่ {date} เหตุผล: {reason} | `/approver/cancel-requests` |
| `cancellation_approved` | ผู้จอง | ✅ คำขอยกเลิกได้รับอนุมัติ | การจอง{room} วันที่ {date} ถูกยกเลิกเรียบร้อยแล้ว | `/profile/bookings` |
| `cancellation_denied` | ผู้จอง | ❌ คำขอยกเลิกไม่ได้รับอนุมัติ | การจอง{room} วันที่ {date} ยังมีผลตามเดิม เหตุผล: {reason} | `/profile/bookings` |
| `booking_cancelled` | ผู้จอง | ⚠️ การจองของท่านถูกยกเลิก | การจอง{room} วันที่ {date} เวลา {time} ถูกยกเลิก เหตุผล: {reason} | `/profile/bookings` |
| `line_quota_warning` | Admin | ⚠️ โควตา LINE ใกล้เต็ม | เดือนนี้ส่งไปแล้ว {sent}/500 ข้อความ เมื่อครบโควตาระบบจะหยุดส่งทาง LINE อัตโนมัติ | `/dashboard/integrations` |

**Push พิเศษนอกตาราง toggle:** `welpru_link_verify` — title "ยืนยันการรับแจ้งเตือน" body "แตะลิงก์นี้เพื่อยืนยันการรับแจ้งเตือนจากระบบจองห้องประชุม" + deep link ไปหน้า confirm พร้อม token

**ลำดับความสำคัญ template (เหมือนต้นแบบ):** override ที่ส่งเข้า `notifyAndLog()` → template ที่ Admin แก้ใน `notification_settings` → default ในโค้ด — ฟังก์ชัน `applyTemplate()` แบบ `{variable}` substitution ยกจากต้นแบบ

**รูปแบบ Discord** (บรรทัดเดียวต่อเหตุการณ์, username bot: `ระบบจองห้องประชุม LPRU`):

```
📥 คำขอใหม่ — {booker} จอง {room} · {date} {time} (รออนุมัติขั้นที่ 1)
⏫ ผ่านขั้นที่ {step} — {room} · {date} (ต่อคิว: {approver})
✅ อนุมัติครบ — {room} · {date} {time} ({booker})
❌ ปฏิเสธขั้นที่ {step} — {room} · {date} ({booker})
🗑️ ขอยกเลิก — {booker} · {room} · {date}
✅ ยกเลิกแล้ว / ❌ ไม่อนุมัติยกเลิก / ⚠️ Admin ยกเลิก — {room} · {date}
⚠️ LINE quota: {sent}/500
```

**LINE:** Flex Message ของ Approver ไม่ใช้ template ชุดนี้ (structured card มีปุ่มอนุมัติ/ปฏิเสธ + รายละเอียดการจอง) แต่ `altText` ใช้ title เดียวกับตาราง — **ปุ่ม postback มีเฉพาะเหตุการณ์อนุมัติการจอง** (`booking_submitted` / `booking_step_approved`) ส่วน `cancellation_requested` เป็นข้อความแจ้ง + ลิงก์ไปหน้าเว็บเท่านั้น ไม่มีปุ่มตัดสินใจในแชท (จำกัดสโคป postback ให้แคบ — การตัดสินคำขอยกเลิกทำผ่านเว็บ)

## Orchestration Layer — `supabase/functions/_shared/notify.ts`

```typescript
await notifyAndLog(client, {
  eventKey: 'booking_approved',
  recipients: [{ userId, staffId, lineUserId }],   // สูงสุด ~3 คน
  variables: { booker, room, date, time, reason },
  activity: { actorId, action, targetType, targetId }   // → activity_logs เดิม
})
```

ขั้นตอนภายใน:

1. อ่าน `system_config` ครั้งเดียว (master toggles + `notification_settings`)
2. ประกอบข้อความตามลำดับ override → Admin template → default
3. ยิงทุกช่องด้วย `Promise.allSettled()`:
   - In-App: INSERT `notifications` รายผู้รับ (service role)
   - WeLPRU: เฉพาะ recipient ที่ `welpru_verified_at IS NOT NULL` และ toggle เปิด
   - LINE: เฉพาะ recipient ที่มี `line_user_id`, toggle เปิด, quota ไม่เต็ม
   - Discord: ข้อความเดียวต่อเหตุการณ์
4. ทุก external call ห่อ `withRetry()` (จาก `_shared/retry.ts` เดิม) + `logIntegration()` ทั้งสำเร็จและล้มเหลว
5. เขียน `activity_logs` ผ่าน helper เดิม
6. **ไม่ throw ออกไปเด็ดขาด** — log rejected results ด้วย `console.error` + `logIntegration(status='failed')`

**Quota guard ของ LINE:** ก่อน push นับ pushes เดือนปัจจุบันจาก `integration_health` — ถ้า ≥ 500 ข้ามการส่ง (log skip เป็น `internal`) / ถ้าแตะ 400 ครั้งแรกของเดือน ยิง event `line_quota_warning` (กันซ้ำ: เช็กว่ามี notification `line_quota_warning` ของ Admin ในเดือนนี้แล้วหรือยัง)

**จุดเรียก `notifyAndLog()`:** ใน `processApproval()` (submitted→step→approved/rejected ตามผลลัพธ์), `processCancellation()` (requested/approved/denied/direct-cancel), `create-booking` (booking_submitted) — logic เลือก event + recipients อยู่ใกล้ mutation ไม่กระจายไปที่อื่น

## Transport Layer

### `_shared/welpruClient.ts` (ใหม่)

- `sendWelpruPush({ staffIds, title, body, link })` → POST `https://api.lpruhub.com/api/notify/user` **ทีละคน** (`user_id` เป็น string เดี่ยว) ผ่าน `Promise.allSettled` — partial success ถือว่าสำเร็จ (ตามต้นแบบ)
- Truncate: title 50 / body 250 / link 255 ตัวอักษร (link เกิน = drop link ไม่ตัด)
- Header `X-API-Key` จาก `Deno.env.get('WELPRU_API_KEY')`

### `_shared/discordClient.ts` (ใหม่)

- `sendDiscord(message)` → POST `DISCORD_WEBHOOK_URL` body `{ content, username: 'ระบบจองห้องประชุม LPRU' }`
- Retry เคารพ `Retry-After` header เมื่อโดน 429 — ขยาย `_shared/retry.ts` ให้รองรับ (ความสามารถที่ต้นแบบมีแต่ของเรายังไม่มี)

### `_shared/lineClient.ts` (ตามแผนเดิมใน AGENTS.md)

- Push Flex Message มีปุ่มอนุมัติ/ปฏิเสธ → postback เข้า Edge Function `line-webhook` (`verify_jwt=false`, ตรวจ `X-Line-Signature` HMAC ด้วย `LINE_CHANNEL_SECRET` แทน)
- Postback → เรียก `processApproval()` ตัวเดียวกับเว็บเป๊ะ (Critical Rule 2) — `approval_tokens.is_used` atomic update (Rule 6)
- OTP linking: `generate-line-otp` (verify_jwt=true) + `/link XXXXXX` ใน webhook ตาม flow ที่ออกแบบไว้ใน PRODUCT.md
- Reply message (ตอบ postback) ไม่นับ quota — เฉพาะ push ที่นับ

## Flow ยืนยัน WeLPRU (หน้า `/profile`)

1. ผู้ใช้กรอก `staff_id` + ติ๊ก consent PDPA → กด "ยืนยันการรับแจ้งเตือนผ่าน WeLPRU"
2. Edge Function `request-welpru-verify` (verify_jwt=true): สร้าง token → ส่ง push ทดสอบพร้อม deep link `{SITE_URL}/profile/welpru-verify?token=...`
3. ผู้ใช้แตะลิงก์บนมือถือ → หน้าเว็บบังคับ login → Edge Function `confirm-welpru-verify`: atomic UPDATE token + ตรวจว่า token เป็นของ user ที่ login อยู่ → set `welpru_verified_at` + INSERT `consent_records('welpru_linking')`
4. โปรไฟล์แสดงสถานะ "✅ ยืนยันแล้วเมื่อ {วันที่}" / แก้ `staff_id` → trigger reset เป็นยังไม่ยืนยัน ต้องทำใหม่

เหตุผลของ flow นี้: `staff_id` เป็นค่าที่ผู้ใช้กรอกเอง (migration 020) ถ้าพิมพ์ผิด push จะไปมือถือบุคลากรคนอื่น = ละเมิด PDPA — การบังคับกดยืนยันจากมือถือปลายทางพิสูจน์ว่าเป็นเจ้าของจริง

## Frontend

### In-App Bell (เฟส 1)

- `hooks/useNotifications.ts` — React Query: unread count + รายการ 50 ล่าสุด / Supabase Realtime (INSERT filter `user_id=eq.{userId}`) invalidate cache เป็นหลัก + polling 60 วินาที backup (ต้นแบบใช้ 30 วิ — ยืดได้เพราะ Realtime เป็นตัวหลัก)
- mark-read / mark-all-read / delete ยิงตรงผ่าน Supabase client (RLS คุมแล้ว — ไม่ต้องมี server actions แบบต้นแบบ)
- Bell + unread badge ใน `AppNav` + dropdown รายการ — เขียนตาม token ใน `docs/DESIGN.md` เท่านั้น (Critical Rule 10) — คลิกรายการ → mark read + นำทางตาม `link` ในแถว

### หน้า Admin ตั้งค่า (เฟส 4 — ขยาย `/dashboard/settings`)

- Master toggle 3 ช่องทาง (WeLPRU / LINE / Discord)
- ตาราง per-event: 9 events × 3 ช่องทาง (checkbox)
- Template editor ต่อ event: ช่อง title/body + ตัวนับอักษร (เตือนเมื่อเกิน 50/250) + ปุ่ม "คืนค่าเริ่มต้น" (set กลับ null) + preview ด้วยข้อมูลตัวอย่าง
- บันทึกผ่าน Edge Function `update-notification-settings` (verify_jwt=true, admin เท่านั้น) + ลง `activity_logs`

## Error Handling

| กรณี | การจัดการ |
|---|---|
| ช่องทางแจ้งเตือนล้มเหลว | ไม่กระทบ mutation หลัก (`Promise.allSettled` ไม่ throw) — log ลง `integration_health` โผล่ที่ `/dashboard/integrations` (เพิ่มการ์ด `welpru`, `discord`) |
| WeLPRU ส่งบางคนสำเร็จบางคนล้มเหลว | Partial success = สำเร็จ, log รายคนที่ล้มเหลว |
| LINE quota เต็ม (≥500) | ข้ามการส่ง LINE, log skip, ช่องอื่นส่งตามปกติ |
| Discord 429 | Retry ตาม `Retry-After` สูงสุด 3 ครั้ง |
| Token ยืนยันหมดอายุ/ใช้แล้ว | หน้า confirm แสดง "ลิงก์หมดอายุ กรุณาขอยืนยันใหม่" — atomic update กัน race |
| ผู้รับไม่ได้ verify WeLPRU / ไม่ได้เชื่อม LINE | ข้ามช่องนั้นเงียบๆ (ไม่ใช่ error) — in-app ได้เสมอ |
| Edge Function ใหม่ทุกตัว | ห่อ `withErrorHandling()` + throw `AppError` subclass (Critical Rule 1) |

## Testing (Success Criteria)

**Unit (Deno, pattern เดียวกับ `processApproval.test.ts` + `mockClient.ts`):**

- `applyTemplate()`: substitution ปกติ, ตัวแปรขาด (คง `{key}` ไว้), ไม่มี vars
- Truncation: title 50 / body 250 / link เกิน 255 → drop
- Quota guard: <400 ส่งปกติ, แตะ 400 ยิง warning ครั้งเดียว, ≥500 ข้าม
- การเลือกช่องทาง: toggle ปิด → ข้าม, ไม่ verified → ข้าม WeLPRU, ไม่มี `line_user_id` → ข้าม LINE
- `welpru_link_tokens`: atomic confirm — token ใช้แล้ว/หมดอายุต้อง fail
- `notifyAndLog()` ไม่ throw แม้ทุกช่องล้มเหลว

**E2E (Playwright — เฉพาะ in-app, external ใช้ mock):**

- สร้าง booking → Approver คนแรกเห็นแจ้งเตือนใน bell → คลิก → นำทางไป `/approver` + mark read
- Badge count ลดเมื่อ mark read / mark all read

**Manual (หลัง deploy เฟส 2-3):**

- ส่ง push ทดสอบ WeLPRU ถึงเครื่องจริง + กดยืนยันสำเร็จ
- Discord webhook โพสต์ลงช่องจริง
- LINE Flex postback อนุมัติแล้วผลตรงกับอนุมัติผ่านเว็บ

## สิ่งที่จงใจไม่ทำ (สรุป)

| ของต้นแบบ | เหตุผลที่ตัด |
|---|---|
| DB trigger สร้าง notification | ซ้ำซ้อน 2 ทาง, hardcode ข้อความใน SQL, ข้าม toggle/template — สร้างจาก orchestrator จุดเดียว |
| `welpru_api_key` ใน DB | ขัด Critical Rule 7 — ใช้ Edge Function Secrets |
| Group Broadcast | ถึงบุคลากรทั้งมหาวิทยาลัย = spam |
| `admin_welpru_ids TEXT[]` | derive จาก approval chain ใน `system_config` + `users.staff_id` แทน กัน config drift |
| `staff_activity_log` ใหม่ | ใช้ `activity_logs` เดิม |
| Discord 4 webhook แยกประเภท | ระบบเล็ก ช่องเดียวพอ |
| Route-mapping function ฝั่ง client | เก็บ `link` ลง DB ตั้งแต่สร้างแถว |
