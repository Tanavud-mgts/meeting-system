# Make.com Quota Alert — เตือน Admin ก่อน credits หมด

## บริบท

Make.com Free Plan มี 1,000 operations/เดือน (รอบบิล reset วันที่ 18) ถ้า credits หมด scenario จะหยุด → calendar sync ล้มเหลว ระบบมี safety net แบบ **reactive** อยู่แล้ว (`calendar_sync_failed` แจ้ง admin เมื่อ sync พัง) — สเปกนี้เพิ่มชั้น **proactive**: เตือนล่วงหน้าเมื่อใช้ไป 80% และ 95% โดยดึงตัวเลขจริงจาก Make API

**การตัดสินใจที่ยืนยันกับผู้ใช้แล้ว:**

- ดึงเลขจริงจาก **Make API** (ไม่ใช้การประมาณจาก integration_health)
- เตือน **2 ระดับ: 80% (เตรียมตัว) และ 95% (วิกฤต)** — dedupe ต่อระดับต่อรอบบิล
- ช่องทาง: in-app + Discord ถึง admin (pattern เดียวกับ `line_quota_warning`)
- cadence: ต่อยอด **Vercel Cron `keep-alive` เดิม** (ทุก 3 วัน) — ไม่สร้าง cron ใหม่

**ข้อเท็จจริงจาก Make API docs (ยืนยัน 2026-07-23):**

- `GET https://us2.make.com/api/v2/organizations/{organizationId}` — auth header `Authorization: Token <token>` → มี `lastReset`, `nextReset` (ขอบรอบบิล) และ `license` (object ไม่ fix schema — ในทางปฏิบัติมี operations limit; ถ้าอ่านไม่ได้ fallback = 1000)
- `GET https://us2.make.com/api/v2/organizations/{organizationId}/usage` → array รายวัน `[{date, operations, ...}]` ย้อนหลัง 30 วัน **ไม่มี limit และไม่ได้ตัดตามรอบบิล**
- ดังนั้น: `used = Σ operations ของวันที่ date >= lastReset` และ `limit = license.operations ?? 1000`

## ขอบเขต

**อยู่ในขอบเขต:**

1. Edge Function ใหม่ `check-make-quota` — เรียก Make API, คำนวณ tier, dedupe, แจ้งเตือน, log
2. Migration: เพิ่มคอลัมน์ `make_quota_last_tier int NOT NULL DEFAULT 0` ใน `system_config`
3. Event ใหม่ `make_quota_warning` ใน notify registry
4. แก้ `/api/keep-alive` ให้ trigger `check-make-quota` ต่อท้าย ping เดิม (fire-and-forget)
5. Secrets ใหม่ (Supabase Edge Function Secrets): `MAKE_API_TOKEN`, `MAKE_ORG_ID`
6. Unit tests ส่วน pure

**ไม่อยู่ในขอบเขต:**

- Cron ใหม่/pg_cron (ใช้ keep-alive เดิม)
- แสดงกราฟ/ตัวเลข credits ในหน้า dashboard (ดูใน Make ได้ — YAGNI)
- Auto-pause/คุมการยิง webhook เมื่อใกล้เต็ม (แค่เตือน ไม่ intervene)
- การเตือนช่องทาง LINE/WeLPRU (เหมือน line_quota_warning: in-app + Discord พอ)

## สถาปัตยกรรม

```
Vercel Cron (ทุก 3 วัน, ของเดิม)
  └→ GET /api/keep-alive  (auth: CRON_SECRET — เหมือนเดิม)
       ├→ ping system_config (keep-alive เดิม ไม่แตะ)
       └→ fire-and-forget: POST {SUPABASE_URL}/functions/v1/check-make-quota
            (Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY — verify_jwt ปกติ)

Edge Function check-make-quota (Deno — เข้าถึง _shared/notify ได้)
  1. อ่าน MAKE_API_TOKEN + MAKE_ORG_ID (ไม่ตั้ง → ข้ามเงียบ เหมือน MAKE_WEBHOOK_URL pattern)
  2. GET /organizations/{id}          → lastReset, license
  3. GET /organizations/{id}/usage    → daily rows
  4. used = Σ operations (date >= lastReset), limit = license.operations ?? 1000
  5. currentTier = used/limit ≥95% → 95 | ≥80% → 80 | ไม่ถึง → 0
  6. เทียบ system_config.make_quota_last_tier:
       currentTier > last → UPDATE last_tier ก่อน แล้วค่อย notifyAndLog(make_quota_warning, admin)
                            (state-first: ถ้า UPDATE พังต้องไม่แจ้ง — กัน spam ทุก 3 วัน)
       currentTier < last → UPDATE last_tier (รอบบิลใหม่ auto-reset)
       เท่ากัน → เงียบ
  7. logIntegration(service:"make_com", payload:{kind:"quota_check", used, limit})
     ทั้ง success และ failed (Rule 5)
```

**เหตุผลที่ logic อยู่ใน Edge Function ไม่ใช่ Next.js route:** notify registry (`_shared/notify.ts`) เป็นโค้ด Deno ที่ Next.js import ไม่ได้ — ถ้าทำใน route ต้อง duplicate logic แจ้งเตือน (ผิด DRY + ข้าม template override ของ admin) และ `MAKE_API_TOKEN` ได้อยู่ใน Supabase Edge Function Secrets ตาม Rule 7 พอดี

