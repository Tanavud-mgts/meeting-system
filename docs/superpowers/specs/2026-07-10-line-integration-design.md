# ระบบแจ้งเตือน เฟส 3 — LINE Integration (Flex postback + OTP linking + quota guard)

## บริบท

เฟสสุดท้ายของช่องทางแจ้งเตือนตาม spec แม่ (`2026-07-09-notification-system-design.md`) — เฟส 1 (in-app) และเฟส 2 (Discord + WeLPRU + verify) ship แล้วทั้งคู่ เฟสนี้เพิ่ม LINE ซึ่งต่างจากช่องอื่นตรงที่เป็นช่องทาง**โต้ตอบ**: Approver กดปุ่มอนุมัติ/ปฏิเสธใน Flex Message แล้ว postback กลับเข้าระบบ

**สถานะโค้ด/DB ปัจจุบัน (สำรวจแล้ว):**

- `approval_tokens` (migration 007) มีครบตามต้องการ: `booking_id + step + approver_id`, `is_used`, หมดอายุ 48 ชม., **unique partial index — active token ได้ 1 อันต่อ (booking, step)** — แต่ยังไม่มีโค้ดไหนสร้าง/ใช้เลย
- `line_link_tokens` (009): OTP 6 หลัก unique, หมดอายุ 10 นาที, partial index บน otp ที่ยังไม่ใช้ — ยังไม่มีโค้ดใช้
- `consent_records.consent_type` มี `'line_linking'` ใน CHECK ตั้งแต่ 009
- `users.line_user_id` UNIQUE (002) + `system_config.line_enabled` (022, default false, ยังไม่มีใครอ่าน)
- `notifyAndLog` (เฟส 2) มีโครง multi-channel + toggle + override + never-throw + `logIntegration` พร้อมแล้ว
- AGENTS.md วางไว้แล้ว: `line-webhook` → verify_jwt=false (ใช้ signature แทน), `generate-line-otp` → verify_jwt=true
- **ยังไม่มีไฟล์ LINE ใดๆ ในโปรเจกต์**

**การตัดสินใจที่ยืนยันกับผู้ใช้แล้ว:**

1. **มี LINE OA + Messaging API credentials พร้อมแล้ว** (`LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`) → เฟสนี้ **live-test จริงได้เลย** ไม่ต้อง dormant แบบเฟส 2
2. **สถาปัตยกรรมแบบ C:** LINE เป็นช่องทางที่ 4 ใน `notifyAndLog` (quota guard + logIntegration + toggle รวมจุดเดียว) โดยเพิ่ม optional param `lineApproval: { bookingId, step, approverId }` ที่ `bookingNotify.ts` ส่งมาเฉพาะ 2 event ที่มีปุ่ม — `notifyAndLog` resolve `line_user_id` เองแบบเดียวกับที่ resolve `staff_id` ของ WeLPRU
3. **ขอบเขต LINE push แคบกว่าตาราง matrix ใน spec แม่ (deviation ที่ตั้งใจ):** ส่งเฉพาะ **2 เหตุการณ์อนุมัติที่มีปุ่ม** (`booking_submitted` → Approver ขั้น 1, `booking_step_approved` → Approver ขั้นถัดไป) — **ตัด `cancellation_requested` ออกจาก LINE** เพื่อประหยัด quota 500/เดือน (Admin ยังได้รับทาง in-app + Discord + WeLPRU ครบ และ event นั้นไม่มีปุ่มตัดสินในแชทอยู่แล้ว) — spec แม่ถือว่าถูก override โดยข้อนี้

## ขอบเขต

**อยู่ในขอบเขต:**

- `approval_tokens` lifecycle: สร้างตอน push / consume ตอน postback (atomic, Rule 6)
- Flex Message การ์ดคำขอ + ปุ่มอนุมัติ/ปฏิเสธ → postback → `processApproval()` ตัวเดียวกับเว็บ (Critical Rule 2)
- `line-webhook` Edge Function: signature verify + route postback / `/link` / follow
- OTP linking flow ครบวงจร: `generate-line-otp` + UI ในโปรไฟล์ + `/link` ในแชท + ยกเลิกเชื่อม
- Quota guard 500 push/เดือน + event ใหม่ `line_quota_warning` (event ที่ 9)
- Live-test จริงกับ LINE OA จริง

