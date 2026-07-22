# Make.com Google Calendar Integration

## บริบท

ระบบจองห้องประชุม LPRU มี "extension point" สำหรับซิงก์ Google Calendar ผ่าน Make.com วางไว้ตั้งแต่ Track B/C/D แล้ว แต่ยังเป็น stub เปล่า (`triggerCalendarSync` / `triggerCalendarDelete` มีแค่ `// TODO`) สเปกนี้เติมเนื้อจริงให้ครบ

**สถานะปัจจุบันของโค้ด (ยืนยันแล้ว 2026-07-22):**

- `processApproval.ts:105` — `triggerCalendarSync(bookingId)` เรียกเมื่ออนุมัติครบขั้น 3 แต่เป็น stub เปล่า
- `processCancellation.ts:195` — `triggerCalendarDelete(bookingId)` stub เปล่า (path อนุมัติคำขอยกเลิก)
- `direct-cancel-booking/index.ts:120` — `triggerCalendarDelete(bookingId)` stub เปล่า (เรียกเฉพาะเมื่อมี `gcal_event_id`)
- `_shared/retry.ts` — `withRetry()` + `RetryableHttpError` พร้อมใช้
- `_shared/integrationLog.ts` — service type `make_com` และ `google_calendar` มีอยู่แล้ว
- `_shared/notify.ts` — orchestrator แจ้งเตือน (in-app/Discord/WeLPRU/LINE) + `EVENT_KEYS` เป็น source of truth
- คอลัมน์ `bookings.gcal_event_id text` มีอยู่แล้ว (005_bookings.sql:40)
- หน้า `/dashboard/integrations` แสดงการ์ด Make.com + Google Calendar อยู่แล้ว (อ่านจาก `integration_health`)
- Secrets `MAKE_WEBHOOK_URL` / `MAKE_WEBHOOK_SECRET` **ยังไม่ตั้ง** (LINE/Discord/WeLPRU ตั้งครบและไลฟ์แล้ว)

**การตัดสินใจที่ยืนยันกับผู้ใช้แล้ว:**

- Make.com scenario รับผิดชอบ **Google Calendar อย่างเดียว** — Discord ยิงตรงจาก Edge Function อยู่แล้ว ไม่ผ่าน Make (ประหยัด credits)
- รับ `gcal_event_id` กลับแบบ **synchronous webhook response** (ไม่ทำ callback endpoint แยก)
- เรียกแบบ **await inline ผ่าน shared client** ที่ **ไม่ throw เด็ดขาด** (Approach A — pattern เดียวกับ `notifyAndLog`) ไม่ใช้ background/outbox
- ถ้าซิงก์ล้มเหลว (หลัง retry ครบ): **ธุรกรรมหลักสำเร็จต่อไป** (DB คือ source of truth, calendar เป็น mirror) + **log failed เข้า `integration_health`** + **แจ้ง Admin เพิ่ม** ผ่าน event ใหม่ `calendar_sync_failed`
- **ไม่ส่ง `requester_email`** ใน payload (ตัดออกตามผู้ใช้ — ไม่ส่งข้อมูลเกินจำเป็น)
- Event ใน Calendar: ระบบส่ง **ข้อมูลดิบเป็นฟิลด์แยก** แล้วให้ **ฝั่ง Make ประกอบข้อความ** (เปลี่ยน format ภายหลังไม่ต้อง deploy โค้ด)

## ขอบเขต

**อยู่ในขอบเขต:**

1. `_shared/makeClient.ts` (ใหม่) — payload builder (testable) + transport (fetch + `withRetry`) + orchestrator `syncCalendarCreate` / `syncCalendarDelete` (ห่อ try/catch ไม่ throw)
2. เชื่อม 3 จุดเรียกเดิมเข้ากับ shared client (แทน stub)
3. event key `calendar_sync_failed` ใน `notify.ts` (แจ้ง Admin: in-app + Discord)
4. Unit tests + ขยายเทสต์เดิม
5. ไกด์ตั้งค่า Make.com scenario + secrets (ในแผน implementation)
6. อัปเดต CLAUDE.md ขอบเขต Make.com เป็น "calendar เท่านั้น"

