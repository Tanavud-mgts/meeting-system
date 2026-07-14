# ระบบแจ้งเตือน เฟส 4 — Admin Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้า Admin ที่ `/dashboard/settings` ตั้งค่าแจ้งเตือนผ่านเว็บได้ครบ — เปิด/ปิด 3 ช่องทาง (Discord/WeLPRU/LINE), เปิด/ปิดแต่ละช่องต่อ event, แก้ template (title/body) ต่อ event พร้อมตัวนับอักษร/reset/preview — แทนการ `UPDATE system_config` ด้วยมือ

**Architecture:** เฟสนี้ **ไม่แตะ orchestrator** — `notifyAndLog` อ่าน `system_config.notification_settings` + toggle อยู่แล้ว (เฟส 1-3) เฟสนี้เพิ่มแค่ (ก) Edge Function `update-notification-settings` เขียน `system_config` (ผ่าน service role ตาม AGENTS.md ห้าม execute_sql ตรง) ลอก pattern จาก `update-approval-chain`, (ข) UI ในหน้า settings เดิม, (ค) validator ที่ทดสอบได้ + event metadata ฝั่ง frontend

**Tech Stack:** Supabase Edge Functions (Deno), Next.js 16, Vitest, Tailwind (design tokens)

## Global Constraints

- **ห้ามแก้ `system_config` ผ่าน `execute_sql`/client ตรง** (AGENTS.md) — ต้องผ่าน Edge Function `update-notification-settings` (service role, admin-only) เท่านั้น
- **Rule 1:** Edge Function ห่อ `withErrorHandling()` + throw `AppError` subclass
- **Rule 9:** ข้อความ UI ภาษาไทยทางการ / **Rule 10:** UI ใช้ design token เท่านั้น (ห้าม hardcode hex/สี palette ดิบ/arbitrary `[...]`)
- **ไม่แตะ business logic เดิม:** `notify.ts` orchestrator, `update-approval-chain`, ส่วน Approval Chain/เวลาทำการ/วันหยุด ในหน้า settings เดิม **ไม่แก้** (เพิ่ม section ใหม่แยก + ปุ่มบันทึกแยก)
- **ไม่มี migration ใหม่** — `system_config.notification_settings` (jsonb) + `welpru_enabled`/`discord_enabled`/`line_enabled` มีครบตั้งแต่ migration 022
- **Secret ห้ามอยู่ในหน้านี้** (Rule 7) — settings หน้านี้แก้ได้แค่ toggle + template (ไม่ใช่ secret) ส่วน webhook URL/API key ยังตั้งผ่าน `supabase secrets set` เท่านั้น
- **notification_settings shape** (ตาม spec แม่, ที่ orchestrator อ่านอยู่): ต่อ event `{ discord?: boolean; welpru?: boolean; line?: boolean; title?: string | null; body?: string | null }` — `!== false` = ส่ง, `title ?? default` = ใช้ default ในโค้ด
- **9 event keys** ตรงกับ `EventKey` ใน `notify.ts`: `booking_submitted`, `booking_step_approved`, `booking_approved`, `booking_rejected`, `cancellation_requested`, `cancellation_approved`, `cancellation_denied`, `booking_cancelled`, `line_quota_warning`
- **PROJECT_ID** = `sbmbdngrutkjugsmmfxa`
- Spec: `docs/superpowers/specs/2026-07-09-notification-system-design.md` (ส่วน "หน้า Admin ตั้งค่า")

**หมายเหตุการออกแบบที่ล็อก (ยืนยันกับผู้ใช้: ขอบเขต A เต็มตาม spec):**

1. **จัดเก็บแบบ minimal-diff:** UI ส่ง `notification_settings` ที่เก็บเฉพาะค่าที่ต่างจาก default — ช่องที่ปิดเก็บ `{channel: false}`, title/body ที่แก้เองเก็บเป็น string, ที่เหลือ omit (absent = ใช้ default) — event ที่เป็น default ล้วน omit ทั้ง key ทำให้ JSONB สะอาดและ orchestrator อ่านถูกต้อง (absent → ส่ง/ใช้ default)
2. **แสดง channel toggle เฉพาะช่องที่ event นั้นใช้จริง** (ตาม recipient matrix) ไม่โชว์ toggle ที่เป็น no-op — เช่น `booking_approved` ไม่มีปุ่ม LINE (ไปหาผู้จอง ไม่มี Flex), `line_quota_warning` มีแค่ Discord
3. **template editor แก้ title/body** (มีผลกับ in-app + WeLPRU + LINE altText) — **Discord ใช้ template ในโค้ด แก้ผ่าน UI ไม่ได้** (spec แม่ notification_settings ไม่มี Discord template) ตัดออกจากสโคป
4. **event metadata (label/ช่องที่ใช้/ค่า default title-body) ฝั่ง frontend เป็นสำเนาคุมมือ** ใน `lib/notifications/eventMeta.ts` — ค่า default title/body ต้อง**ตรงกับ `EVENT_DEFAULTS` ใน `notify.ts`** (source of truth คือ notify.ts; frontend มีสำเนาเพราะข้าม runtime Deno↔Node ไม่ได้) มีคอมเมนต์เตือน sync + test ตรวจว่า key ครบ 9