**Dedupe แบบ stateful (`make_quota_last_tier`):** เตือนเฉพาะตอน "ข้ามขึ้น" tier (0→80, 80→95, 0→95) — ไม่ยิงซ้ำทุก 3 วัน และเมื่อ Make reset รอบใหม่ usage ตกลง → tier ตก → state กลับ 0 เองโดยไม่ต้องรู้วันที่รอบบิล ตาราง `system_config` เขียนได้เฉพาะ service_role (migration 023) ซึ่ง Edge Function ใช้อยู่แล้ว

## Event `make_quota_warning`

เพิ่ม 4 จุดใน `notify.ts` (เหมือน `calendar_sync_failed`): `EventKey` union, `EVENT_DEFAULTS`, `EVENT_KEYS`, `DISCORD_MESSAGE_TEMPLATES`

- ตัวแปร: `{used}`, `{limit}`, `{percent}`
- title: `⚠️ โควตา Make.com ใกล้เต็ม`
- body: `เดือนนี้ใช้ไปแล้ว {used}/{limit} operations ({percent}%) เมื่อครบโควตาการซิงก์ปฏิทินจะหยุดจนถึงรอบถัดไป`
- Discord: `⚠️ Make.com quota: {used}/{limit} ({percent}%)`
- link: `/dashboard/integrations`
- ผู้รับ: admin (`system_config.admin_id`) — in-app เสมอ + Discord ตาม toggle
- โผล่ในหน้า settings "ตั้งค่ารายเหตุการณ์" อัตโนมัติ (EVENT_KEYS เป็น source of truth)

## Error Handling

| กรณี | พฤติกรรม |
|---|---|
| `MAKE_API_TOKEN`/`MAKE_ORG_ID` ไม่ตั้ง | ข้ามเงียบ (console.log) — สวิตช์เปิดใช้งาน ไม่ log ไม่แจ้ง |
| Make API พัง / ตอบไม่ใช่ 2xx | log `make_com` failed (`kind:"quota_check"`) — **ไม่แจ้ง admin** (การเช็คพลาดรอบเดียวไม่วิกฤต รอบหน้าอีก 3 วัน; ถ้าพังถาวรเห็นการ์ดแดงใน Integration Health) |
| `license.operations` อ่านไม่ได้ | fallback `limit = 1000` (Free Plan ตาม CLAUDE.md) |
| อ่าน/เขียน `make_quota_last_tier` พัง | log failed, จบ — ห้ามยิงเตือนโดยไม่อัปเดต state ได้สำเร็จ (กัน spam) → ลำดับคือ UPDATE state ก่อน แล้วค่อย notify |
| ฟังก์ชันโดยรวม | never-throw ต่อ caller (keep-alive fire-and-forget อยู่แล้ว) — ห่อ `withErrorHandling()` ตาม Rule 1 |

**หมายเหตุการ์ด Integration Health:** quota_check log ใต้ service `make_com` รวมกับ webhook calls (~10 ครั้ง/เดือน) — ยอมรับได้ แยกดูได้จาก `payload.kind`

## จุดเชื่อมกับโค้ดเดิม

- `app/api/keep-alive/route.ts` — เพิ่มบล็อก fire-and-forget POST ไป `check-make-quota` (ไม่รอผล ไม่กระทบผล keep-alive)
- `supabase/functions/check-make-quota/index.ts` — ใหม่ (ห่อ `withErrorHandling`)
- `supabase/functions/_shared/makeQuota.ts` — ใหม่: pure logic (`sumUsageSinceReset`, `resolveLimit`, `tierFor`, `decideAction(lastTier, currentTier)`) + orchestrator — testable แยกจาก transport ตาม pattern `makeComClient.ts`
- `supabase/migrations/024_make_quota_state.sql` — เพิ่มคอลัมน์ (additive, ไม่ DROP — Rule 8)
- Deploy: function ใหม่ 1 ตัว + functions เดิมที่ import `notify.ts` ไม่ต้อง redeploy (ไม่ได้แก้ contract เดิม แต่แก้ `notify.ts` เพิ่ม event → ต้อง redeploy ทุกตัวที่ import notify ตามบทเรียน shared-file: `approve-booking`, `decide-cancellation`, `direct-cancel-booking`, `request-cancellation`, `create-booking`, `line-webhook`)

## Testing

- `makeQuota.test.ts`: `sumUsageSinceReset` (ตัดวันก่อน lastReset, ว่าง, ข้ามเดือน) / `resolveLimit` (มี license, ไม่มี → 1000) / `tierFor` (79→0, 80→80, 94→80, 95→95, 100→95) / `decideAction` (0→80 แจ้ง, 80→80 เงียบ, 80→95 แจ้ง, 95→0 reset ไม่แจ้ง, 0→95 แจ้งครั้งเดียว)
- orchestrator ผ่าน mock client + injected fetch: แจ้งแล้วอัปเดต state, state พัง → ไม่แจ้ง, secrets ไม่ตั้ง → เงียบ
- `notify.test.ts`: `make_quota_warning` registry + Discord template render (pattern เดิม)
- Live: ตั้ง secrets → เรียก function ตรง → ดู log + (จำลอง tier ด้วยการ set last_tier ใน DB)
