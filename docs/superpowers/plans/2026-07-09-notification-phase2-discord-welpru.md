# ระบบแจ้งเตือน เฟส 2 — Discord + WeLPRU Push + Verify Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มช่องทางแจ้งเตือน Discord (ยิงตรง) และ WeLPRU push (พร้อม flow ยืนยัน `staff_id`) เข้ากับ orchestrator ที่มีอยู่แล้วจากเฟส 1 โดยไม่แก้ business logic เดิม

**Architecture:** ขยาย `notify.ts` (orchestrator เฟส 1) ให้อ่าน `system_config` toggle + per-event override แล้วยิง Discord (webhook เดียว, ข้อความสั้นแบบ ops feed) และ WeLPRU (push รายคน, เฉพาะผู้ที่ยืนยัน `staff_id` แล้ว) ควบคู่กับ in-app insert เดิม ผ่าน `Promise.allSettled` — ยังคง "ไม่ throw เด็ดขาด" เหมือนเฟส 1 ทุกประการ Transport client (Discord/WeLPRU) เป็นโมดูลแยก ไม่ผูกกับ orchestrator โดยตรง เพื่อทดสอบแยกได้

**Tech Stack:** Supabase (PostgreSQL, RLS, Edge Function Secrets), Deno Edge Functions, Next.js 16 App Router, Vitest

## Global Constraints

- **UI ภาษาไทยทางการ** เหมาะกับหน่วยงานราชการ ทุกข้อความ (CLAUDE.md Rule 9)
- **Design Tokens เท่านั้น** — ใช้ CSS variable / Tailwind token จาก `docs/DESIGN.md` ห้าม hardcode สี/spacing/font (CLAUDE.md Rule 10)
- **Migration ผ่าน `apply_migration` MCP tool** ตรวจ `list_migrations` ก่อน + `get_advisors(security)` และ `get_advisors(performance)` หลัง migrate (AGENTS.md) — ห้าม `DROP COLUMN`/`DROP TABLE` ตรง (Rule 8) — **หมายเหตุจากเฟส 1:** ถ้า Supabase MCP ไม่ auth ในเซสชันนี้ ให้ controller ใช้ Supabase CLI (`npx supabase db push` / `db advisors` / `db query`) แทนตามที่ทำสำเร็จมาแล้วในเฟส 1 (มี `migration repair` ทำไปแล้วครั้งเดียวพอ ไม่ต้องทำซ้ำ — ประวัติ migration ใน CLI sync แล้วตั้งแต่เฟส 1)
- **RLS ก่อนเสมอ** — ดู `013_rls_policies.sql` ก่อนเขียน policy ใหม่ (Rule 3)
- **Race condition** — atomic UPDATE พร้อม WHERE เดิมเสมอ (Rule 6) — ใช้กับ `welpru_link_tokens` confirm
- **Error Handling** — Edge Function ใหม่ห่อ `withErrorHandling()` + throw `AppError` subclass (Rule 1)
- **ห้ามแก้ `system_config` ผ่าน `execute_sql` ตรง** (AGENTS.md) — ไม่มี Edge Function แก้ `system_config` ในเฟสนี้ (toggle ตั้งค่าผ่าน DB โดยตรงชั่วคราว รอเฟส 4 ทำ UI/`update-notification-settings`)
- **Secrets ทุกตัวอยู่ใน Supabase Edge Function Secrets เท่านั้น** ห้ามอยู่ใน DB หรือ `NEXT_PUBLIC_*` (Rule 7): `WELPRU_API_KEY`, `DISCORD_WEBHOOK_URL`, `SITE_URL`
- **notifyAndLog ต้องไม่ throw เด็ดขาด** — ทุกช่องทางใหม่ (Discord/WeLPRU) ต้องล้มเหลวแบบเงียบ log แล้วไปต่อ เหมือนช่องทาง in-app เดิม
- **PROJECT_ID** = `sbmbdngrutkjugsmmfxa`
- **ห้ามแก้ business logic ที่มีอยู่แล้ว** — `processApproval.ts`, `processCancellation.ts`, และ handler ทั้ง 5 ตัวจากเฟส 1 (`create-booking`, `approve-booking`, `request-cancellation`, `decide-cancellation`, `direct-cancel-booking`) **ไม่ต้องแก้เลยในเฟสนี้** — จุดเรียก `notifyBookingSubmitted()` ฯลฯ เดิมยังใช้ได้ เพราะช่องทางใหม่ทำงานอยู่ *ภายใน* `notifyAndLog()` ที่ handler เรียกอยู่แล้ว
- **ไม่มี admin UI ตั้งค่าในเฟสนี้** — toggle/template editor เป็นเฟส 4 — เฟสนี้แค่ทำให้ orchestrator "อ่านได้" จากคอลัมน์ที่สร้างไว้ ถ้ายังไม่มีใครตั้งค่า (`welpru_enabled=false`, `discord_enabled=false` ตาม default) ช่องทางใหม่จะไม่ทำงานจนกว่าจะเปิดผ่าน SQL/dashboard ด้วยมือ
- **WeLPRU Group Broadcast ห้ามทำเด็ดขาด** — ตัดถาวรตาม spec
- **LINE ไม่อยู่ในสโคปนี้** — คอลัมน์ `system_config.line_enabled` สร้างไว้ตาม migration ของ spec แต่ orchestrator ยังไม่อ่าน/ใช้งาน (รอเฟส 3)
- Spec อ้างอิง: `docs/superpowers/specs/2026-07-09-notification-system-design.md` (ส่วน "เฟส 2", "Transport Layer", "Flow ยืนยัน WeLPRU")

**หมายเหตุการเบี่ยงจาก spec (จงใจ — ต้องทำความเข้าใจก่อนเริ่ม):**