---

## File Structure

**สร้างใหม่:**
- `supabase/functions/_shared/notificationSettings.ts` — `validateNotificationSettings()` (pure, testable) + types
- `supabase/functions/_shared/notificationSettings.test.ts`
- `supabase/functions/update-notification-settings/index.ts` — edge function (verify_jwt=true, admin-only)
- `lib/notifications/eventMeta.ts` — frontend event metadata + `applyTemplate` + preview vars
- `lib/notifications/eventMeta.test.ts`

**แก้ไข:**
- `supabase/functions/_shared/notify.ts` — export `EVENT_KEYS` array (สำหรับ validator)
- `supabase/config.toml` — 1 entry (`update-notification-settings` verify_jwt=true)
- `app/(app)/dashboard/settings/page.tsx` — เพิ่ม 2 Card (master toggle + per-event) + save handler แยก (ไม่แตะ Approval Chain/เวลา/วันหยุด เดิม)

---

## Task 1: `notificationSettings.ts` validator + export `EVENT_KEYS`

**Files:**
- Modify: `supabase/functions/_shared/notify.ts`
- Create: `supabase/functions/_shared/notificationSettings.ts`
- Test: `supabase/functions/_shared/notificationSettings.test.ts`

**Interfaces:**
- Produces:
  - `notify.ts`: `export const EVENT_KEYS: EventKey[]` (ทั้ง 9 ตามลำดับใน union)
  - `notificationSettings.ts`:
    - `export interface EventSetting { discord?: boolean; welpru?: boolean; line?: boolean; title?: string | null; body?: string | null }`
    - `export type NotificationSettings = Record<string, EventSetting>`
    - `export const MAX_TITLE = 200; export const MAX_BODY = 1000;`
    - `export function validateNotificationSettings(input: unknown): { ok: true; value: NotificationSettings } | { ok: false; error: string }`

- [ ] **Step 1: export `EVENT_KEYS` จาก `notify.ts`**

เพิ่มต่อจาก `EVENT_DEFAULTS` (หลัง object ปิด) ใน `supabase/functions/_shared/notify.ts`:

```typescript
// รายชื่อ event keys ทั้งหมด (source of truth สำหรับ validator/UI) — ต้องครบตาม EventKey
export const EVENT_KEYS: EventKey[] = [
  "booking_submitted",
  "booking_step_approved",
  "booking_approved",
  "booking_rejected",
  "cancellation_requested",
  "cancellation_approved",
  "cancellation_denied",
  "booking_cancelled",
  "line_quota_warning",
];
```

- [ ] **Step 2: เขียน failing test**

สร้าง `supabase/functions/_shared/notificationSettings.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateNotificationSettings, MAX_TITLE, MAX_BODY } from "./notificationSettings.ts";

describe("validateNotificationSettings", () => {
  it("object ว่าง → ok", () => {
    expect(validateNotificationSettings({})).toEqual({ ok: true, value: {} });
  });

  it("event + channel booleans + title/body ถูกต้อง → ok", () => {
    const input = {
      booking_approved: { discord: false, welpru: true, title: "หัวข้อ", body: "เนื้อหา" },
      line_quota_warning: { discord: true, title: null, body: null },
    };
    const r = validateNotificationSettings(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(input);
  });

  it("ไม่ใช่ object (null) → error", () => {
    expect(validateNotificationSettings(null).ok).toBe(false);
  });
  it("ไม่ใช่ object (array) → error", () => {
    expect(validateNotificationSettings([]).ok).toBe(false);
  });

  it("event key ไม่รู้จัก → error", () => {
    const r = validateNotificationSettings({ not_an_event: { discord: false } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not_an_event");
  });

  it("channel ไม่ใช่ boolean → error", () => {
    expect(validateNotificationSettings({ booking_approved: { discord: "yes" } }).ok).toBe(false);
  });

  it("key แปลกใน event → error", () => {
    expect(validateNotificationSettings({ booking_approved: { foo: 1 } }).ok).toBe(false);
  });

  it("title ยาวเกิน MAX_TITLE → error", () => {
    expect(
      validateNotificationSettings({ booking_approved: { title: "x".repeat(MAX_TITLE + 1) } }).ok
    ).toBe(false);
  });

  it("body ยาวเกิน MAX_BODY → error", () => {
    expect(
      validateNotificationSettings({ booking_approved: { body: "x".repeat(MAX_BODY + 1) } }).ok
    ).toBe(false);
  });

  it("event value ไม่ใช่ object → error", () => {
    expect(validateNotificationSettings({ booking_approved: "x" }).ok).toBe(false);
  });
});
```

- [ ] **Step 3: รัน test ให้ fail**

Run: `npm run test -- notificationSettings`
Expected: FAIL — module ไม่พบ