**ไม่อยู่ในขอบเขต:**

- Async callback endpoint / outbox queue / background dispatch (YAGNI — เลือก Approach A)
- Make ยิง Discord (Discord ยิงตรงจาก Edge Function อยู่แล้ว)
- ให้ Make ส่ง Calendar ID จากระบบ (config ฝั่ง Make module)
- Update event เมื่อแก้ไขการจอง (ระบบไม่มีฟีเจอร์แก้ไขการจอง — มีแค่จอง/ยกเลิก)
- Retry ย้อนหลังของ booking ที่ซิงก์พังไปแล้ว (Admin แก้มือ / จองใหม่)

## สถาปัตยกรรมรวม

```
processApproval (อนุมัติครบขั้น 3)      processCancellation / direct-cancel-booking
        │                                       │ (เฉพาะเมื่อมี gcal_event_id)
        ▼                                       ▼
syncCalendarCreate(client, bookingId)   syncCalendarDelete(client, bookingId)
        │           _shared/makeClient.ts — ไม่ throw เด็ดขาด
        ▼
POST MAKE_WEBHOOK_URL (header x-webhook-secret)  ──►  Make.com scenario เดียว
  { action:"create"|"delete", ... }                        │
        ▲                                        filter เช็ค secret → Router
        │                                       ┌──────────┴──────────┐
  Webhook Response                          [create]              [delete]
  create: { gcal_event_id }                Google Calendar       Google Calendar
  delete: { ok: true }                     Create Event          Delete Event
        │                                        │                    │
        ▼                                   Webhook Response      Webhook Response
สำเร็จ(create): UPDATE bookings SET gcal_event_id
ทุกกรณี: logIntegration(service:"make_com", success|failed)
ล้มเหลว: notify calendar_sync_failed → Admin (in-app + Discord)
```

**หลักการ:** จุดเรียกทั้ง 3 ผ่าน shared function เดียว (Critical Rule 2) — logic ไม่แตกเป็นหลายชุด / ทุก external call log เข้า `integration_health` (Rule 5) / ไม่ block ผลลัพธ์ธุรกรรมหลัก / อ่าน secret จาก Edge Function Secrets เท่านั้น (Rule 7)

## Interface ของ `_shared/makeClient.ts`

แยกเป็นหน่วยย่อยที่ทดสอบได้อิสระ (เลียนแบบ `discordClient.ts` / `lineClient.ts`):

**Testable (pure, ไม่แตะ network/env):**

- `buildCreatePayload(row): CreatePayload` — ประกอบ payload create จากแถว `booking_detail`
- `buildDeletePayload(row): DeletePayload` — ประกอบ payload delete
- `interpretResponse(status, body)` — ตีความผลลัพธ์เป็น `{ ok: true, eventId? } | { ok: false, retryable: boolean, detail }`

**Transport (fetch + retry — ทดสอบด้วย mock fetch):**

- `postToMake(payload): Promise<...>` — อ่าน `MAKE_WEBHOOK_URL` + `MAKE_WEBHOOK_SECRET`, POST พร้อม header, ห่อ `withRetry()`, โยน `RetryableHttpError` เมื่อ 5xx/429/network เพื่อให้ retry; 4xx ไม่ retry

**Orchestrator (ไม่ throw เด็ดขาด — เรียกจาก mutation path):**

- `syncCalendarCreate(client, bookingId)` — load `booking_detail` → `postToMake(create)` → สำเร็จ: `UPDATE bookings SET gcal_event_id` + log success | ล้มเหลว/UPDATE พัง: log failed + `notify calendar_sync_failed`
- `syncCalendarDelete(client, bookingId)` — load `gcal_event_id` (ถ้าไม่มีข้าม) → `postToMake(delete)` → log success/failed + แจ้ง Admin เมื่อ failed

**สวิตช์เปิดใช้งาน:** ถ้า `MAKE_WEBHOOK_URL` ไม่ตั้งค่า → ทั้ง 2 orchestrator **return เงียบ ๆ** (console.log ไม่ log integration ไม่แจ้ง admin) — deploy โค้ดก่อนสร้าง scenario ได้อย่างปลอดภัย