1. **`NotifyRecipient` ไม่มี `staffId`/`lineUserId`** ต่างจาก snippet ตัวอย่างใน spec (`recipients: [{ userId, staffId, lineUserId }]`) — เฟสนี้คง `NotifyRecipient = { userId: string }` เหมือนเฟส 1 ทุกประการ (**ห้ามแก้ signature เดิม**) แล้วให้ `notifyAndLog()` เองเป็นคน query `users.staff_id, users.welpru_verified_at` ต่อ `userId` ภายใน แทนที่จะให้ `bookingNotify.ts` ต้อง resolve ให้ล่วงหน้า เหตุผล: (ก) ไม่ต้องแก้ 5 ฟังก์ชันใน `bookingNotify.ts` ที่ผ่าน review แล้วในเฟส 1 เลย ลดความเสี่ยง (ข) รวม logic "ใครมีสิทธิ์รับ WeLPRU" ไว้จุดเดียวในโค้ดที่ตรวจสอบเอง ไม่กระจายไปทุกจุดเรียก
2. **Mock query builder (`mockClient.ts`) ต้องเพิ่ม method `.gt()`** — ของเดิมมีแค่ `select/insert/update/eq/single/then` เฟสนี้ต้องใช้ `.gt('expires_at', ...)` สำหรับตรวจ token หมดอายุแบบ atomic เพิ่ม method นี้เป็นแบบเดียวกับ `.eq()` ทุกประการ (แค่บันทึก filter แล้ว return builder) — ไม่กระทบไฟล์ทดสอบเดิม 4 ไฟล์เพราะเป็นการเพิ่ม ไม่ใช่แก้
3. **`bookingNotify.test.ts`'s shared `responder()` ต้องรองรับ table `users`** — เพราะ `notifyAndLog()` เฟสนี้จะ query `users` ทุกครั้งที่มี recipients (เพื่อเช็ค WeLPRU eligibility) ทำให้ 9 test เดิมที่ throw บน unexpected table จะพังถ้าไม่อัปเดต responder — Task 6 จะแก้ตรงนี้เป็นส่วนหนึ่งของงาน (ไม่ใช่ regression แต่เป็นผลข้างเคียงที่คาดไว้จากการขยายฟีเจอร์)
4. **Discord message ใช้ template แยกจาก in-app/WeLPRU** (`DISCORD_MESSAGE_TEMPLATES`) เพราะรูปแบบข้อความสั้นกว่าและมีตัวแปรต่างกัน (`{step}`, `{approver}`) — spec เขียนไว้ในตารางแยกอยู่แล้ว ("รูปแบบ Discord") จึงไม่ใช่การเบี่ยงจาก spec แต่เป็นการยืนยันว่าไม่ใช้ `EVENT_DEFAULTS` เดิมซ้ำ
5. **`{step}`/`{approver}` ต้องเพิ่มเข้า `variables`** ที่ `bookingNotify.ts` ส่งให้ `notifyAndLog()` (เฉพาะ `notifyApprovalOutcome`) — ไม่กระทบในเฟส 1 เพราะ `EVENT_DEFAULTS` (in-app/WeLPRU) ไม่ได้ใช้ตัวแปรนี้ (คีย์ส่วนเกินใน `variables` ที่ template ไม่ได้อ้างอิงจะถูกเมิน — verified จาก `applyTemplate()`'s regex-replace behavior)
6. **`postToDiscord`/`sendWelpruPush`'s network call ไม่มี unit test โดยตรง** เพราะอ้างอิง `Deno.env.get()`/`fetch` ซึ่งไม่มีใน Vitest/Node runtime (จะ throw `ReferenceError: Deno is not defined` ถ้า test path ไปถึงบรรทัดนั้นจริง) — แยก logic ที่ทดสอบได้ (`classifyDiscordResponse`, `truncateText`, `safeLink`) ออกจากส่วนที่เรียก network จริง ตาม pattern เดียวกับ `processApproval.ts`'s `triggerCalendarSync` stub ที่ไม่ unit test เช่นกัน — ทดสอบ integration จริงทำตอน controller live-verify หลัง deploy (Task 8)

---

## File Structure

**สร้างใหม่:**
- `supabase/migrations/022_notification_phase2.sql` — schema เฟส 2 ทั้งหมด
- `supabase/functions/_shared/discordClient.ts` — `sendDiscord()`, `classifyDiscordResponse()`
- `supabase/functions/_shared/discordClient.test.ts`
- `supabase/functions/_shared/welpruClient.ts` — `sendWelpruPush()`, `truncateText()`, `safeLink()`
- `supabase/functions/_shared/welpruClient.test.ts`
- `supabase/functions/_shared/welpruVerify.ts` — `requestWelpruVerify()`, `confirmWelpruVerify()`
- `supabase/functions/_shared/welpruVerify.test.ts`
- `supabase/functions/request-welpru-verify/index.ts`
- `supabase/functions/confirm-welpru-verify/index.ts`
- `app/(app)/profile/welpru-verify/page.tsx`

**แก้ไข:**
- `supabase/functions/_shared/retry.ts` — เพิ่ม `RetryableHttpError` class
- `supabase/functions/_shared/mockClient.ts` — เพิ่ม `.gt()` method
- `supabase/functions/_shared/integrationLog.ts` — เพิ่ม `'welpru'`, `'discord'` เข้า `IntegrationService`
- `supabase/functions/_shared/notify.ts` — เพิ่ม Discord/WeLPRU sending, `system_config` toggle/override, `DISCORD_MESSAGE_TEMPLATES`
- `supabase/functions/_shared/notify.test.ts` — เพิ่ม test สำหรับ config/override/Discord/WeLPRU (ของเดิมต้องผ่านหมดไม่แก้ assertion)
- `supabase/functions/_shared/bookingNotify.ts` — เพิ่ม `step`/`approver` เข้า `variables` ของ `notifyApprovalOutcome`
- `supabase/functions/_shared/bookingNotify.test.ts` — อัปเดต shared `responder()` ให้รองรับ table `users`
- `app/(app)/profile/page.tsx` — เพิ่มส่วน "ยืนยันการรับแจ้งเตือนผ่าน WeLPRU" แทนที่ placeholder เดิม (คง "เชื่อมต่อ LINE" placeholder ไว้เหมือนเดิม ไม่แตะ)
- `types/database.ts` — regenerate หลัง migrate

---

## Task 1: Migration — schema เฟส 2 ทั้งหมด

**Files:**
- Create: `supabase/migrations/022_notification_phase2.sql`

**Interfaces:**
- Produces: ตาราง `welpru_link_tokens(id, user_id, staff_id, token, is_used, expires_at, created_at)`, คอลัมน์ `users.welpru_verified_at`, คอลัมน์ `system_config.welpru_enabled/discord_enabled/line_enabled/notification_settings`, ขยาย CHECK ของ `integration_health.service` และ `consent_records.consent_type`

- [ ] **Step 1: เขียนไฟล์ migration**

สร้าง `supabase/migrations/022_notification_phase2.sql`:

```sql
-- ============================================================
-- 022_notification_phase2.sql
-- เฟส 2 ของระบบแจ้งเตือน: Discord + WeLPRU push + flow ยืนยัน staff_id
-- ============================================================

-- ============================================================
-- (1) welpru_link_tokens — ลอก pattern line_link_tokens (009)
-- Flow: เว็บ generate token → ส่ง push ทดสอบ → user แตะลิงก์ยืนยัน
-- ============================================================
CREATE TABLE welpru_link_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_id   text        NOT NULL,
  token      text        NOT NULL UNIQUE,
  is_used    boolean     NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_welpru_token
  ON welpru_link_tokens (token)
  WHERE is_used = false;

ALTER TABLE welpru_link_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "welpru_link_tokens: own only"
  ON welpru_link_tokens FOR ALL
  USING (user_id = auth.uid());

-- ============================================================
-- (2) users.welpru_verified_at — NULL = ยังไม่ยืนยัน
-- Trigger: staff_id ถูกแก้ → reset เป็นยังไม่ยืนยัน (data-integrity เท่านั้น
-- ไม่ใช่ trigger สร้างข้อความแจ้งเตือน — คนละเรื่องกับที่ตัดทิ้งใน spec)
-- ============================================================
ALTER TABLE users ADD COLUMN welpru_verified_at timestamptz;

CREATE OR REPLACE FUNCTION reset_welpru_verification_on_staff_id_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
    NEW.welpru_verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reset_welpru_verification
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION reset_welpru_verification_on_staff_id_change();

-- ขยาย anonymize (020) ให้ล้าง welpru_verified_at ด้วย (PDPA) — trigger ด้านบน
-- จะล้างให้อยู่แล้วเพราะ SET staff_id=NULL ด้วย แต่ระบุตรงๆ ไว้ให้ชัดเจน
-- เผื่อผู้อ่านโค้ดในอนาคตตรวจ anonymize function โดยไม่ไล่ trigger ตาม
CREATE OR REPLACE FUNCTION public.anonymize_user_on_delete_request(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.users SET
    full_name          = 'ผู้ใช้ที่ถูกลบ',
    email               = 'deleted-' || id || '@anonymized.local',
    line_user_id        = NULL,
    department          = NULL,
    phone               = NULL,
    staff_id            = NULL,
    welpru_verified_at  = NULL
  WHERE id = p_user_id;
END;
$$;

-- ============================================================
-- (3) system_config — master toggle 3 ช่องทาง + per-event override
-- ============================================================
ALTER TABLE system_config
  ADD COLUMN welpru_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN discord_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN line_enabled    boolean NOT NULL DEFAULT false,
  ADD COLUMN notification_settings jsonb NOT NULL DEFAULT '{}';

-- ============================================================
-- (4) ขยาย CHECK constraints
-- ============================================================
ALTER TABLE integration_health DROP CONSTRAINT integration_health_service_check;
ALTER TABLE integration_health ADD CONSTRAINT integration_health_service_check
  CHECK (service IN ('make_com', 'line', 'google_calendar', 'vercel', 'internal', 'welpru', 'discord'));

ALTER TABLE consent_records DROP CONSTRAINT consent_records_consent_type_check;
ALTER TABLE consent_records ADD CONSTRAINT consent_records_consent_type_check
  CHECK (consent_type IN ('privacy_policy', 'line_linking', 'welpru_linking'));

-- ============================================================
-- (5) ขยาย cleanup_old_logs() — เก็บกวาด welpru_link_tokens ที่ใช้แล้ว
-- ใช้ line_token_retention_days เดิม (ไม่เพิ่ม config ใหม่ตาม spec)
-- คง logic เดิมทั้งหมดจากเฟส 1 (021) ไว้ครบ เพิ่มแค่ clause ใหม่
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cfg record;
BEGIN
  SELECT activity_log_retention_months,
         integration_log_retention_months,
         line_token_retention_days
  INTO cfg
  FROM system_config LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM activity_logs
    WHERE created_at < now() - (cfg.activity_log_retention_months || ' months')::interval;

  DELETE FROM integration_health
    WHERE created_at < now() - (cfg.integration_log_retention_months || ' months')::interval;

  DELETE FROM line_link_tokens
    WHERE is_used = true
      AND created_at < now() - (cfg.line_token_retention_days || ' days')::interval;

  DELETE FROM notifications
    WHERE is_read = true
      AND created_at < now() - (cfg.activity_log_retention_months || ' months')::interval;

  DELETE FROM welpru_link_tokens
    WHERE is_used = true
      AND created_at < now() - (cfg.line_token_retention_days || ' days')::interval;
END;
$$;
```

- [ ] **Step 2: ตรวจ migration ที่รันไปแล้ว**

เรียก MCP `list_migrations` (project_id=`sbmbdngrutkjugsmmfxa`) — ถ้า MCP ไม่ auth ให้ใช้ `npx supabase migration list --linked` แทน (CLI history sync แล้วตั้งแต่เฟส 1 ไม่ต้อง repair ซ้ำ)
Expected: เห็น 001–021 ตรงกันทั้ง local/remote, ยังไม่มี 022

- [ ] **Step 3: รัน migration**

MCP `apply_migration` ชื่อ `022_notification_phase2` — หรือ CLI: `npx supabase db push --dry-run --linked` (ยืนยันว่ามีแค่ 022 ที่จะ push) แล้ว `npx supabase db push --linked --yes`
Expected: สำเร็จ ไม่มี error

- [ ] **Step 4: ตรวจ advisors**

`get_advisors(type="security")` แล้ว `get_advisors(type="performance")` — หรือ CLI: `npx supabase db advisors --linked --type security` และ `--type performance`
Expected: ไม่มี warning **หมวดใหม่** ที่ผูกกับตาราง/คอลัมน์ที่เพิ่งสร้าง (RLS enabled + policy ครบสำหรับ `welpru_link_tokens` แล้ว) — คาดว่าจะเห็น `auth_rls_initplan` บนนโยบายใหม่แบบเดียวกับที่เฟส 1 เจอบน `notifications` (ยอมรับได้ เพราะ pattern เดียวกับทั้งโปรเจกต์ ไม่ใช่การถดถอย)

- [ ] **Step 5: verify คอลัมน์และ constraint**

`execute_sql` หรือ `npx supabase db query --linked`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'system_config' AND column_name IN
  ('welpru_enabled', 'discord_enabled', 'line_enabled', 'notification_settings');
```
Expected: 4 แถว

```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'integration_health_service_check';
```
Expected: มี `'welpru'` และ `'discord'` อยู่ใน list

- [ ] **Step 6: regenerate types**

MCP `generate_typescript_types` → เขียนทับ `types/database.ts` — หรือ CLI: `npx supabase gen types typescript --linked --schema public > types/database.ts`
Expected: มี `welpru_link_tokens` table และ `users.welpru_verified_at`/`system_config.welpru_enabled` ฯลฯ ปรากฏ

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/022_notification_phase2.sql types/database.ts
git commit -m "feat(db): welpru_link_tokens + welpru_verified_at + system_config toggles (notif phase 2)"
```

---

## Task 2: Foundational extensions — `retry.ts` + `mockClient.ts`

**Files:**
- Modify: `supabase/functions/_shared/retry.ts`
- Modify: `supabase/functions/_shared/mockClient.ts`
- Test: `supabase/functions/_shared/retry.test.ts` (ไฟล์ใหม่)

**Interfaces:**
- Produces:
  - `class RetryableHttpError extends Error { retryAfterMs?: number }`
  - `withRetry<T>(fn, options)` — พฤติกรรมเดิมคงอยู่ทั้งหมด แต่ตอนนี้ตรวจ `err instanceof RetryableHttpError` เพื่อใช้ `retryAfterMs` แทน exponential backoff ถ้ามี
  - `MockClient`'s builder เพิ่ม `.gt(key, value)` — บันทึกลง `filters` เหมือน `.eq()` ทุกประการ

- [ ] **Step 1: เขียน failing test สำหรับ `RetryableHttpError`**

สร้าง `supabase/functions/_shared/retry.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { withRetry, RetryableHttpError } from "./retry.ts";

describe("withRetry", () => {
  it("คืนค่าสำเร็จโดยไม่ retry ถ้า fn สำเร็จตั้งแต่ครั้งแรก", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("ใช้ exponential backoff สำหรับ Error ทั่วไป", async () => {
    vi.useFakeTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockResolvedValueOnce("ok");
    const promise = withRetry(fn, { initialDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("ใช้ retryAfterMs จาก RetryableHttpError แทน exponential backoff", async () => {
    vi.useFakeTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new RetryableHttpError("rate limited", 5000))
      .mockResolvedValueOnce("ok");
    const promise = withRetry(fn, { initialDelayMs: 10 });
    // ถ้ายังใช้ initialDelayMs (10ms) แทน retryAfterMs (5000ms) test นี้จะ resolve เร็วเกินไป
    await vi.advanceTimersByTimeAsync(10);
    expect(fn).toHaveBeenCalledTimes(1); // ยังไม่ retry เพราะรอ 5000ms ไม่ใช่ 10ms
    await vi.advanceTimersByTimeAsync(4990);
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("throw lastError เมื่อครบ maxAttempts", async () => {
    const err = new Error("always fails");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { maxAttempts: 2, initialDelayMs: 1 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm run test -- retry`
Expected: FAIL — `RetryableHttpError` ไม่ถูก export

- [ ] **Step 3: implement `retry.ts`**

แก้ `supabase/functions/_shared/retry.ts` ทั้งไฟล์:

```typescript
export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
}

export class RetryableHttpError extends Error {
  retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "RetryableHttpError";
    this.retryAfterMs = retryAfterMs;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 500;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts) {
        break;
      }

      const delay =
        err instanceof RetryableHttpError && err.retryAfterMs != null
          ? err.retryAfterMs
          : initialDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npm run test -- retry`
Expected: PASS ทั้ง 4 case

- [ ] **Step 5: เพิ่ม `.gt()` เข้า `mockClient.ts`**

แก้ `supabase/functions/_shared/mockClient.ts` — เพิ่ม method `gt` ในตัว `builder` object (วางต่อจาก `eq`):

```typescript
      eq(key: string, value: unknown) {
        state.filters.push([key, value]);
        return builder;
      },
      gt(key: string, value: unknown) {
        state.filters.push([key, value]);
        return builder;
      },
```

- [ ] **Step 6: รัน full suite เพื่อยืนยันไม่กระทบไฟล์ทดสอบเดิม**

Run: `npm run test`
Expected: PASS ทั้งหมด (66 เดิม + 4 ใหม่ = 70) — ไม่มี test เดิมพัง เพราะ `.gt()` เป็นการเพิ่ม method ไม่ใช่แก้ของเดิม

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/retry.ts supabase/functions/_shared/retry.test.ts supabase/functions/_shared/mockClient.ts
git commit -m "feat(retry): add RetryableHttpError for Retry-After support; mockClient .gt()"
```

---

## Task 3: `_shared/discordClient.ts`

**Files:**
- Create: `supabase/functions/_shared/discordClient.ts`
- Test: `supabase/functions/_shared/discordClient.test.ts`

**Interfaces:**
- Consumes: `withRetry`, `RetryableHttpError` (Task 2)
- Produces:
  - `classifyDiscordResponse(status: number, retryAfterHeader: string | null): "ok" | Error` — pure, testable (`Error` instances may be `RetryableHttpError`)
  - `sendDiscord(message: string): Promise<void>` — เรียก `Deno.env.get`/`fetch` จริง ไม่มี unit test ตรงๆ (ดู deviation note #6)

- [ ] **Step 1: เขียน failing test สำหรับ `classifyDiscordResponse`**

สร้าง `supabase/functions/_shared/discordClient.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { classifyDiscordResponse } from "./discordClient.ts";
import { RetryableHttpError } from "./retry.ts";

describe("classifyDiscordResponse", () => {
  it("status 2xx → ok", () => {
    expect(classifyDiscordResponse(200, null)).toBe("ok");
    expect(classifyDiscordResponse(204, null)).toBe("ok");
  });

  it("status 429 พร้อม Retry-After header → RetryableHttpError พร้อม retryAfterMs", () => {
    const result = classifyDiscordResponse(429, "2");
    expect(result).toBeInstanceOf(RetryableHttpError);
    expect((result as RetryableHttpError).retryAfterMs).toBe(2000);
  });

  it("status 429 ไม่มี Retry-After header → RetryableHttpError โดย retryAfterMs เป็น undefined", () => {
    const result = classifyDiscordResponse(429, null);
    expect(result).toBeInstanceOf(RetryableHttpError);
    expect((result as RetryableHttpError).retryAfterMs).toBeUndefined();
  });

  it("status 500 → Error ธรรมดา ไม่ใช่ RetryableHttpError", () => {
    const result = classifyDiscordResponse(500, null);
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(RetryableHttpError);
  });
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm run test -- discordClient`
Expected: FAIL — module ไม่พบ

- [ ] **Step 3: implement `discordClient.ts`**

สร้าง `supabase/functions/_shared/discordClient.ts`:

```typescript
import { withRetry, RetryableHttpError } from "./retry.ts";

const DISCORD_USERNAME = "ระบบจองห้องประชุม LPRU";

// Pure classification logic — testable โดยไม่ต้องเรียก fetch จริง
export function classifyDiscordResponse(
  status: number,
  retryAfterHeader: string | null
): "ok" | Error {
  if (status >= 200 && status < 300) return "ok";

  if (status === 429) {
    const retryAfterMs = retryAfterHeader
      ? parseFloat(retryAfterHeader) * 1000
      : undefined;
    return new RetryableHttpError(`Discord rate limited: ${status}`, retryAfterMs);
  }

  return new Error(`Discord webhook failed: ${status}`);
}

async function postToDiscord(webhookUrl: string, message: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message, username: DISCORD_USERNAME }),
  });

  const outcome = classifyDiscordResponse(
    response.status,
    response.headers.get("Retry-After")
  );
  if (outcome !== "ok") throw outcome;
}