- [ ] **Step 4: implement `notificationSettings.ts`**

สร้าง `supabase/functions/_shared/notificationSettings.ts`:

```typescript
import { EVENT_KEYS } from "./notify.ts";

export interface EventSetting {
  discord?: boolean;
  welpru?: boolean;
  line?: boolean;
  title?: string | null;
  body?: string | null;
}

export type NotificationSettings = Record<string, EventSetting>;

export const MAX_TITLE = 200;
export const MAX_BODY = 1000;

const VALID_EVENTS = new Set<string>(EVENT_KEYS);
const BOOL_KEYS = ["discord", "welpru", "line"] as const;
const TEXT_KEYS = ["title", "body"] as const;
const ALLOWED_KEYS = new Set<string>([...BOOL_KEYS, ...TEXT_KEYS]);

type Result =
  | { ok: true; value: NotificationSettings }
  | { ok: false; error: string };

export function validateNotificationSettings(input: unknown): Result {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "การตั้งค่าแจ้งเตือนต้องเป็นออบเจกต์" };
  }

  const obj = input as Record<string, unknown>;

  for (const [eventKey, rawSetting] of Object.entries(obj)) {
    if (!VALID_EVENTS.has(eventKey)) {
      return { ok: false, error: `เหตุการณ์ไม่ถูกต้อง: ${eventKey}` };
    }
    if (typeof rawSetting !== "object" || rawSetting === null || Array.isArray(rawSetting)) {
      return { ok: false, error: `ค่าของ ${eventKey} ต้องเป็นออบเจกต์` };
    }
    const setting = rawSetting as Record<string, unknown>;

    for (const [k, v] of Object.entries(setting)) {
      if (!ALLOWED_KEYS.has(k)) {
        return { ok: false, error: `คีย์ไม่ถูกต้องใน ${eventKey}: ${k}` };
      }
      if ((BOOL_KEYS as readonly string[]).includes(k) && typeof v !== "boolean") {
        return { ok: false, error: `${eventKey}.${k} ต้องเป็น boolean` };
      }
      if ((TEXT_KEYS as readonly string[]).includes(k) && v !== null && typeof v !== "string") {
        return { ok: false, error: `${eventKey}.${k} ต้องเป็นข้อความหรือ null` };
      }
    }

    if (typeof setting.title === "string" && setting.title.length > MAX_TITLE) {
      return { ok: false, error: `หัวข้อของ ${eventKey} ยาวเกิน ${MAX_TITLE} ตัวอักษร` };
    }
    if (typeof setting.body === "string" && setting.body.length > MAX_BODY) {
      return { ok: false, error: `เนื้อหาของ ${eventKey} ยาวเกิน ${MAX_BODY} ตัวอักษร` };
    }
  }

  return { ok: true, value: obj as NotificationSettings };
}
```

- [ ] **Step 5: รัน test ให้ผ่าน + full suite**

Run: `npm run test -- notificationSettings` แล้ว `npm run test`
Expected: PASS ทั้งหมด (ไม่กระทบไฟล์อื่น — export EVENT_KEYS เป็น additive)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/notify.ts supabase/functions/_shared/notificationSettings.ts supabase/functions/_shared/notificationSettings.test.ts
git commit -m "feat(settings): validateNotificationSettings + export EVENT_KEYS"
```

---

## Task 2: Edge Function `update-notification-settings` + config.toml

**Files:**
- Create: `supabase/functions/update-notification-settings/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `validateNotificationSettings` (Task 1), `withErrorHandling`/`ForbiddenError`/`UnauthorizedError`/`ValidationError` (existing)
- HTTP body: `{ welpru_enabled: boolean; discord_enabled: boolean; line_enabled: boolean; notification_settings: unknown }`

- [ ] **Step 1: สร้าง edge function**

สร้าง `supabase/functions/update-notification-settings/index.ts` (ลอกโครง auth+admin จาก `update-approval-chain/index.ts`):

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { ForbiddenError, UnauthorizedError, ValidationError } from "../_shared/errors.ts";
import { validateNotificationSettings } from "../_shared/notificationSettings.ts";

interface Body {
  welpru_enabled: boolean;
  discord_enabled: boolean;
  line_enabled: boolean;
  notification_settings: unknown;
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
    if (!user) throw new UnauthorizedError("ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่");

    const body: Body = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: caller, error: callerError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (callerError || !caller || caller.role !== "admin") {
      throw new ForbiddenError("ท่านไม่มีสิทธิ์แก้ไขการตั้งค่านี้");
    }

    if (
      typeof body.welpru_enabled !== "boolean" ||
      typeof body.discord_enabled !== "boolean" ||
      typeof body.line_enabled !== "boolean"
    ) {
      throw new ValidationError("ค่าเปิด/ปิดช่องทางไม่ถูกต้อง");
    }

    const validated = validateNotificationSettings(body.notification_settings);
    if (!validated.ok) throw new ValidationError(validated.error);