## Payload Contract

**Auth:** ทุก request แนบ header `x-webhook-secret: <MAKE_WEBHOOK_SECRET>` — Make scenario ใส่ filter เช็คเป็นด่านแรก ไม่ตรง → 403 จบ

**Request → Make (create):**

```json
{
  "action": "create",
  "booking_id": "uuid",
  "ref_id": "BK-2026-0042",
  "title": "ประชุมคณะกรรมการบริหาร",
  "activity": "ประชุมประจำเดือน",
  "attendees": 15,
  "room_name": "ห้องประชุมชั้น 2",
  "requester_name": "สมชาย ใจดี",
  "start_time": "2026-07-25T02:00:00Z",
  "end_time": "2026-07-25T04:00:00Z"
}
```

- เวลาเป็น ISO UTC — ให้ Google Calendar จัด timezone เอง
- **ไม่มี** `requester_email`

**Response ← Make (create):** `200` + `{ "gcal_event_id": "abc123xyz" }`

- ได้ id → `UPDATE bookings SET gcal_event_id = ... WHERE id = booking_id`
- 200 แต่ไม่มี `gcal_event_id` → นับเป็น **failed** (contract ผิด)

**Request → Make (delete):**

```json
{
  "action": "delete",
  "booking_id": "uuid",
  "ref_id": "BK-2026-0042",
  "gcal_event_id": "abc123xyz"
}
```

**Response ← Make (delete):** `200` + `{ "ok": true }` — ระบบเช็คแค่ status 200

**หน้าตา Event ใน Google Calendar (ประกอบฝั่ง Make):**

- summary: `[BK-2026-0042] ประชุมคณะกรรมการบริหาร @ ห้องประชุมชั้น 2`
- location: `ห้องประชุมชั้น 2`
- description:
  ```
  ผู้จอง: สมชาย ใจดี
  กิจกรรม: ประชุมประจำเดือน
  จำนวนผู้เข้าร่วม: 15 คน
  อ้างอิง: BK-2026-0042
  ```
- Calendar ID เป้าหมาย config ในโมดูล Google Calendar ฝั่ง Make (ไม่ส่งจากระบบ)

**Retry:** `withRetry()` เดิม (3 ครั้ง, backoff 500ms→1s) — retry เมื่อ network error / 5xx / 429 เท่านั้น, **4xx ไม่ retry**

**delete idempotency:** ถ้า event ถูกลบมือใน Google Calendar ไปแล้ว Make จะเจอ "not found" — scenario ฝั่ง Make treat เป็นสำเร็จ (ตอบ 200) เพราะเป้าหมาย "event ต้องไม่อยู่" สำเร็จแล้วโดยปริยาย

## Error Handling

`syncCalendarCreate` / `syncCalendarDelete` **ไม่ throw เด็ดขาด** — ธุรกรรมหลัก (อนุมัติ/ยกเลิก) สำเร็จไปแล้ว

**Log เข้า `integration_health` (Rule 5):**

- สำเร็จ → `service:"make_com", status:"success", payload:{ action, booking_id }`
- ล้มเหลว (หลัง retry ครบ) → `status:"failed"` + `error_detail` (HTTP status + body จาก Make) → โผล่การ์ดแดงหน้า Integration Health อัตโนมัติ

**แจ้ง Admin เมื่อล้มเหลว** — event `calendar_sync_failed` ใน registry:

- ผู้รับ: Admin (`system_config.admin_id`) — in-app เสมอ + Discord ตาม toggle (ไม่มี LINE/WeLPRU เหมือน `line_quota_warning`)
- ข้อความ default: `⚠️ ซิงก์ปฏิทินไม่สำเร็จ — [{ref_id}] {room} วันที่ {date} ({action})`
- link → `/dashboard/integrations`
- เพิ่มใน `EVENT_KEYS` + `EVENT_DEFAULTS` + `DISCORD_MESSAGE_TEMPLATES` (source of truth → โผล่หน้า settings อัตโนมัติ)

**กรณีขอบ:**