**ไม่อยู่ในขอบเขต:**

- LIFF, Rich Menu, broadcast ทุกชนิด
- ปุ่มตัดสินคำขอ**ยกเลิก**ในแชท (ตัดสินผ่านเว็บเท่านั้น — ล็อกไว้แล้วใน spec แม่)
- ช่องกรอกเหตุผลปฏิเสธใน LINE (postback ทำไม่ได้โดยไม่พึ่ง LIFF — เหตุผลจะเป็น "ไม่ระบุ"; อยากใส่เหตุผลให้ใช้เว็บ)
- แก้ `approve-booking` / เว็บ approval flow ใดๆ (เว็บไม่ใช้ token — derive step จาก chain เหมือนเดิม)
- หน้า Admin ตั้งค่า template/toggle (เฟส 4)
- Migration ใหม่ — **ไม่มีเลย** ตารางครบแล้วทั้งหมด

## สถาปัตยกรรม

```
create-booking / approve-booking (ไม่แก้ handler เดิม)
        │
        ▼
bookingNotify.ts ── notifyBookingSubmitted / notifyApprovalOutcome
        │                (2 event ปุ่ม: เพิ่ม lineApproval: {bookingId, step, approverId})
        ▼
notifyAndLog()  ← เพิ่ม LINE เป็นช่องทางที่ 4
        ├─ 1. In-App (เดิม)
        ├─ 2. Discord (เดิม)
        ├─ 3. WeLPRU (เดิม)
        └─ 4. LINE — เฉพาะเมื่อ line_enabled && override.line !== false && มี params.lineApproval:
              ├─ resolve users.line_user_id ของ approver → ไม่มี = ข้ามเงียบ
              ├─ quota guard (นับจาก integration_health)
              ├─ createOrReuseApprovalToken() → approval_tokens
              ├─ pushFlex(การ์ด + ปุ่มฝัง token) → logIntegration('line', kind:'push')
              └─ แตะ 400 ครั้งแรกของเดือน → ยิง line_quota_warning (recursion ลึก 1)

LINE Platform ──POST──▶ line-webhook (verify_jwt=false)
        ├─ verifyLineSignature(raw body, X-Line-Signature)  → ไม่ผ่าน 401
        ├─ postback a=approve|reject&t=<token>
        │     └─ handleApprovalPostback(): atomic consume → identity check
        │        → processApproval() → notifyApprovalOutcome() → reply ผลลัพธ์
        ├─ message "/link XXXXXX" → handleLinkCommand() → ผูก line_user_id + consent → reply
        ├─ follow → reply ต้อนรับ + วิธีเชื่อม
        └─ อื่นๆ → reply help สั้น / เมิน — ตอบ 200 เสมอ
```

หลักการคงเดิมจากเฟส 1-2 ทุกข้อ: **never-throw ใน notifyAndLog**, Rule 5 (logIntegration ทุก external call), Rule 6 (atomic UPDATE), Rule 7 (secrets ใน Edge Function Secrets), เว็บทำงานครบ 100% โดยไม่พึ่ง LINE

## Token Lifecycle + Postback + Security

**สร้าง token (ใน LINE channel ของ `notifyAndLog`):**

- insert `approval_tokens(booking_id, step, approver_id)` — ใช้ default 48 ชม. เดิม
- ชน unique partial index (`23505` — มี active token ของ step นี้อยู่แล้ว เช่น push ซ้ำ) → **SELECT token active เดิมมา reuse** ไม่ error
- สร้างไม่สำเร็จจริงๆ → ข้าม LINE เงียบ + log failed (Approver อนุมัติผ่านเว็บได้เสมอ)

**Postback data (LINE จำกัด 300 ตัวอักษร):** `a=approve&t=<uuid>` | `a=reject&t=<uuid>`

**Flex card:** แสดงรายละเอียดคำขอ (ผู้จอง/ห้อง/วันที่/เวลา — ตัวแปรชุดเดียวกับ template) + ปุ่มอนุมัติ(เขียว)/ปฏิเสธ(แดง), `altText` ใช้ title เดียวกับ `EVENT_DEFAULTS` ของ event นั้น (ตาม spec แม่)