    const { data: config, error: configError } = await adminClient
      .from("system_config")
      .select("id")
      .single();
    if (configError || !config) throw new ValidationError("ไม่พบข้อมูลการตั้งค่าระบบ");

    const { data: updated, error: updateError } = await adminClient
      .from("system_config")
      .update({
        welpru_enabled: body.welpru_enabled,
        discord_enabled: body.discord_enabled,
        line_enabled: body.line_enabled,
        notification_settings: validated.value,
      })
      .eq("id", config.id)
      .select("welpru_enabled, discord_enabled, line_enabled, notification_settings")
      .single();
    if (updateError) throw updateError;

    // audit log (ตาม spec — ใช้ activity_logs เดิม)
    await adminClient.from("activity_logs").insert({
      actor_id: user.id,
      action: "update_notification_settings",
      target_type: "system_config",
      target_id: config.id,
    });

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
```

- [ ] **Step 2: เพิ่ม config.toml entry**

แก้ `supabase/config.toml` เพิ่มต่อจาก entries เดิม:

```toml
[functions.update-notification-settings]
verify_jwt = true
```

- [ ] **Step 3: full suite (ยืนยันไม่กระทบ)**

Run: `npm run test`
Expected: PASS เท่าเดิม (edge function ไม่มี unit test — thin wrapper เหนือ validator ที่ทดสอบแล้ว)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/update-notification-settings supabase/config.toml
git commit -m "feat(settings): update-notification-settings edge function"
```

---

## Task 3: `lib/notifications/eventMeta.ts` (frontend metadata + applyTemplate)

**Files:**
- Create: `lib/notifications/eventMeta.ts`
- Test: `lib/notifications/eventMeta.test.ts`

**Interfaces:**
- Produces:
  - `export type Channel = "discord" | "welpru" | "line"`
  - `export interface EventMeta { key: string; label: string; channels: Channel[]; defaultTitle: string; defaultBody: string }`
  - `export const EVENT_META: EventMeta[]` (9 ตัว ตามลำดับแสดงผล)
  - `export const CHANNEL_LABEL: Record<Channel, string>`
  - `export const PREVIEW_VARS: Record<string, string>`
  - `export function applyTemplate(template: string, vars: Record<string, string>): string`

- [ ] **Step 1: เขียน failing test**

สร้าง `lib/notifications/eventMeta.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { EVENT_META, applyTemplate, PREVIEW_VARS } from "./eventMeta";

describe("EVENT_META", () => {
  it("มีครบ 9 event", () => {
    expect(EVENT_META).toHaveLength(9);
  });
  it("ทุก event มี key/label/channels/default ครบ", () => {
    for (const m of EVENT_META) {
      expect(m.key).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(m.channels.length).toBeGreaterThan(0);
      expect(m.defaultTitle).toBeTruthy();
      expect(m.defaultBody).toBeTruthy();
    }
  });
  it("line_quota_warning มีแค่ discord (ไม่มี welpru/line)", () => {
    const m = EVENT_META.find((e) => e.key === "line_quota_warning")!;
    expect(m.channels).toEqual(["discord"]);
  });
  it("booking_submitted มี discord/welpru/line ครบ", () => {
    const m = EVENT_META.find((e) => e.key === "booking_submitted")!;
    expect(m.channels).toEqual(["discord", "welpru", "line"]);
  });
  it("booking_approved ไม่มี line (ไปหาผู้จอง ไม่มีปุ่ม)", () => {
    const m = EVENT_META.find((e) => e.key === "booking_approved")!;
    expect(m.channels).not.toContain("line");
  });
});

describe("applyTemplate", () => {
  it("แทนที่ตัวแปร", () => {
    expect(applyTemplate("จอง {room} {date}", { room: "ห้อง A", date: "15 ก.ค." }))
      .toBe("จอง ห้อง A 15 ก.ค.");
  });
  it("ตัวแปรขาดคง {key}", () => {
    expect(applyTemplate("สวัสดี {name}", {})).toBe("สวัสดี {name}");
  });
  it("PREVIEW_VARS ครอบคลุมตัวแปรใน default body ทุก event (ไม่เหลือ {x})", () => {
    for (const m of EVENT_META) {
      const rendered = applyTemplate(m.defaultBody, PREVIEW_VARS);
      expect(rendered).not.toMatch(/\{[a-z]+\}/);
    }
  });
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm run test -- eventMeta`
Expected: FAIL — module ไม่พบ

- [ ] **Step 3: implement `lib/notifications/eventMeta.ts`**

สร้าง `lib/notifications/eventMeta.ts`:

```typescript
// ⚠️ SYNC: defaultTitle/defaultBody ต้องตรงกับ EVENT_DEFAULTS ใน
// supabase/functions/_shared/notify.ts (source of truth). frontend เก็บสำเนา
// เพราะข้าม runtime Deno↔Node ไม่ได้. ถ้าแก้ default ใน notify.ts ต้องแก้ที่นี่ด้วย.

export type Channel = "discord" | "welpru" | "line";

export interface EventMeta {
  key: string;
  label: string;
  channels: Channel[];
  defaultTitle: string;
  defaultBody: string;
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  discord: "Discord",
  welpru: "WeLPRU",
  line: "LINE",
};

export const EVENT_META: EventMeta[] = [
  {
    key: "booking_submitted",
    label: "คำขอจองใหม่ (แจ้งผู้อนุมัติขั้นที่ 1)",
    channels: ["discord", "welpru", "line"],
    defaultTitle: "🔔 มีคำขอจองห้องประชุมใหม่",
    defaultBody: "{booker} ขอจอง{room} วันที่ {date} เวลา {time} โปรดพิจารณาอนุมัติ",
  },
  {
    key: "booking_step_approved",
    label: "ผ่านการอนุมัติขั้น (แจ้งผู้อนุมัติถัดไป)",
    channels: ["discord", "welpru", "line"],
    defaultTitle: "🔔 มีคำขอจองรอท่านพิจารณา",
    defaultBody: "{booker} ขอจอง{room} วันที่ {date} เวลา {time} ผ่านการอนุมัติขั้นก่อนหน้าแล้ว",
  },
  {
    key: "booking_approved",
    label: "อนุมัติครบทุกขั้น (แจ้งผู้จอง)",
    channels: ["discord", "welpru"],
    defaultTitle: "✅ การจองได้รับอนุมัติแล้ว",
    defaultBody: "การจอง{room} วันที่ {date} เวลา {time} ได้รับอนุมัติเรียบร้อยแล้ว",
  },
  {
    key: "booking_rejected",
    label: "ถูกปฏิเสธ (แจ้งผู้จอง)",
    channels: ["discord", "welpru"],
    defaultTitle: "❌ การจองไม่ได้รับอนุมัติ",
    defaultBody: "การจอง{room} วันที่ {date} ไม่ได้รับอนุมัติ เหตุผล: {reason}",
  },
  {
    key: "cancellation_requested",
    label: "ขอยกเลิกการจอง (แจ้ง Admin)",
    channels: ["discord", "welpru"],
    defaultTitle: "🔔 มีคำขอยกเลิกการจอง",
    defaultBody: "{booker} ขอยกเลิกการจอง{room} วันที่ {date} เหตุผล: {reason}",
  },
  {
    key: "cancellation_approved",
    label: "อนุมัติคำขอยกเลิก (แจ้งผู้จอง)",
    channels: ["discord", "welpru"],
    defaultTitle: "✅ คำขอยกเลิกได้รับอนุมัติ",
    defaultBody: "การจอง{room} วันที่ {date} ถูกยกเลิกเรียบร้อยแล้ว",
  },
  {
    key: "cancellation_denied",
    label: "ไม่อนุมัติคำขอยกเลิก (แจ้งผู้จอง)",
    channels: ["discord", "welpru"],
    defaultTitle: "❌ คำขอยกเลิกไม่ได้รับอนุมัติ",
    defaultBody: "การจอง{room} วันที่ {date} ยังมีผลตามเดิม เหตุผล: {reason}",
  },
  {
    key: "booking_cancelled",
    label: "ถูกยกเลิกโดยผู้ดูแล (แจ้งผู้จอง)",
    channels: ["discord", "welpru"],
    defaultTitle: "⚠️ การจองของท่านถูกยกเลิก",
    defaultBody: "การจอง{room} วันที่ {date} เวลา {time} ถูกยกเลิก เหตุผล: {reason}",
  },
  {
    key: "line_quota_warning",
    label: "เตือนโควตา LINE ใกล้เต็ม (แจ้ง Admin)",
    channels: ["discord"],
    defaultTitle: "⚠️ โควตา LINE ใกล้เต็ม",
    defaultBody: "เดือนนี้ส่งไปแล้ว {sent}/500 ข้อความ เมื่อครบโควตาระบบจะหยุดส่งทาง LINE อัตโนมัติ",
  },
];

// ตัวแปรตัวอย่างสำหรับ preview — ต้องครอบคลุมทุก {var} ที่ default body ใช้
export const PREVIEW_VARS: Record<string, string> = {
  booker: "สมชาย ใจดี",
  room: "ห้องประชุม 1",
  date: "15 ก.ค. 69",
  time: "09:00–12:00 น.",
  reason: "ตัวอย่างเหตุผล",
  sent: "410",
  step: "1",
  approver: "ผู้อนุมัติ 2",
};

export function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : `{${key}}`));
}
```

- [ ] **Step 4: รัน test ให้ผ่าน + full suite**

Run: `npm run test -- eventMeta` แล้ว `npm run test`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/eventMeta.ts lib/notifications/eventMeta.test.ts
git commit -m "feat(settings): frontend event metadata + applyTemplate for settings UI"
```

---

## Task 4: Settings page — load notif config + master toggle Card + save

**Files:**
- Modify: `app/(app)/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: `EVENT_META` (Task 3), Edge Function `update-notification-settings` (Task 2)
- Produces: state `notifState` (per-event editor state) ที่ Task 5 จะต่อ UI

**อ่านก่อนเริ่ม:** ไฟล์ settings เดิมมี Approval Chain/เวลา/วันหยุด + `handleSubmit` (โพสต์ `update-approval-chain`) — **ไม่แตะส่วนนั้น** เพิ่ม state/handler/Card ใหม่แยก

- [ ] **Step 1: เพิ่ม imports + state**

ใน `app/(app)/dashboard/settings/page.tsx` เพิ่ม import:
```typescript
import { EVENT_META, CHANNEL_LABEL, PREVIEW_VARS, applyTemplate, type Channel } from "@/lib/notifications/eventMeta";
```

เพิ่ม type + state (ต่อจาก state เดิม ก่อน `loadSettings`):
```typescript
  // per-event editor state: channelOff = ช่องที่ปิด, title/body = "" หมายถึงใช้ default
  type NotifEventState = {
    channelOff: Partial<Record<Channel, boolean>>;
    title: string;
    body: string;
  };
  const [welpruEnabled, setWelpruEnabled] = useState(false);
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [lineEnabled, setLineEnabled] = useState(false);
  const [notifState, setNotifState] = useState<Record<string, NotifEventState>>({});
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [notifSuccess, setNotifSuccess] = useState<string | null>(null);
```

- [ ] **Step 2: ขยาย `loadSettings` ให้โหลด notif config**

ใน `loadSettings`, แก้ query `system_config` ให้ดึงคอลัมน์เพิ่ม (แทน select เดิม):
```typescript
      supabase
        .from("system_config")
        .select(
          "admin_id, approver1_id, approver2_id, office_start_hour, office_end_hour, holidays, welpru_enabled, discord_enabled, line_enabled, notification_settings"
        )
        .single(),
```

หลัง `setHolidays(...)` เพิ่มการ map notif config → state:
```typescript
      setWelpruEnabled(configRes.data.welpru_enabled ?? false);
      setDiscordEnabled(configRes.data.discord_enabled ?? false);
      setLineEnabled(configRes.data.line_enabled ?? false);
      const saved = (configRes.data.notification_settings ?? {}) as Record<
        string,
        { discord?: boolean; welpru?: boolean; line?: boolean; title?: string | null; body?: string | null }
      >;
      const initial: Record<string, NotifEventState> = {};
      for (const m of EVENT_META) {
        const s = saved[m.key] ?? {};
        const channelOff: Partial<Record<Channel, boolean>> = {};
        for (const ch of m.channels) if (s[ch] === false) channelOff[ch] = true;
        initial[m.key] = { channelOff, title: s.title ?? "", body: s.body ?? "" };
      }
      setNotifState(initial);
```

- [ ] **Step 3: เพิ่ม save handler (สร้าง minimal-diff payload)**

เพิ่มฟังก์ชัน (ต่อจาก `handleSubmit` เดิม):
```typescript
  function buildNotificationSettings() {
    const out: Record<string, Record<string, unknown>> = {};
    for (const m of EVENT_META) {
      const st = notifState[m.key];
      if (!st) continue;
      const entry: Record<string, unknown> = {};
      for (const ch of m.channels) if (st.channelOff[ch]) entry[ch] = false;
      if (st.title.trim()) entry.title = st.title.trim();
      if (st.body.trim()) entry.body = st.body.trim();
      if (Object.keys(entry).length > 0) out[m.key] = entry;
    }
    return out;
  }

  async function handleSaveNotif() {
    setNotifSaving(true);
    setNotifError(null);
    setNotifSuccess(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setNotifError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setNotifSaving(false);
      return;
    }
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-notification-settings`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            welpru_enabled: welpruEnabled,
            discord_enabled: discordEnabled,
            line_enabled: lineEnabled,
            notification_settings: buildNotificationSettings(),
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        setNotifError(result.message ?? "บันทึกไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      setNotifSuccess("บันทึกการตั้งค่าแจ้งเตือนสำเร็จ");
      await loadSettings();
    } catch {
      setNotifError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setNotifSaving(false);
    }
  }