| กรณี | พฤติกรรม |
|---|---|
| `MAKE_WEBHOOK_URL` ยังไม่ตั้ง | ข้ามเงียบ ๆ (console.log) ไม่ log ไม่แจ้ง — สวิตช์เปิดใช้งานโดยธรรมชาติ |
| ยกเลิก booking ที่ไม่มี `gcal_event_id` | ข้าม ไม่เรียก ไม่ log (ไม่มี external call) |
| Make ตอบ 200 แต่ไม่มี `gcal_event_id` | นับ failed → log + แจ้ง Admin |
| Create สำเร็จแต่ `UPDATE bookings` พัง (orphan event) | นับ failed → log + แจ้ง Admin พร้อม event id ใน error_detail |
| 4xx จาก Make | ไม่ retry → failed ทันที |
| 5xx / 429 / network error | retry ตาม `withRetry` แล้วค่อย failed |

## จุดเชื่อมกับโค้ดเดิม

- `processApproval.ts` — แทน `triggerCalendarSync(bookingId)` ด้วย `await syncCalendarCreate(client, bookingId)` (ยังคงหลัง UPDATE final_status สำเร็จ)
- `processCancellation.ts` — แทน `triggerCalendarDelete(bookingId)` ด้วย `await syncCalendarDelete(client, bookingId)`
- `direct-cancel-booking/index.ts` — แทน stub เดียวกัน (คงเงื่อนไข `if (booking.gcal_event_id)`)
- ลบฟังก์ชัน stub เดิมทั้ง 3 ตัวออก

**Deploy (บทเรียนจาก memory):** แก้ `_shared` ต้อง redeploy **ทุก** function ที่ import — งานนี้: `approve-booking`, `decide-cancellation`, `direct-cancel-booking`, `request-cancellation`, `create-booking`, `line-webhook` (ทุกตัวที่แตะ processApproval/processCancellation/notify)

## Testing

**`makeClient.test.ts` (ใหม่):**

- `buildCreatePayload` / `buildDeletePayload` — ฟิลด์ครบถูกต้อง, **ไม่มี** `requester_email`
- `interpretResponse` — 200+id → success / 200 ไม่มี id → failed / 4xx → failed ไม่ retry / 5xx,429 → retryable
- `syncCalendarCreate` — สำเร็จ: UPDATE + log success | ล้มเหลว: log failed + แจ้ง `calendar_sync_failed` | UPDATE พัง: failed + แจ้ง | `MAKE_WEBHOOK_URL` ไม่ตั้ง: ข้ามเงียบ
- `syncCalendarDelete` — ไม่มี `gcal_event_id`: ข้าม | สำเร็จ/ล้มเหลว: log + แจ้งตามกรณี
- ทุกฟังก์ชัน orchestrator **ไม่ throw** ทุกกรณี

**ขยายเทสต์เดิม:**

- `processApproval.test.ts` — อนุมัติครบขั้น 3 → เรียก create (mock)
- `processCancellation.test.ts` — เรียก delete เฉพาะเมื่อมี `gcal_event_id`
- `notify.test.ts` — `calendar_sync_failed` ∈ EVENT_KEYS + defaults ครบ

## งานฝั่ง Make.com (คู่มือละเอียดในแผน implementation)

1. Scenario เดียว: Custom Webhook → filter เช็ค `x-webhook-secret` → Router → แขน create (Google Calendar Create Event → Webhook Response `{gcal_event_id}`) / แขน delete (Delete Event → Response `{ok:true}`, error handler "not found" → 200)
2. เชื่อม Google account + เลือก calendar เป้าหมาย
3. สร้าง random secret → ใส่ทั้งใน Make filter และ `supabase secrets set MAKE_WEBHOOK_SECRET=...` + `MAKE_WEBHOOK_URL=<จาก Make>`

**Credits:** ~4-5 ops/การเรียก → 1,000 credits รองรับ ~200 เหตุการณ์/เดือน (สร้าง+ลบรวม) — พอสำหรับระดับคณะ + Integration Health เฝ้ายอด

**Live smoke test:** จองจริง → อนุมัติครบ 3 ขั้น → event โผล่ + `gcal_event_id` ถูกบันทึก → ยกเลิก → event หาย → การ์ด Make.com หน้า Integration Health เขียว