**Consume (ใน `line-webhook`) — ลำดับความปลอดภัยเป็นชั้น:**

1. `verifyLineSignature`: HMAC-SHA256 ของ **raw body** ด้วย `LINE_CHANNEL_SECRET` เทียบ header `X-Line-Signature` (ต้องอ่าน raw ก่อน parse JSON) — ไม่ผ่าน → 401
2. **Identity check ก่อน consume:** SELECT token row (อ่านอย่างเดียว ไม่แตะ `is_used`) → เทียบ `event.source.userId` กับ `users.line_user_id` ของ `approver_id` ในโทเคน — ไม่ตรง → reply generic + **ไม่เผา token** (ถ้าเผาก่อนเช็ค คนผิดกดจะล็อกการ์ดของ Approver ตัวจริงทิ้งทั้งที่ยังไม่เคยตัดสิน)
3. **Atomic consume (Rule 6):** `UPDATE approval_tokens SET is_used=true WHERE id=$ AND is_used=false AND expires_at>now()` คืน `booking_id, step, approver_id` — guard ทุกตัวยังอยู่ใน WHERE ของ UPDATE เดียว (SELECT ในข้อ 2 ใช้เพื่อ authorization เท่านั้น ไม่ใช่เงื่อนไขตัดสิน race) — ศูนย์แถว → reply "คำขอนี้ถูกดำเนินการไปแล้วหรือลิงก์หมดอายุ กรุณาตรวจสอบที่หน้าเว็บ"
4. `processApproval(adminClient, { bookingId, step, approverId, action })` — ตัวเดียวกับเว็บเป๊ะ
5. สำเร็จ → reply "✅ อนุมัติเรียบร้อยแล้ว" / "❌ ปฏิเสธเรียบร้อยแล้ว" + เรียก `notifyApprovalOutcome()` ให้ chain เดินต่อ (approver ถัดไปได้ Flex ใบใหม่ / ผู้จองได้ผลสุดท้าย)
6. `ConflictError` (มีคนตัดสินไปแล้วทางเว็บ) → reply แจ้งสถานะ — **webhook ตอบ HTTP 200 เสมอ** แม้ business error (LINE retry เมื่อ non-2xx → เสี่ยง double-processing)

**การตัดสินใจย่อยที่ล็อก:**

- ปฏิเสธผ่าน LINE → `note` ว่าง, เหตุผลในแจ้งเตือนผู้จอง = "ไม่ระบุ"
- token ถูก consume แล้วแต่ `processApproval` ล้ม (เช่นเว็บตัดสินไปก่อน) → token เผาทิ้ง ไม่ rollback — เว็บเป็น source of truth
- token หมดอายุไม่กระทบเว็บ (เว็บไม่ใช้ token)

## OTP Linking + การจัดการ message

**Flow เชื่อมบัญชี (PRODUCT.md — ไม่ใช้ LIFF):**

1. โปรไฟล์ (แทน placeholder "เร็วๆ นี้"): กด "เชื่อมต่อ LINE" → `generate-line-otp` (verify_jwt=true) → insert `line_link_tokens` → แสดง OTP 6 หลัก + นับถอยหลัง 10 นาที + ลิงก์เพิ่มเพื่อน `line.me/R/ti/p/@<oa-id>` จาก `NEXT_PUBLIC_LINE_OA_ID` (public id ไม่ใช่ secret — ไม่ตั้งก็แสดงแค่คำแนะนำ)
2. ผู้ใช้เพิ่มเพื่อน OA → พิมพ์ `/link 123456`
3. webhook: match `/link \d{6}` → atomic consume `line_link_tokens` (Rule 6) คืน `user_id` → `UPDATE users SET line_user_id = event.source.userId` + insert `consent_records('line_linking')` → reply "✅ เชื่อมต่อบัญชีสำเร็จ"
4. OTP ผิด/หมดอายุ → reply "รหัสไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่จากหน้าโปรไฟล์"

**กรณีขอบ:**