```

- [ ] **Step 4: เพิ่ม master-toggle Card + ปุ่มบันทึก (ใน JSX)**

แทรก Card ใหม่หลัง Card "วันหยุด" (ก่อนปุ่ม "บันทึกการตั้งค่า" ของ approval chain เดิม — วางเป็นอีกกลุ่มด้านล่าง หลัง `</Card>` ของวันหยุดและก่อน `<Button onClick={handleSubmit}>`... จริงๆ วางต่อจากปุ่ม approval chain เดิมได้เลยเพื่อแยกกลุ่มชัด). วางบล็อกนี้ **หลัง** `<Button onClick={handleSubmit} ...>บันทึกการตั้งค่า</Button>`:

```tsx
          <Card>
            <p className="font-medium text-text-primary">ช่องทางแจ้งเตือน (เปิด/ปิดทั้งระบบ)</p>
            <p className="mt-1 text-sm text-text-secondary">
              การแจ้งเตือนในระบบ (in-app) ทำงานเสมอ — สวิตช์นี้ควบคุมช่องทางเสริม
            </p>
            <div className="mt-3 space-y-2">
              {([
                ["discord", discordEnabled, setDiscordEnabled],
                ["welpru", welpruEnabled, setWelpruEnabled],
                ["line", lineEnabled, setLineEnabled],
              ] as const).map(([ch, val, setter]) => (
                <label key={ch} className="flex items-center gap-2 text-sm text-text-primary">
                  <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)} />
                  {CHANNEL_LABEL[ch as Channel]}
                </label>
              ))}
            </div>
          </Card>

          {/* Task 5 จะเพิ่ม per-event Card ตรงนี้ */}

          {notifError && <p className="text-sm text-danger-text">{notifError}</p>}
          {notifSuccess && <p className="text-sm text-success-text">{notifSuccess}</p>}
          <Button onClick={handleSaveNotif} disabled={notifSaving}>
            {notifSaving ? "กำลังบันทึก..." : "บันทึกการตั้งค่าแจ้งเตือน"}
          </Button>