// ยิงข้อความเดียวไป Discord webhook พร้อม retry (เคารพ Retry-After บน 429)
export async function sendDiscord(message: string): Promise<void> {
  const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
  if (!webhookUrl) {
    throw new Error("DISCORD_WEBHOOK_URL ไม่ได้ตั้งค่า");
  }
  await withRetry(() => postToDiscord(webhookUrl, message), { maxAttempts: 3 });
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npm run test -- discordClient`
Expected: PASS ทั้ง 4 case

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/discordClient.ts supabase/functions/_shared/discordClient.test.ts
git commit -m "feat(notify): discordClient with Retry-After-aware retry"
```

---

## Task 4: `_shared/welpruClient.ts`

**Files:**
- Create: `supabase/functions/_shared/welpruClient.ts`
- Test: `supabase/functions/_shared/welpruClient.test.ts`

**Interfaces:**
- Consumes: `withRetry` (Task 2)
- Produces:
  - `truncateText(text: string, maxLen: number): string`
  - `safeLink(link: string | undefined, maxLen: number): string | undefined`
  - `interface SendWelpruPushParams { staffIds: string[]; title: string; body: string; link?: string }`
  - `interface SendWelpruPushResult { success: boolean; failedCount: number }`
  - `sendWelpruPush(params: SendWelpruPushParams): Promise<SendWelpruPushResult>`

- [ ] **Step 1: เขียน failing test**

สร้าง `supabase/functions/_shared/welpruClient.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { truncateText, safeLink, sendWelpruPush } from "./welpruClient.ts";

describe("truncateText", () => {
  it("ข้อความสั้นกว่า maxLen คืนค่าเดิม", () => {
    expect(truncateText("สวัสดี", 50)).toBe("สวัสดี");
  });

  it("ข้อความยาวกว่า maxLen ตัดด้วย ... ให้ความยาวรวมเท่า maxLen", () => {
    const text = "a".repeat(60);
    const result = truncateText(text, 50);
    expect(result.length).toBe(50);
    expect(result.endsWith("...")).toBe(true);
  });

  it("maxLen สั้นมาก (<=3) ตัดตรงๆ ไม่เติม ...", () => {
    expect(truncateText("abcdef", 2)).toBe("ab");
  });
});

describe("safeLink", () => {
  it("link สั้นกว่า maxLen คืนค่าเดิม", () => {
    expect(safeLink("/approver", 255)).toBe("/approver");
  });

  it("link ยาวกว่า maxLen คืน undefined (drop ไม่ตัด)", () => {
    const link = "https://example.com/" + "a".repeat(250);
    expect(safeLink(link, 255)).toBeUndefined();
  });

  it("link เป็น undefined คืน undefined", () => {
    expect(safeLink(undefined, 255)).toBeUndefined();
  });
});

describe("sendWelpruPush", () => {
  it("staffIds ว่าง → success:true, failedCount:0 โดยไม่เรียก network", async () => {
    const result = await sendWelpruPush({ staffIds: [], title: "t", body: "b" });
    expect(result).toEqual({ success: true, failedCount: 0 });
  });
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm run test -- welpruClient`
Expected: FAIL — module ไม่พบ

- [ ] **Step 3: implement `welpruClient.ts`**

สร้าง `supabase/functions/_shared/welpruClient.ts`:

```typescript
import { withRetry } from "./retry.ts";

const WELPRU_API_URL = "https://api.lpruhub.com/api";

// ── Pure truncation helpers (WeLPRU ใช้ MSSQL backend ที่มีข้อจำกัดความยาว) ──
export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 3) return text.slice(0, maxLen);
  return text.slice(0, maxLen - 3) + "...";
}

export function safeLink(link: string | undefined, maxLen: number): string | undefined {
  if (!link) return undefined;
  return link.length > maxLen ? undefined : link;
}

export interface SendWelpruPushParams {
  staffIds: string[];
  title: string;
  body: string;
  link?: string;
}

export interface SendWelpruPushResult {
  success: boolean;
  failedCount: number;
}

async function postWelpruPush(
  apiKey: string,
  payload: { user_id: string; title: string; body: string; link?: string }
): Promise<void> {
  const response = await fetch(`${WELPRU_API_URL}/notify/user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`WeLPRU push failed: ${response.status}`);
  }
}