- LINE account ผูกกับบัญชีอื่นอยู่ (ชน UNIQUE `23505`) → reply "LINE นี้ถูกเชื่อมกับบัญชีอื่นแล้ว"
- เชื่อมซ้ำด้วย OTP ใหม่ = ทับ `line_user_id` เดิม (ย้ายเครื่องได้)
- **ยกเลิกเชื่อม:** ปุ่มในโปรไฟล์ set `line_user_id = null` ผ่าน Supabase client ตรง (RLS "users: update own" คุม — ไม่ต้องมี Edge Function)

**Message/event อื่น (reply ฟรี ไม่กิน push quota):** follow → ต้อนรับ + วิธีเชื่อม / ข้อความไม่ match → help ประโยคเดียว / event อื่น (unfollow, sticker) → เมิน ตอบ 200

## Quota Guard + `line_quota_warning`

**การนับ:** ทุก LINE API call log ผ่าน `logIntegration('line')` (Rule 5) พร้อม `payload: { kind: 'push' | 'reply' }` — ตัวนับ quota = `COUNT(*) WHERE service='line' AND status='success' AND payload->>'kind'='push' AND created_at >= ต้นเดือน` (reply ฟรี ไม่นับ) — ไม่เพิ่มคอลัมน์/ตารางใหม่

**Guard ใน LINE channel:**

1. นับก่อน push → **≥ 500**: ข้าม, log `internal` payload `{skipped:'line_quota'}` — ช่องอื่นปกติ
2. < 500: token + pushFlex → log ตามผล
3. push สำเร็จแล้วยอด **≥ 400 ครั้งแรกของเดือน** → ยิง `line_quota_warning`

**Event `line_quota_warning` (event ที่ 9 — เพิ่มเข้า `EventKey`/`EVENT_DEFAULTS`/`DISCORD_MESSAGE_TEMPLATES`):**

- ผู้รับ: Admin (จาก chain) / ช่องทาง: **in-app + Discord เท่านั้น** (ตาม matrix ของ spec แม่ — ไม่ LINE ไม่ WeLPRU)
- Title "⚠️ โควตา LINE ใกล้เต็ม" / Body "เดือนนี้ส่งไปแล้ว {sent}/500 ข้อความ เมื่อครบโควตาระบบจะหยุดส่งทาง LINE อัตโนมัติ" / link `/dashboard/integrations` / Discord `⚠️ LINE quota: {sent}/500`
- **Dedupe เดือนละครั้ง:** เช็คว่ามี `notifications` ที่ `event_key='line_quota_warning'` ในเดือนนี้แล้วหรือยัง
- ยิงผ่าน `notifyAndLog` recursion ลึก 1 ชั้น — ปลอดภัย: event นี้ไม่มี `lineApproval` จึงไม่เข้า LINE branch อีก และทั้งก้อนอยู่ใน try/catch ของ LINE branch (never-throw คงเดิม)

**Threshold ตายตัว 400/500** — ไม่ทำ config (YAGNI, Free Plan limit ไม่เปลี่ยน)

## โครงไฟล์

**สร้างใหม่:**

| ไฟล์ | หน้าที่ |
|---|---|
| `supabase/functions/_shared/lineClient.ts` | transport `pushFlex`/`replyText` (Deno fetch — ไม่ unit-test ตาม pattern Discord/WeLPRU) + pure testable: `buildApprovalFlex()`, `parsePostbackData()`, `verifyLineSignature()` (crypto.subtle มีทั้ง Node 20/Deno → **test ได้จริง**) |
| `supabase/functions/_shared/lineApproval.ts` | logic + mockClient-testable: `createOrReuseApprovalToken()`, `handleApprovalPostback()` (identity check → atomic consume → `processApproval` → `notifyApprovalOutcome` → คืนข้อความ reply ให้ webhook ส่ง), `handleLinkCommand()` |
| `supabase/functions/line-webhook/index.ts` | verify_jwt=false, raw-body signature check, route events, ตอบ 200 เสมอ |
| `supabase/functions/generate-line-otp/index.ts` | verify_jwt=true |
| test: `lineClient.test.ts`, `lineApproval.test.ts` | |