```

- [ ] **Step 5: type-check + lint + full suite**

Run: `npx tsc --noEmit` แล้ว `npm run lint` แล้ว `npm run test`
Expected: ไม่มี error ใหม่ในไฟล์นี้ / suite PASS เท่าเดิม

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/settings/page.tsx"
git commit -m "feat(settings): notification master-toggle card + save handler"
```

---

## Task 5: Settings page — per-event editor Card (toggle + template + counter + reset + preview)

**Files:**
- Modify: `app/(app)/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: `notifState`/`setNotifState` (Task 4), `EVENT_META`/`CHANNEL_LABEL`/`PREVIEW_VARS`/`applyTemplate` (Task 3)

- [ ] **Step 1: เพิ่ม helper อัปเดต state ต่อ event**

เพิ่มฟังก์ชัน (ต่อจาก `handleSaveNotif`):
```typescript
  function updateNotif(key: string, patch: Partial<NotifEventState>) {
    setNotifState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }
  function toggleChannel(key: string, ch: Channel) {
    setNotifState((prev) => {
      const cur = prev[key];
      const channelOff = { ...cur.channelOff, [ch]: !cur.channelOff[ch] };
      return { ...prev, [key]: { ...cur, channelOff } };
    });
  }
```

- [ ] **Step 2: แทนที่ comment placeholder ด้วย per-event Card**

แทน `{/* Task 5 จะเพิ่ม per-event Card ตรงนี้ */}` ด้วย:

```tsx
          <Card>
            <p className="font-medium text-text-primary">ตั้งค่ารายเหตุการณ์</p>
            <p className="mt-1 text-sm text-text-secondary">
              เปิด/ปิดช่องทางและแก้ข้อความแต่ละเหตุการณ์ — เว้นว่างข้อความไว้เพื่อใช้ค่าเริ่มต้น
            </p>
            <div className="mt-4 space-y-6">
              {EVENT_META.map((m) => {
                const st = notifState[m.key];
                if (!st) return null;
                const titleLen = st.title.trim().length;
                const bodyLen = st.body.trim().length;
                const previewTitle = applyTemplate(st.title.trim() || m.defaultTitle, PREVIEW_VARS);
                const previewBody = applyTemplate(st.body.trim() || m.defaultBody, PREVIEW_VARS);
                return (
                  <div key={m.key} className="border-t border-neutral-100 pt-4 first:border-0 first:pt-0">
                    <p className="text-sm font-medium text-text-primary">{m.label}</p>

                    <div className="mt-2 flex flex-wrap gap-4">
                      {m.channels.map((ch) => (
                        <label key={ch} className="flex items-center gap-2 text-sm text-text-secondary">
                          <input
                            type="checkbox"
                            checked={!st.channelOff[ch]}
                            onChange={() => toggleChannel(m.key, ch)}
                          />
                          {CHANNEL_LABEL[ch]}
                        </label>
                      ))}
                    </div>

                    <div className="mt-3 space-y-2">
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-text-secondary">หัวข้อ</label>
                          <span className={`text-xs ${titleLen > 50 ? "text-danger-text" : "text-text-muted"}`}>
                            {titleLen}/50
                          </span>
                        </div>
                        <input
                          type="text"
                          value={st.title}
                          placeholder={m.defaultTitle}
                          onChange={(e) => updateNotif(m.key, { title: e.target.value })}
                          className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-text-secondary">เนื้อหา</label>
                          <span className={`text-xs ${bodyLen > 250 ? "text-danger-text" : "text-text-muted"}`}>
                            {bodyLen}/250
                          </span>
                        </div>
                        <textarea
                          value={st.body}
                          placeholder={m.defaultBody}
                          onChange={(e) => updateNotif(m.key, { body: e.target.value })}
                          rows={2}
                          className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
                        />
                      </div>
                      {(st.title.trim() || st.body.trim()) && (
                        <button
                          type="button"
                          onClick={() => updateNotif(m.key, { title: "", body: "" })}
                          className="text-xs text-brand-primary hover:underline"
                        >
                          คืนค่าเริ่มต้น
                        </button>
                      )}
                    </div>

                    <div className="mt-2 rounded-sm bg-neutral-100 px-3 py-2">
                      <p className="text-xs text-text-muted">ตัวอย่าง:</p>
                      <p className="text-sm font-medium text-text-primary">{previewTitle}</p>
                      <p className="text-sm text-text-secondary">{previewBody}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
```

- [ ] **Step 3: type-check + lint + full suite**

Run: `npx tsc --noEmit` แล้ว `npm run lint` แล้ว `npm run test`
Expected: ไม่มี error ใหม่ / suite PASS เท่าเดิม

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/settings/page.tsx"
git commit -m "feat(settings): per-event notification editor (toggle + template + preview)"
```

---

## Task 6: Deploy + Live Verification

**Files:** ไม่มี (deploy + ทดสอบ)

- [ ] **Step 1: Deploy edge function**

```bash
npx supabase functions deploy update-notification-settings --use-api --project-ref sbmbdngrutkjugsmmfxa
```
Expected: `"Deployed Functions."` — ตรวจ `functions list` ว่า verify_jwt=true
(ไม่ต้อง redeploy handler อื่น — เฟสนี้ไม่แก้ notify.ts logic ที่ handler อื่น import; export EVENT_KEYS เป็น additive แต่ handler อื่นไม่ import notificationSettings — ปลอดภัย)

- [ ] **Step 2: Live verify ผ่าน browser preview**

- `preview_start` ชื่อ `next-dev`, login `admin@test.local` / `test1234` → ไป `/dashboard/settings`
- ตรวจ 2 Card ใหม่แสดง: master toggle 3 ช่อง + per-event 9 เหตุการณ์ (channel toggle เฉพาะช่องที่ใช้: line_quota_warning มีแค่ Discord, booking_approved ไม่มี LINE) + preview แสดงข้อความจริง
- ทดสอบ: ติ๊ก Discord master ON, แก้ title ของ `booking_approved` เป็น "ทดสอบหัวข้อ", กด "บันทึกการตั้งค่าแจ้งเตือน" → เห็น "บันทึกสำเร็จ"
- ตรวจ DB: `SELECT discord_enabled, notification_settings->'booking_approved' FROM system_config;` → `discord_enabled=true`, `notification_settings.booking_approved.title = "ทดสอบหัวข้อ"`
- reload หน้า → ค่าที่บันทึกยังอยู่ (title แสดงในช่อง, Discord ติ๊ก)
- ทดสอบ "คืนค่าเริ่มต้น" ของ booking_approved → ช่อง title ว่าง → บันทึก → DB `notification_settings.booking_approved` ไม่มี title (หรือ key หาย ถ้าไม่มี override อื่น)
- ตรวจ `activity_logs` มีแถว `action='update_notification_settings'`
- `preview_console_logs level=error` → ไม่มี error

- [ ] **Step 3: คืนสถานะทดสอบ**

ปิด toggle ที่เปิดทดสอบกลับ (ถ้าไม่ได้ตั้งใจใช้จริง) ผ่านหน้า UI เอง หรือ `db query` — ถามผู้ใช้ว่าจะเปิดช่องไหนไว้ใช้จริง

- [ ] **Step 4: สรุปผล**

รายงานผล live-test + ยืนยันว่าตอนนี้ Admin ตั้งค่าแจ้งเตือนผ่านเว็บได้ครบแล้ว (แทน SQL มือ)

---

## Self-Review Checklist (หลังครบ 6 task)

- [ ] Edge function เขียน `system_config` ผ่าน service role + admin check เท่านั้น (AGENTS.md) — ไม่มี execute_sql/client ตรงจาก frontend
- [ ] validateNotificationSettings ปฏิเสธ event key แปลก/ค่าผิด type/ยาวเกิน — กัน payload พัง
- [ ] minimal-diff storage: event ที่ default ล้วนไม่ถูกเก็บใน JSONB; orchestrator อ่าน absent = default ถูกต้อง
- [ ] channel toggle แสดงเฉพาะช่องที่ event ใช้จริง (line_quota_warning=discord เท่านั้น ฯลฯ)
- [ ] EVENT_META.defaultTitle/Body ตรงกับ EVENT_DEFAULTS ใน notify.ts (มีคอมเมนต์ sync + test key ครบ 9)
- [ ] ไม่แตะ Approval Chain/เวลา/วันหยุด + `handleSubmit` เดิม (ปุ่ม/handler แจ้งเตือนแยกกัน)
- [ ] ไม่แตะ notify.ts orchestrator logic (เพิ่มแค่ export EVENT_KEYS)
- [ ] UI ใช้ design token เท่านั้น (Rule 10), ข้อความไทยทางการ (Rule 9)
- [ ] audit log `update_notification_settings` ลง activity_logs
- [ ] ไม่มี placeholder/TODO ในโค้ดที่รันจริง