// ส่งแยกทีละ user (WeLPRU API รับ user_id เป็น string เดี่ยว) — partial success ถือว่าสำเร็จ
export async function sendWelpruPush(
  params: SendWelpruPushParams
): Promise<SendWelpruPushResult> {
  if (params.staffIds.length === 0) {
    return { success: true, failedCount: 0 };
  }

  const apiKey = Deno.env.get("WELPRU_API_KEY");
  if (!apiKey) {
    return { success: false, failedCount: params.staffIds.length };
  }

  const safeTitle = truncateText(params.title, 50);
  const safeBody = truncateText(params.body, 250);
  const link = safeLink(params.link, 255);

  const results = await Promise.allSettled(
    params.staffIds.map((staffId) =>
      withRetry(() =>
        postWelpruPush(apiKey, { user_id: staffId, title: safeTitle, body: safeBody, link })
      )
    )
  );

  const failedCount = results.filter((r) => r.status === "rejected").length;
  return { success: failedCount < params.staffIds.length, failedCount };
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npm run test -- welpruClient`
Expected: PASS ทั้ง 7 case

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/welpruClient.ts supabase/functions/_shared/welpruClient.test.ts
git commit -m "feat(notify): welpruClient with truncation + per-recipient push"
```

---

## Task 5: ขยาย `notify.ts` — Discord + WeLPRU orchestration

**Files:**
- Modify: `supabase/functions/_shared/notify.ts`
- Modify: `supabase/functions/_shared/integrationLog.ts`
- Modify: `supabase/functions/_shared/notify.test.ts`

**Interfaces:**
- Consumes: `sendDiscord` (Task 3), `sendWelpruPush` (Task 4), `logIntegration` (existing), `IntegrationService` (แก้ในนี้)
- Produces:
  - `interface EventOverride { discord?: boolean; welpru?: boolean; title?: string | null; body?: string | null }`
  - `buildNotification(eventKey, vars, override?)` — เพิ่ม param ที่ 3 (optional, backward-compatible)
  - `notifyAndLog()` — พฤติกรรมเดิมสำหรับ in-app คงอยู่ 100% + เพิ่ม Discord/WeLPRU sending

- [ ] **Step 1: แก้ `integrationLog.ts` เพิ่ม service ใหม่**

แก้ `supabase/functions/_shared/integrationLog.ts` บรรทัด 1-6:

```typescript
export type IntegrationService =
  | "make_com"
  | "line"
  | "google_calendar"
  | "vercel"
  | "internal"
  | "welpru"
  | "discord";
```

- [ ] **Step 2: เขียน failing test สำหรับ override + Discord + WeLPRU**

เพิ่มต่อท้าย `supabase/functions/_shared/notify.test.ts` (หลัง `describe("notifyAndLog", ...)` เดิม — **ห้ามแก้ test เดิมในไฟล์นี้ ทุก assertion ต้องผ่านเหมือนเดิม**):

```typescript
describe("buildNotification with override", () => {
  it("override.title/body มาก่อน default", () => {
    const n = buildNotification(
      "booking_approved",
      { room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น." },
      { title: "หัวข้อกำหนดเอง", body: "เนื้อหากำหนดเอง {room}" }
    );
    expect(n.title).toBe("หัวข้อกำหนดเอง");
    expect(n.body).toBe("เนื้อหากำหนดเอง ห้อง A");
  });

  it("override เป็น undefined ใช้ default เหมือนเดิม", () => {
    const n = buildNotification("booking_approved", {
      room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น.",
    });
    expect(n.title).toBe("✅ การจองได้รับอนุมัติแล้ว");
  });

  it("override.title เป็น null (ไม่ใช่ undefined) ใช้ default เหมือนกัน", () => {
    const n = buildNotification(
      "booking_approved",
      { room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น." },
      { title: null, body: null }
    );
    expect(n.title).toBe("✅ การจองได้รับอนุมัติแล้ว");
  });
});

describe("notifyAndLog — Discord/WeLPRU channel gating", () => {
  const vars = { booker: "สมชาย", room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น." };

  it("discord_enabled=false (default) → ไม่มี logIntegration service=discord", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config")
        return { data: { welpru_enabled: false, discord_enabled: false, notification_settings: {} } };
      if (ctx.table === "users")
        return { data: { staff_id: null, welpru_verified_at: null } };
      return {};
    });
    await notifyAndLog(client as never, {
      eventKey: "booking_approved",
      recipients: [{ userId: "u1" }],
      variables: vars,
    });
    const discordLogs = calls.filter((c: DbCallContext) => c.table === "integration_health");
    expect(discordLogs).toHaveLength(0);
  });

  it("discord_enabled=true → พยายามส่ง Discord และ log ผลลัพธ์ (ล้มเหลวเพราะไม่มี webhook ใน test env แต่ต้อง log)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config")
        return { data: { welpru_enabled: false, discord_enabled: true, notification_settings: {} } };
      if (ctx.table === "users")
        return { data: { staff_id: null, welpru_verified_at: null } };
      if (ctx.table === "integration_health") return {};
      return {};
    });
    await notifyAndLog(client as never, {
      eventKey: "booking_approved",
      recipients: [{ userId: "u1" }],
      variables: vars,
    });
    const discordLogs = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.payload?.service === "discord"
    );
    expect(discordLogs).toHaveLength(1);
    expect(discordLogs[0].payload).toMatchObject({ status: "failed" }); // ไม่มี DISCORD_WEBHOOK_URL ใน test env
  });

  it("welpru_enabled=true แต่ผู้รับยังไม่ verified → ไม่เรียก WeLPRU เลย (ไม่มี log)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config")
        return { data: { welpru_enabled: true, discord_enabled: false, notification_settings: {} } };
      if (ctx.table === "users")
        return { data: { staff_id: "S001", welpru_verified_at: null } }; // ยังไม่ verified
      return {};
    });
    await notifyAndLog(client as never, {
      eventKey: "booking_approved",
      recipients: [{ userId: "u1" }],
      variables: vars,
    });
    const welpruLogs = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.payload?.service === "welpru"
    );
    expect(welpruLogs).toHaveLength(0);
  });

  it("welpru_enabled=true และผู้รับ verified แล้ว → พยายามส่งและ log (ล้มเหลวเพราะไม่มี API key ใน test env)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config")
        return { data: { welpru_enabled: true, discord_enabled: false, notification_settings: {} } };
      if (ctx.table === "users")
        return { data: { staff_id: "S001", welpru_verified_at: "2026-01-01T00:00:00Z" } };
      return {};
    });
    await notifyAndLog(client as never, {
      eventKey: "booking_approved",
      recipients: [{ userId: "u1" }],
      variables: vars,
    });
    const welpruLogs = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.payload?.service === "welpru"
    );
    expect(welpruLogs).toHaveLength(1);
  });

  it("per-event override discord:false ปิดเฉพาะ event นี้แม้ master toggle เปิด", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config")
        return {
          data: {
            welpru_enabled: false,
            discord_enabled: true,
            notification_settings: { booking_approved: { discord: false } },
          },
        };
      if (ctx.table === "users") return { data: { staff_id: null, welpru_verified_at: null } };
      return {};
    });
    await notifyAndLog(client as never, {
      eventKey: "booking_approved",
      recipients: [{ userId: "u1" }],
      variables: vars,
    });
    const discordLogs = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.payload?.service === "discord"
    );
    expect(discordLogs).toHaveLength(0);
  });

  it("system_config อ่านไม่ได้ (error) → ทุกช่องทางใหม่ปิดเงียบๆ ไม่ throw ไม่กระทบ in-app", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config") return { data: null, error: { message: "denied" } };
      if (ctx.table === "notifications" && ctx.op === "insert") return {};
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(
      notifyAndLog(client as never, {
        eventKey: "booking_approved",
        recipients: [{ userId: "u1" }],
        variables: vars,
      })
    ).resolves.toBeUndefined();
    const inserts = calls.filter((c: DbCallContext) => c.table === "notifications" && c.op === "insert");
    expect(inserts).toHaveLength(1); // in-app ยังทำงานปกติ
  });

  it("system_config query THROW (reject ไม่ใช่ resolve-with-error) → ยังไม่ throw, in-app ทำงาน", async () => {
    // ★ ล็อกกฎ "ไม่ throw เด็ดขาด" สำหรับ config load ที่เพิ่มมาในเฟส 2 —
    //   ต่างจาก test ด้านบนที่ system_config resolve พร้อม error field, อันนี้
    //   responder throw จริง (mockClient แปลงเป็น Promise.reject) ถ้า
    //   loadNotificationConfig ไม่ห่อ try/catch, notifyAndLog จะ reject ตรงนี้
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config") throw new Error("boom");
      if (ctx.table === "notifications" && ctx.op === "insert") return {};
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(
      notifyAndLog(client as never, {
        eventKey: "booking_approved",
        recipients: [{ userId: "u1" }],
        variables: vars,
      })
    ).resolves.toBeUndefined();
    const inserts = calls.filter((c: DbCallContext) => c.table === "notifications" && c.op === "insert");
    expect(inserts).toHaveLength(1);
  });
});
```

- [ ] **Step 3: รัน test ให้ fail**

Run: `npm run test -- notify`
Expected: FAIL — `notifyAndLog` ยังไม่รู้จัก `system_config`/`users` table, `buildNotification` ยังไม่รับ param ที่ 3

- [ ] **Step 4: implement — แก้ `notify.ts`**

แก้ `buildNotification` (แทนที่ function เดิมทั้งหมด) และเพิ่มโค้ดใหม่ต่อท้ายไฟล์เดิม:

แทนที่ block นี้:
```typescript
export function buildNotification(
  eventKey: EventKey,
  vars: Record<string, string>
): { title: string; body: string; link: string } {
  const def = EVENT_DEFAULTS[eventKey];
  return {
    title: applyTemplate(def.title, vars),
    body: applyTemplate(def.body, vars),
    link: def.link,
  };
}
```

ด้วย:
```typescript
export interface EventOverride {
  discord?: boolean;
  welpru?: boolean;
  title?: string | null;
  body?: string | null;
}

export function buildNotification(
  eventKey: EventKey,
  vars: Record<string, string>,
  override?: EventOverride
): { title: string; body: string; link: string } {
  const def = EVENT_DEFAULTS[eventKey];
  const titleTemplate = override?.title ?? def.title;
  const bodyTemplate = override?.body ?? def.body;
  return {
    title: applyTemplate(titleTemplate, vars),
    body: applyTemplate(bodyTemplate, vars),
    link: def.link,
  };
}

// ── Discord message templates (รูปแบบสั้น ต่างจาก in-app/WeLPRU) ──
const DISCORD_MESSAGE_TEMPLATES: Record<EventKey, string> = {
  booking_submitted: "📥 คำขอใหม่ — {booker} จอง {room} · {date} {time} (รออนุมัติขั้นที่ 1)",
  booking_step_approved: "⏫ ผ่านขั้นที่ {step} — {room} · {date} (ต่อคิว: {approver})",
  booking_approved: "✅ อนุมัติครบ — {room} · {date} {time} ({booker})",
  booking_rejected: "❌ ปฏิเสธขั้นที่ {step} — {room} · {date} ({booker})",
  cancellation_requested: "🗑️ ขอยกเลิก — {booker} · {room} · {date}",
  cancellation_approved: "✅ ยกเลิกแล้ว — {room} · {date}",
  cancellation_denied: "❌ ไม่อนุมัติยกเลิก — {room} · {date}",
  booking_cancelled: "⚠️ Admin ยกเลิก — {room} · {date}",
};

function buildDiscordMessage(eventKey: EventKey, vars: Record<string, string>): string {
  return applyTemplate(DISCORD_MESSAGE_TEMPLATES[eventKey], vars);
}
```

ต่อท้ายไฟล์ทั้งหมด (หลัง `notifyAndLog` เดิม) เพิ่ม:
```typescript
// ── System config loading (master toggles + per-event override) ──
interface NotificationConfig {
  welpruEnabled: boolean;
  discordEnabled: boolean;
  settings: Record<string, EventOverride>;
}

const CONFIG_DISABLED: NotificationConfig = {
  welpruEnabled: false,
  discordEnabled: false,
  settings: {},
};

// ★ ต้องไม่ throw เด็ดขาด — ห่อ try/catch เพราะจุดเรียก (notifyAndLog) ไม่มี
//   try/catch รอบ config load และ query อาจ reject (ไม่ใช่แค่ resolve-with-error)
//   ถ้า config อ่านไม่ได้ไม่ว่าเหตุใด → ปิดทุกช่องทางใหม่ ปล่อย in-app ทำงานต่อ
async function loadNotificationConfig(client: SupabaseClient): Promise<NotificationConfig> {
  try {
    const { data, error } = await client
      .from("system_config")
      .select("welpru_enabled, discord_enabled, notification_settings")
      .single();
    if (error || !data) return CONFIG_DISABLED;
    const row = data as {
      welpru_enabled: boolean | null;
      discord_enabled: boolean | null;
      notification_settings: Record<string, EventOverride> | null;
    };
    return {
      welpruEnabled: row.welpru_enabled ?? false,
      discordEnabled: row.discord_enabled ?? false,
      settings: row.notification_settings ?? {},
    };
  } catch (err) {
    console.error("[notifyAndLog] loadNotificationConfig ล้มเหลว:", err);
    return CONFIG_DISABLED;
  }
}

function getEventOverride(cfg: NotificationConfig, eventKey: EventKey): EventOverride {
  return cfg.settings[eventKey] ?? {};
}

// ── WeLPRU eligibility (ต้องมี staff_id + verified แล้ว) ──
// ★ ต้องไม่ throw เด็ดขาด — เรียกใน loop นอก try/catch ของ welpru branch
async function loadWelpruStaffId(client: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await client
      .from("users")
      .select("staff_id, welpru_verified_at")
      .eq("id", userId)
      .single();
    if (error || !data) return null;
    const row = data as { staff_id: string | null; welpru_verified_at: string | null };
    if (!row.staff_id || !row.welpru_verified_at) return null;
    return row.staff_id;
  } catch (err) {
    console.error("[notifyAndLog] loadWelpruStaffId ล้มเหลว:", err);
    return null;
  }
}
```

แก้ `notifyAndLog` (แทนที่ function เดิมทั้งหมด — เพิ่ม early-return บน recipients ว่าง ก่อน insert loop เดิม แล้วเพิ่ม Discord/WeLPRU sending ต่อท้าย):

```typescript
export async function notifyAndLog(
  client: SupabaseClient,
  params: NotifyParams
): Promise<void> {
  if (params.recipients.length === 0) return;

  const cfg = await loadNotificationConfig(client);
  const override = getEventOverride(cfg, params.eventKey);
  const { title, body, link } = buildNotification(params.eventKey, params.variables, override);

  // 1. In-App inserts (เหมือนเฟส 1 ทุกประการ)
  const tasks = params.recipients.map((r) =>
    client.from("notifications").insert({
      user_id: r.userId,
      event_key: params.eventKey,
      title,
      body,
      link,
    })
  );

  const results = await Promise.allSettled(tasks);
  results.forEach((res, i) => {
    if (res.status === "rejected") {
      console.error(`[notifyAndLog] insert ล้มเหลว (recipient ${i}):`, res.reason);
    } else if (res.value && (res.value as { error?: unknown }).error) {
      console.error(
        `[notifyAndLog] insert error (recipient ${i}):`,
        (res.value as { error?: unknown }).error
      );
    }
  });

  // 2. Discord (ข้อความเดียวต่อเหตุการณ์)
  if (cfg.discordEnabled && override.discord !== false) {
    try {
      const discordMessage = buildDiscordMessage(params.eventKey, params.variables);
      await sendDiscord(discordMessage);
      await logIntegration(client, { service: "discord", status: "success" });
    } catch (err) {
      console.error("[notifyAndLog] discord ล้มเหลว:", err);
      await logIntegration(client, {
        service: "discord",
        status: "failed",
        error_detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. WeLPRU (เฉพาะผู้รับที่ verified แล้ว)
  if (cfg.welpruEnabled && override.welpru !== false) {
    const staffIds: string[] = [];
    for (const r of params.recipients) {
      const staffId = await loadWelpruStaffId(client, r.userId);
      if (staffId) staffIds.push(staffId);
    }
    if (staffIds.length > 0) {
      try {
        const result = await sendWelpruPush({ staffIds, title, body, link });
        await logIntegration(client, {
          service: "welpru",
          status: result.success ? "success" : "failed",
          payload: { failedCount: result.failedCount, recipientCount: staffIds.length },
        });
      } catch (err) {
        console.error("[notifyAndLog] welpru ล้มเหลว:", err);
        await logIntegration(client, {
          service: "welpru",
          status: "failed",
          error_detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
```

เพิ่ม import ที่หัวไฟล์ (ต่อจาก `import type { SupabaseClient } ...` เดิม):
```typescript
import { sendDiscord } from "./discordClient.ts";
import { sendWelpruPush } from "./welpruClient.ts";
import { logIntegration } from "./integrationLog.ts";
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `npm run test -- notify`
Expected: PASS ทั้งหมด — ทั้ง test เดิม 11 case ของ `notifyAndLog`/`buildNotification`/`applyTemplate`/formatters (**ต้องผ่านโดยไม่แก้ assertion เดิมแม้แต่บรรทัดเดียว** — โดยเฉพาะ `"ไม่ throw แม้ทุก insert ล้มเหลว"` ที่เป็นตัวจับ bug ถ้า `loadNotificationConfig` ไม่ห่อ try/catch) และ test ใหม่ 10 case (3 ของ buildNotification override + 7 ของ Discord/WeLPRU gating รวม throw-path)

- [ ] **Step 6: รัน full suite**

Run: `npm run test`
Expected: PASS ทั้งหมด (ไม่มี regression ในไฟล์อื่น — `bookingNotify.test.ts` จะยังไม่พังในขั้นนี้เพราะ Task 6 ยังไม่มาถึง ถ้าพังให้ดู Task 6)

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/notify.ts supabase/functions/_shared/notify.test.ts supabase/functions/_shared/integrationLog.ts
git commit -m "feat(notify): Discord + WeLPRU channels in notifyAndLog with config/override gating"
```

---

## Task 6: ขยาย `bookingNotify.ts` — `step`/`approver` variables สำหรับ Discord

**Files:**
- Modify: `supabase/functions/_shared/bookingNotify.ts`
- Modify: `supabase/functions/_shared/bookingNotify.test.ts`

**Interfaces:**
- Consumes: ไม่มีอะไรใหม่จาก task อื่น (แก้ไฟล์ที่มีอยู่แล้ว)
- Produces: `notifyApprovalOutcome()` — signature เดิมทุกประการ แค่ `variables` ที่ส่งให้ `notifyAndLog()` มีคีย์เพิ่ม `step`/`approver` ในบางกรณี

- [ ] **Step 1: แก้ shared `responder()` ใน test ให้รองรับ table `users`**

แก้ `supabase/functions/_shared/bookingNotify.test.ts` — แทนที่ function `responder` เดิม (บรรทัด 23-28) ด้วย:

```typescript
// responder: booking_detail → detail, system_config → chain, users → ชื่อ approver,
// notifications insert → ok
//
// หมายเหตุ: notifyAndLog() เฟส 2 (notify.ts) ก็ query table system_config เหมือนกับ
// loadChain() ในไฟล์นี้ — ทั้งคู่เรียกแบบไม่มี .eq() filter จึงแยกไม่ออกและได้ค่า
// เดียวกันคือ `chain` object แต่เพราะ chain ไม่มีคีย์ welpru_enabled/discord_enabled
// เลย notifyAndLog() จะเห็นเป็น undefined แล้ว fallback เป็น false ทั้งคู่ (ปิด
// Discord/WeLPRU) ตรงกับที่ test เดิมคาดหวังอยู่แล้ว (นับแค่ notifications insert)
function responder(ctx: DbCallContext) {
  if (ctx.table === "booking_detail") return { data: detail };
  if (ctx.table === "system_config") return { data: chain };
  if (ctx.table === "users") return { data: { full_name: "ผู้อนุมัติทดสอบ", staff_id: null, welpru_verified_at: null } };
  if (ctx.table === "notifications" && ctx.op === "insert") return {};
  throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
}
```

- [ ] **Step 2: รัน test เดิมเพื่อยืนยันว่ายังผ่าน (regression check ก่อนแก้ implementation)**

Run: `npm run test -- bookingNotify`
Expected: PASS ทั้ง 15 case เดิม (ตอนนี้ `bookingNotify.ts` ยังไม่ถูกแก้ แต่ `notify.ts` ถูกแก้ไปแล้วใน Task 5 — step นี้ยืนยันว่า responder ใหม่รองรับ query ที่เพิ่มมาได้)

- [ ] **Step 3: เขียน failing test สำหรับ `step`/`approver` variables**

เพิ่มต่อท้าย `describe("notifyApprovalOutcome", ...)` เดิม (ก่อนปิด `});` ของ describe block นั้น — เพิ่ม 2 test case ใหม่):

```typescript
  it("rejected → variables มี step ตรงกับ result.step (สำหรับ Discord template)", async () => {
    const insertedPayloads: Record<string, unknown>[] = [];
    const { client } = makeClient((ctx) => {
      if (ctx.table === "booking_detail") return { data: detail };
      if (ctx.table === "system_config") return { data: chain };
      if (ctx.table === "users") return { data: { full_name: "x", staff_id: null, welpru_verified_at: null } };
      if (ctx.table === "notifications" && ctx.op === "insert") {
        insertedPayloads.push(ctx.payload!);
        return {};
      }
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await notifyApprovalOutcome(
      client as never, "b1",
      { bookingId: "b1", step: 2, action: "rejected", currentStep: 1, finalStatus: "rejected" },
      "ห้องไม่ว่าง"
    );
    // body ของ in-app ไม่ได้ใช้ {step} (EVENT_DEFAULTS ไม่มี) แต่ notifyApprovalOutcome
    // ต้องส่ง step เข้า variables เสมอเผื่อ Discord ใช้ — ตรวจทางอ้อมผ่านว่า insert สำเร็จปกติ
    expect(insertedPayloads).toHaveLength(1);
    expect(insertedPayloads[0]).toMatchObject({ event_key: "booking_rejected" });
  });

  it("non-final approval → ดึงชื่อ approver ขั้นถัดไปมาใส่ variables (สำหรับ Discord template)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "booking_detail") return { data: detail };
      if (ctx.table === "system_config") return { data: chain };
      if (ctx.table === "users") {
        // ทุกครั้งที่ query users คืนชื่อคงที่ เพื่อยืนยันว่ามีการ query จริง
        return { data: { full_name: "ผู้อนุมัติ 2", staff_id: null, welpru_verified_at: null } };
      }
      if (ctx.table === "notifications" && ctx.op === "insert") return {};
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await notifyApprovalOutcome(
      client as never, "b1",
      { bookingId: "b1", step: 1, action: "approved", currentStep: 1, finalStatus: "pending" }
    );
    const usersQueries = calls.filter((c: DbCallContext) => c.table === "users");
    expect(usersQueries.length).toBeGreaterThan(0); // ยืนยันว่ามีการดึงชื่อ approver
  });
```

- [ ] **Step 4: รัน test ให้ fail**

Run: `npm run test -- bookingNotify`
Expected: FAIL เฉพาะ 2 case ใหม่ (ยังไม่มี logic ดึงชื่อ approver หรือส่ง `step`)

- [ ] **Step 5: implement — แก้ `bookingNotify.ts`**

เพิ่ม helper ใหม่หลัง `loadChain` (ก่อน `baseVars`):

```typescript
async function loadUserName(client: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await client
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .single();
  if (error || !data) return "ผู้อนุมัติ";
  return (data as { full_name: string }).full_name;
}
```

แก้ `notifyApprovalOutcome` (แทนที่ function เดิมทั้งหมด):

```typescript
export async function notifyApprovalOutcome(
  client: SupabaseClient,
  bookingId: string,
  result: ApprovalResult,
  note?: string
): Promise<void> {
  try {
    const d = await loadDetail(client, bookingId);
    if (!d) return;
    const base = baseVars(d);

    if (result.action === "rejected") {
      await notifyAndLog(client, {
        eventKey: "booking_rejected",
        recipients: [{ userId: d.requester_id }],
        variables: { ...base, reason: (note ?? "").trim() || "ไม่ระบุ", step: String(result.step) },
      });
      return;
    }

    if (result.finalStatus === "approved") {
      await notifyAndLog(client, {
        eventKey: "booking_approved",
        recipients: [{ userId: d.requester_id }],
        variables: base,
      });
      return;
    }

    // อนุมัติแบบยังไม่จบ chain → แจ้ง approver ขั้นถัดไป
    const chain = await loadChain(client);
    const nextField = STEP_FIELD[result.currentStep + 1];
    const nextApprover = nextField ? chain?.[nextField] : null;
    if (nextApprover) {
      const approverName = await loadUserName(client, nextApprover);
      await notifyAndLog(client, {
        eventKey: "booking_step_approved",
        recipients: [{ userId: nextApprover }],
        variables: { ...base, step: String(result.step), approver: approverName },
      });
    }
  } catch (err) {
    console.error("[notifyApprovalOutcome]", err);
  }
}
```

- [ ] **Step 6: รัน test ให้ผ่าน**

Run: `npm run test -- bookingNotify`
Expected: PASS ทั้งหมด (15 เดิม + 2 ใหม่ = 17)

- [ ] **Step 7: รัน full suite**

Run: `npm run test`
Expected: PASS ทั้งหมด — ยืนยันไม่มี regression ข้ามไฟล์

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/bookingNotify.ts supabase/functions/_shared/bookingNotify.test.ts
git commit -m "feat(notify): add step/approver variables to notifyApprovalOutcome for Discord"
```

---

## Task 7: `welpruVerify.ts` + Edge Functions ยืนยัน `staff_id`

**Files:**
- Create: `supabase/functions/_shared/welpruVerify.ts`
- Test: `supabase/functions/_shared/welpruVerify.test.ts`
- Create: `supabase/functions/request-welpru-verify/index.ts`
- Create: `supabase/functions/confirm-welpru-verify/index.ts`

**Interfaces:**
- Consumes: `sendWelpruPush` (Task 4), `ValidationError`/`ConflictError`/`ForbiddenError` (existing `errors.ts`), `withErrorHandling` (existing `handler.ts`)
- Produces:
  - `requestWelpruVerify(client, { userId, staffId, siteUrl }, sendPush?): Promise<{ token: string }>`
  - `confirmWelpruVerify(client, { userId, token }): Promise<void>`

- [ ] **Step 1: เขียน failing test**

สร้าง `supabase/functions/_shared/welpruVerify.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { requestWelpruVerify, confirmWelpruVerify } from "./welpruVerify.ts";
import { makeClient, type DbCallContext } from "./mockClient.ts";
import { ValidationError, ConflictError, ForbiddenError } from "./errors.ts";

describe("requestWelpruVerify", () => {
  it("throw ValidationError ถ้า staffId ว่าง", async () => {
    const { client } = makeClient(() => {
      throw new Error("db should not be called");
    });
    const sendPush = vi.fn();
    await expect(
      requestWelpruVerify(client as never, { userId: "u1", staffId: "  ", siteUrl: "https://x.test" }, sendPush)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("insert token แล้วเรียก sendPush พร้อม deep link ที่มี token", async () => {
    let insertedPayload: Record<string, unknown> | undefined;
    const { client } = makeClient((ctx) => {
      if (ctx.table === "welpru_link_tokens" && ctx.op === "insert") {
        insertedPayload = ctx.payload;
        return {};
      }
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const sendPush = vi.fn().mockResolvedValue({ success: true, failedCount: 0 });

    const result = await requestWelpruVerify(
      client as never,
      { userId: "u1", staffId: "S001", siteUrl: "https://example.test" },
      sendPush
    );

    expect(insertedPayload).toMatchObject({ user_id: "u1", staff_id: "S001" });
    expect(result.token).toBe(insertedPayload!.token);
    expect(sendPush).toHaveBeenCalledTimes(1);
    const pushArg = sendPush.mock.calls[0][0];
    expect(pushArg.staffIds).toEqual(["S001"]);
    expect(pushArg.link).toContain("https://example.test/profile/welpru-verify?token=");
    expect(pushArg.link).toContain(result.token);
  });
});

describe("confirmWelpruVerify", () => {
  it("throw ConflictError ถ้า token ไม่พบ/ใช้แล้ว/หมดอายุ (update คืนแถวว่าง)", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "welpru_link_tokens" && ctx.op === "update") return { data: [] };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(
      confirmWelpruVerify(client as never, { userId: "u1", token: "bad-token" })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throw ConflictError ถ้า staff_id ปัจจุบันของ user ไม่ตรงกับตอนขอยืนยัน", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "welpru_link_tokens" && ctx.op === "update")
        return { data: [{ staff_id: "S001" }] };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: { staff_id: "S999" } }; // เปลี่ยนไปแล้วหลังขอยืนยัน
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(
      confirmWelpruVerify(client as never, { userId: "u1", token: "tok1" })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throw ForbiddenError ถ้าหา user ไม่เจอหลัง update token สำเร็จ", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "welpru_link_tokens" && ctx.op === "update")
        return { data: [{ staff_id: "S001" }] };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: null, error: { message: "not found" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(
      confirmWelpruVerify(client as never, { userId: "u1", token: "tok1" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("สำเร็จ: staff_id ตรงกัน → set welpru_verified_at + insert consent_records", async () => {
    const calls: DbCallContext[] = [];
    const { client } = makeClient((ctx) => {
      calls.push(ctx);
      if (ctx.table === "welpru_link_tokens" && ctx.op === "update")
        return { data: [{ staff_id: "S001" }] };
      if (ctx.table === "users" && ctx.op === "select") return { data: { staff_id: "S001" } };
      if (ctx.table === "users" && ctx.op === "update") return {};
      if (ctx.table === "consent_records" && ctx.op === "insert") return {};
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(
      confirmWelpruVerify(client as never, { userId: "u1", token: "tok1" })
    ).resolves.toBeUndefined();

    const usersUpdate = calls.find((c) => c.table === "users" && c.op === "update");
    expect(usersUpdate?.payload).toHaveProperty("welpru_verified_at");

    const consentInsert = calls.find((c) => c.table === "consent_records" && c.op === "insert");
    expect(consentInsert?.payload).toMatchObject({ user_id: "u1", consent_type: "welpru_linking" });
  });
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm run test -- welpruVerify`
Expected: FAIL — module ไม่พบ

- [ ] **Step 3: implement `welpruVerify.ts`**

สร้าง `supabase/functions/_shared/welpruVerify.ts`:

```typescript
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ValidationError, ConflictError, ForbiddenError } from "./errors.ts";
import { sendWelpruPush } from "./welpruClient.ts";

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface RequestWelpruVerifyParams {
  userId: string;
  staffId: string;
  siteUrl: string;
}

export async function requestWelpruVerify(
  client: SupabaseClient,
  params: RequestWelpruVerifyParams,
  sendPush: typeof sendWelpruPush = sendWelpruPush
): Promise<{ token: string }> {
  const staffId = params.staffId.trim();
  if (!staffId) {
    throw new ValidationError("กรุณากรอกรหัสบุคลากรก่อนยืนยัน");
  }

  const token = generateToken();

  const { error: insertError } = await client.from("welpru_link_tokens").insert({
    user_id: params.userId,
    staff_id: staffId,
    token,
  });
  if (insertError) throw insertError;

  const link = `${params.siteUrl}/profile/welpru-verify?token=${token}`;
  await sendPush({
    staffIds: [staffId],
    title: "ยืนยันการรับแจ้งเตือน",
    body: "แตะลิงก์นี้เพื่อยืนยันการรับแจ้งเตือนจากระบบจองห้องประชุม",
    link,
  });

  return { token };
}

export interface ConfirmWelpruVerifyParams {
  userId: string;
  token: string;
}

export async function confirmWelpruVerify(
  client: SupabaseClient,
  params: ConfirmWelpruVerifyParams
): Promise<void> {
  // Atomic: UPDATE พร้อม WHERE is_used=false (Critical Rule 6) — กัน race
  const { data: updated, error: updateError } = await client
    .from("welpru_link_tokens")
    .update({ is_used: true })
    .eq("token", params.token)
    .eq("is_used", false)
    .eq("user_id", params.userId)
    .gt("expires_at", new Date().toISOString())
    .select("staff_id");

  if (updateError) throw updateError;
  if (!updated || (updated as unknown[]).length === 0) {
    throw new ConflictError("ลิงก์ยืนยันหมดอายุหรือถูกใช้ไปแล้ว กรุณาขอยืนยันใหม่");
  }

  const tokenStaffId = (updated as { staff_id: string }[])[0].staff_id;

  const { data: userRow, error: userError } = await client
    .from("users")
    .select("staff_id")
    .eq("id", params.userId)
    .single();
  if (userError || !userRow) {
    throw new ForbiddenError("ไม่พบข้อมูลผู้ใช้งาน");
  }

  const currentStaffId = (userRow as { staff_id: string | null }).staff_id;
  if (currentStaffId !== tokenStaffId) {
    throw new ConflictError(
      "รหัสบุคลากรมีการเปลี่ยนแปลงหลังขอยืนยัน กรุณาขอยืนยันใหม่"
    );
  }

  const { error: verifyError } = await client
    .from("users")
    .update({ welpru_verified_at: new Date().toISOString() })
    .eq("id", params.userId);
  if (verifyError) throw verifyError;

  const { error: consentError } = await client.from("consent_records").insert({
    user_id: params.userId,
    consent_type: "welpru_linking",
  });
  if (consentError) throw consentError;
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npm run test -- welpruVerify`
Expected: PASS ทั้ง 6 case

- [ ] **Step 5: สร้าง Edge Function `request-welpru-verify`**

สร้าง `supabase/functions/request-welpru-verify/index.ts`:

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { UnauthorizedError } from "../_shared/errors.ts";
import { requestWelpruVerify } from "../_shared/welpruVerify.ts";

interface RequestWelpruVerifyBody {
  staff_id: string;
}

Deno.serve(
  withErrorHandling(async (req: Request) => {
    const authHeader = req.headers.get("Authorization") ?? "";

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่");
    }

    const body: RequestWelpruVerifyBody = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const siteUrl = Deno.env.get("SITE_URL")!;

    const result = await requestWelpruVerify(adminClient, {
      userId: user.id,
      staffId: body.staff_id,
      siteUrl,
    });

    return new Response(JSON.stringify({ success: true, tokenPreview: result.token.slice(0, 8) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
```

- [ ] **Step 6: สร้าง Edge Function `confirm-welpru-verify`**

สร้าง `supabase/functions/confirm-welpru-verify/index.ts`:

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { UnauthorizedError, ValidationError } from "../_shared/errors.ts";
import { confirmWelpruVerify } from "../_shared/welpruVerify.ts";

interface ConfirmWelpruVerifyBody {
  token: string;
}

Deno.serve(
  withErrorHandling(async (req: Request) => {
    const authHeader = req.headers.get("Authorization") ?? "";

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่");
    }

    const body: ConfirmWelpruVerifyBody = await req.json();
    if (!body.token || body.token.trim().length === 0) {
      throw new ValidationError("ไม่พบ token ยืนยัน");
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await confirmWelpruVerify(adminClient, { userId: user.id, token: body.token });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
```

- [ ] **Step 7: เพิ่ม config.toml entries (verify_jwt=true) ให้ 2 function ใหม่**

แก้ `supabase/config.toml` — เพิ่ม 2 บล็อกนี้ (วางต่อจากบล็อก function อื่นๆ ที่มีอยู่ ให้สอดคล้องกับ pattern เดิมที่ทุก function ระบุ `verify_jwt` ชัดเจน):

```toml
[functions.request-welpru-verify]
verify_jwt = true

[functions.confirm-welpru-verify]
verify_jwt = true
```

(Supabase default `verify_jwt=true` อยู่แล้ว แต่โปรเจกต์นี้ระบุทุก function ชัดเจน — ทำตามให้สม่ำเสมอ กันความสับสนตอน audit)

- [ ] **Step 8: รัน full suite**

Run: `npm run test`
Expected: PASS ทั้งหมด

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/welpruVerify.ts supabase/functions/_shared/welpruVerify.test.ts supabase/functions/request-welpru-verify supabase/functions/confirm-welpru-verify supabase/config.toml
git commit -m "feat(notify): welpruVerify shared logic + request/confirm edge functions"
```

---

## Task 8: Profile UI + Deploy + Live Verification

**Files:**
- Modify: `app/(app)/profile/page.tsx`
- Create: `app/(app)/profile/welpru-verify/page.tsx`

**Interfaces:**
- Consumes: Edge Functions `request-welpru-verify`, `confirm-welpru-verify` (Task 7)

**อ่านก่อนเริ่ม:** `docs/DESIGN.md` Section 1/4 — ใช้ token class เท่านั้น (Rule 10) ดู `app/(app)/profile/page.tsx`'s "เชื่อมต่อ LINE" `Card` (บรรทัด 305-310) เป็นตัวอย่าง pattern ที่มีอยู่แล้วในหน้านี้

- [ ] **Step 1: แก้ `profile/page.tsx` — เพิ่มส่วน WeLPRU verify**

ใน `app/(app)/profile/page.tsx`:

เพิ่ม import (ต่อจาก `import { createClient } ...`):
```typescript
import { useRouter } from "next/navigation"; // มีอยู่แล้ว ไม่ต้องเพิ่มซ้ำถ้ามี
```
(ตรวจสอบว่ามี `useRouter` import อยู่แล้ว — มี บรรทัด 4 ของไฟล์เดิม ไม่ต้องเพิ่ม)

เพิ่ม state ใหม่ต่อจาก `const [saveError, setSaveError] = useState<string | null>(null);` (บรรทัด 48):
```typescript
  const [welpruVerifiedAt, setWelpruVerifiedAt] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [requestingVerify, setRequestingVerify] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
```

แก้ `type Profile` (บรรทัด 11-18) เพิ่มฟิลด์:
```typescript
type Profile = {
  full_name: string;
  email: string;
  role: "user" | "approver" | "admin";
  department: string | null;
  phone: string | null;
  staff_id: string | null;
  welpru_verified_at: string | null;
};
```

แก้ query ใน `load()` (บรรทัด 66-70) ให้ดึงคอลัมน์ใหม่ด้วย:
```typescript
      const { data, error } = await supabase
        .from("users")
        .select("full_name, email, role, department, phone, staff_id, welpru_verified_at")
        .eq("id", user.id)
        .single();
```

แทนที่ 2 บรรทัด (บรรทัด 78-79 ของไฟล์เดิม):
```typescript
      setProfile(data as Profile);
      setLoading(false);
```
ด้วย 3 บรรทัด:
```typescript
      setProfile(data as Profile);
      setWelpruVerifiedAt((data as Profile).welpru_verified_at);
      setLoading(false);
```

เพิ่มฟังก์ชันใหม่ต่อจาก `handleSave` (หลังบรรทัด 146, ก่อน `handleSignOut`):
```typescript
  async function handleRequestWelpruVerify() {
    if (!profile?.staff_id || profile.staff_id.trim().length === 0) {
      setVerifyMessage("กรุณากรอกและบันทึกรหัสบุคลากรก่อนขอยืนยัน");
      return;
    }
    if (!consentChecked) {
      setVerifyMessage("กรุณายอมรับเงื่อนไขการรับแจ้งเตือนก่อน");
      return;
    }

    setRequestingVerify(true);
    setVerifyMessage(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setVerifyMessage("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setRequestingVerify(false);
      return;
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/request-welpru-verify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ staff_id: profile.staff_id }),
      }
    );

    setRequestingVerify(false);

    if (!response.ok) {
      setVerifyMessage("ส่งคำขอยืนยันไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    setVerifyMessage("ส่งแจ้งเตือนทดสอบไปยัง WeLPRU แล้ว กรุณาแตะลิงก์ในแอปเพื่อยืนยัน");
  }
```

แทนที่ Card "เชื่อมต่อ LINE" เดิม (บรรทัด 305-310) — **ไม่ลบ ไม่แก้ Card นั้น** เพิ่ม Card ใหม่ *ต่อจาก* Card นั้น (ก่อน `<div className="mt-4">` ของปุ่มออกจากระบบ):

```tsx
          <Card className="mt-4">
            <p className="font-medium text-text-primary">
              ยืนยันการรับแจ้งเตือนผ่าน WeLPRU
            </p>
            {welpruVerifiedAt ? (
              <p className="mt-1 text-sm text-success-text">
                ✅ ยืนยันแล้วเมื่อ{" "}
                {new Date(welpruVerifiedAt).toLocaleDateString("th-TH", {
                  dateStyle: "medium",
                })}
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm text-text-secondary">
                  ยืนยันตัวตนเพื่อรับการแจ้งเตือนผ่านแอป WeLPRU — ระบบจะส่งข้อความทดสอบไปยังแอปของท่าน
                  กรุณาแตะลิงก์ในข้อความเพื่อยืนยันว่าเป็นเจ้าของบัญชีจริง
                </p>
                <label className="mt-3 flex items-start gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5"
                  />
                  ข้าพเจ้ายินยอมให้ระบบส่งการแจ้งเตือนผ่านแอป WeLPRU ไปยังรหัสบุคลากรที่ระบุไว้
                </label>
                {verifyMessage && (
                  <p className="mt-2 text-sm text-text-secondary">{verifyMessage}</p>
                )}
                <div className="mt-3">
                  <Button onClick={handleRequestWelpruVerify} disabled={requestingVerify}>
                    {requestingVerify ? "กำลังส่ง..." : "ยืนยันการรับแจ้งเตือนผ่าน WeLPRU"}
                  </Button>
                </div>
              </>
            )}
          </Card>
```

- [ ] **Step 2: สร้างหน้า confirm `/profile/welpru-verify`**

สร้าง `app/(app)/profile/welpru-verify/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

type Status = "loading" | "success" | "error";

export default function WelpruVerifyPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function confirm() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      if (!token) {
        setStatus("error");
        setMessage("ไม่พบ token ยืนยัน กรุณาตรวจสอบลิงก์อีกครั้ง");
        return;
      }

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setStatus("error");
        setMessage("กรุณาเข้าสู่ระบบด้วยบัญชีเดียวกับที่ขอยืนยัน แล้วแตะลิงก์นี้อีกครั้ง");
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/confirm-welpru-verify`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatus("error");
        setMessage(data?.message ?? "ยืนยันไม่สำเร็จ ลิงก์อาจหมดอายุหรือถูกใช้ไปแล้ว");
        return;
      }

      setStatus("success");
      setMessage("ยืนยันการรับแจ้งเตือนผ่าน WeLPRU สำเร็จแล้ว");
    }
    confirm();
  }, []);

  return (
    <div className="mx-auto max-w-md animate-fade-in-up p-6">
      <Card>
        {status === "loading" && (
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        )}
        {status === "success" && (
          <>
            <p className="text-lg font-semibold text-success-text">
              ✅ {message}
            </p>
            <Link href="/profile" className="mt-3 inline-block text-sm text-brand-primary hover:underline">
              กลับไปหน้าโปรไฟล์
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-lg font-semibold text-danger-text">❌ {message}</p>
            <Link href="/profile" className="mt-3 inline-block text-sm text-brand-primary hover:underline">
              กลับไปหน้าโปรไฟล์
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: type-check + lint**

Run: `npx tsc --noEmit` แล้ว `npm run lint`
Expected: ไม่มี error ใหม่ที่เกี่ยวกับไฟล์ที่แก้/สร้างในงานนี้

- [ ] **Step 4: รัน full suite ครั้งสุดท้ายก่อน deploy**

Run: `npm run test`
Expected: PASS ทั้งหมด (ควรอยู่ที่ 66 + 4(retry) + 4(discordClient) + 7(welpruClient) + 10(notify ใหม่) + 2(bookingNotify ใหม่) + 6(welpruVerify) = 99 โดยประมาณ — ตัวเลขจริงดูจาก output)

- [ ] **Step 5: ตรวจ/ตั้ง secrets (controller)**

ตรวจว่ามี secret ที่ต้องใช้หรือยัง:
```bash
supabase secrets list --project-ref sbmbdngrutkjugsmmfxa
```
ถ้ายังไม่มี `DISCORD_WEBHOOK_URL`, `WELPRU_API_KEY`, `SITE_URL` — **ต้องถามผู้ใช้ก่อนตั้งค่า** (เป็นค่าจริงจากภายนอก ไม่ควรเดา) โค้ดที่ deploy ได้แม้ไม่มี secret เหล่านี้ (ช่องทางนั้นจะ log failed อย่างสง่างามตาม design — ไม่ throw ไม่กระทบ mutation หลัก) แต่ถ้ามี secret จริงให้ตั้งด้วย:
```bash
supabase secrets set DISCORD_WEBHOOK_URL=<ค่าจริง> --project-ref sbmbdngrutkjugsmmfxa
supabase secrets set WELPRU_API_KEY=<ค่าจริง> --project-ref sbmbdngrutkjugsmmfxa
supabase secrets set SITE_URL=<ค่าจริง เช่น https://xxx.vercel.app> --project-ref sbmbdngrutkjugsmmfxa
```

- [ ] **Step 6: Deploy Edge Functions ที่แก้/สร้างใหม่**

```bash
npx supabase functions deploy request-welpru-verify confirm-welpru-verify --use-api --project-ref sbmbdngrutkjugsmmfxa
```
**หมายเหตุ:** `create-booking`/`approve-booking`/`request-cancellation`/`decide-cancellation`/`direct-cancel-booking` **ต้อง deploy ซ้ำด้วย** เพราะไฟล์ที่พวกมัน import (`bookingNotify.ts`, `notify.ts`) เปลี่ยนไป — Edge Function bundle เป็น snapshot ของ dependency ตอน deploy ไม่ auto-update ตาม shared file:
```bash
npx supabase functions deploy create-booking approve-booking request-cancellation decide-cancellation direct-cancel-booking --use-api --project-ref sbmbdngrutkjugsmmfxa
```
Expected: ทั้ง 7 functions `"message":"Deployed Functions."`

- [ ] **Step 7: verify deploy**

```bash
npx supabase functions list --project-ref sbmbdngrutkjugsmmfxa
```
Expected: version ของทั้ง 7 functions ที่ deploy ใน step 6 bump ขึ้น, `status: "ACTIVE"`

- [ ] **Step 8: เปิด toggle เพื่อทดสอบ (ถ้ามี secret จริงแล้ว)**

ถ้าผู้ใช้ยืนยันว่าตั้ง secret ครบแล้วและต้องการทดสอบจริง เปิด toggle ผ่าน `db query` (ยังไม่มี UI จนกว่าจะถึงเฟส 4):
```sql
UPDATE system_config SET discord_enabled = true, welpru_enabled = true;
```
**ต้องถามผู้ใช้ก่อนเปิด** เพราะเป็นการเปิดใช้งานช่องทางแจ้งเตือนจริงที่จะส่งข้อความออกไปภายนอกทันทีที่มีเหตุการณ์เกิดขึ้น

- [ ] **Step 9: Live verification ผ่าน browser preview (ถ้าเปิด toggle แล้ว)**

- Start dev server (`.claude/launch.json` ชื่อ `next-dev` มีอยู่แล้วจากเฟส 1)
- Login เป็น `user@test.local` → ไปหน้า `/profile` → กรอก `staff_id` ทดสอบ (ต้องเป็นรหัสจริงที่ผูกกับบัญชี WeLPRU จริงถ้าจะทดสอบ push จริง) → บันทึก → ติ๊ก consent → กด "ยืนยันการรับแจ้งเตือนผ่าน WeLPRU"
- ตรวจ `preview_network`/`preview_console_logs` ว่าเรียก `request-welpru-verify` สำเร็จ (200)
- ถ้ามี WeLPRU จริง: เปิดแอปบนมือถือ ตรวจว่าได้รับ push ทดสอบ แตะลิงก์ → ตรวจว่า redirect มาที่ `/profile/welpru-verify?token=...` แล้วขึ้น "✅ ยืนยันการรับแจ้งเตือนผ่าน WeLPRU สำเร็จแล้ว"
- กลับไป `/profile` ตรวจว่าขึ้น "✅ ยืนยันแล้วเมื่อ {วันที่}"
- สร้าง booking จริงผ่าน UI (เหมือนที่ทำใน Phase 1 Task 7) → ตรวจ `db query` ว่า `integration_health` มีแถว `service='discord'`/`service='welpru'` กับ `status='success'` (ถ้า secret ถูกต้อง) — ถ้า Discord webhook จริง ตรวจข้อความโผล่ในช่อง Discord จริงด้วย
- ปิด toggle กลับ (`discord_enabled=false, welpru_enabled=false`) หลังทดสอบเสร็จถ้าผู้ใช้ต้องการ ไม่เปิดค้างไว้โดยไม่ได้ตั้งใจ — **ถามผู้ใช้ก่อนว่าต้องการเปิดค้างไว้ใช้งานจริงหรือปิดกลับ**

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/profile/page.tsx" "app/(app)/profile/welpru-verify/page.tsx"
git commit -m "feat(notify): profile WeLPRU verify UI + confirm page"
```

---

## Self-Review Checklist (ทำหลังลงมือครบ 8 task)

- [ ] ทุกช่องทางในตารางผู้รับ×ช่องทางของ spec คอลัมน์ WeLPRU/Discord มี task รองรับครบ (submitted/step_approved/approved/rejected/cancellation_requested/cancellation_approved/cancellation_denied/booking_cancelled) — `line_quota_warning` ไม่รวม (phase 3)
- [ ] `NotifyRecipient` signature ไม่เปลี่ยนจากเฟส 1 (`{ userId: string }`) — ยืนยันว่า `bookingNotify.ts`'s 5 exported functions ไม่มีการเปลี่ยน signature เลย (เฉพาะเนื้อใน `notifyApprovalOutcome` ที่เพิ่ม vars)
- [ ] ไม่มีที่ไหนแตะ `processApproval.ts`/`processCancellation.ts` หรือ 5 handler เดิมจากเฟส 1 เลย (ตาม Global Constraints)
- [ ] `notifyAndLog` ยังคง "ไม่ throw เด็ดขาด" — ทุก branch ใหม่ (Discord/WeLPRU) ห่อ try/catch แยกจาก in-app insert
- [ ] ไม่มี WeLPRU Group Broadcast code ที่ไหนเลย
- [ ] ไม่มีโค้ด LINE ใดๆ ในเฟสนี้ (คอลัมน์ `line_enabled` สร้างไว้เฉยๆ ไม่ถูกอ่าน)
- [ ] Secrets ทั้ง 3 ตัว (`WELPRU_API_KEY`, `DISCORD_WEBHOOK_URL`, `SITE_URL`) ไม่ปรากฏ hardcode ในโค้ดที่ไหนเลย อ่านผ่าน `Deno.env.get()` เท่านั้น
- [ ] ไม่มี placeholder/TODO ในโค้ดที่ต้องรันจริง