**แก้ไข:** `notify.ts` (LINE channel + `lineApproval?` param + quota + event 9), `bookingNotify.ts` (ส่ง `lineApproval` ใน 2 event ปุ่ม), `notify.test.ts`/`bookingNotify.test.ts`, `app/(app)/profile/page.tsx` (การ์ด LINE จริง: OTP + สถานะเชื่อม + ยกเลิก), `supabase/config.toml` (2 entries)

**Secrets:** `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` (Edge Function Secrets — Rule 7) / `NEXT_PUBLIC_LINE_OA_ID` (public, .env)

## Error Handling

| กรณี | การจัดการ |
|---|---|
| signature ไม่ผ่าน | 401, ไม่ประมวลผล event |
| token ใช้แล้ว/หมดอายุ/ไม่พบ | reply แจ้ง + 200 (atomic กัน double-approve) |
| postback จาก LINE user ที่ไม่ตรง approver | reply generic แจ้งตรวจสอบที่เว็บ + 200 |
| `processApproval` ConflictError | reply "ดำเนินการไปแล้ว" + 200 |
| quota ≥500 | ข้าม LINE เงียบ ช่องอื่นปกติ |
| approver ไม่ได้เชื่อม LINE | ข้ามเงียบ (in-app/เว็บครบเสมอ) |
| push/reply ล้มเหลว | log failed, never-throw |
| Edge Function ใหม่ | `withErrorHandling` + AppError (Rule 1) — ยกเว้น line-webhook ที่ business error ก็ยังตอบ 200 |

## Testing

**Unit (Vitest + mockClient เดิม):**

- `buildApprovalFlex`: JSON โครงถูก + postback data ฝัง token ครบ 2 ปุ่ม / `parsePostbackData` ครบกิ่ง
- `verifyLineSignature`: ลายเซ็นถูก/ผิด (HMAC จริงผ่าน crypto.subtle)
- `createOrReuseApprovalToken`: สร้างใหม่ / ชน 23505 → reuse / ล้มจริง → null
- `handleApprovalPostback`: consume สำเร็จ→processApproval ถูกเรียกด้วย params ถูก / token ศูนย์แถว / identity ไม่ตรง / ConflictError → ข้อความ reply ถูกกิ่ง
- `handleLinkCommand`: สำเร็จ + consent / OTP ผิด / ชน UNIQUE
- notify.ts: gating (`line_enabled=false` ข้าม, ไม่มี `line_user_id` ข้าม, ไม่มี `lineApproval` ข้าม), quota <400/=400 (เตือนครั้งเดียว + dedupe)/≥500, never-throw เดิมผ่านหมด

**Live-test (credentials พร้อม):**

1. set secrets → deploy ทุก function ที่เกี่ยว
2. **ผู้ใช้ register webhook URL** ใน LINE Developers Console: `https://sbmbdngrutkjugsmmfxa.supabase.co/functions/v1/line-webhook` + เปิด Use webhook + Verify (ต้อง 200)
3. เชื่อมบัญชีจริงผ่าน OTP → เห็น reply สำเร็จ
4. เปิด `line_enabled=true` → booking จริง → Flex ถึง approver → กดอนุมัติ → chain เดินต่อ + reply ถูก + กดการ์ดซ้ำได้ "ดำเนินการไปแล้ว" → รอบสองทดสอบปุ่มปฏิเสธ → ตรวจ `integration_health` มี kind push/reply แยกถูก

## สิ่งที่จงใจไม่ทำ (สรุป)

| เรื่อง | เหตุผล |
|---|---|
| LINE แจ้ง `cancellation_requested` | ตัดเพื่อประหยัด quota — Admin ได้ 3 ช่องทางอื่นครบ (override spec แม่ ยืนยันกับผู้ใช้แล้ว) |
| ช่องกรอกเหตุผลปฏิเสธในแชท | ต้องพึ่ง LIFF — ตัดถาวร ใช้เว็บแทน |
| Migration ใหม่ | ตารางครบตั้งแต่ 007/009/022 |
| Threshold quota เป็น config | YAGNI — Free Plan คงที่ 400/500 |
| แก้ approve-booking / เว็บ flow | เว็บไม่ใช้ token อยู่แล้ว ถูกต้องตามเดิม |
