# Housekeeping LINE Group Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ส่งข้อมูลห้องประชุมที่จำเป็นต่องานเตรียมห้องเข้า LINE กลุ่มแม่บ้านอัตโนมัติ 3 เหตุการณ์ (สรุปพรุ่งนี้รายวัน, อนุมัติขั้นสุดท้ายระยะใกล้, ยกเลิก approved booking ระยะใกล้)

**Architecture:** เพิ่มโมดูล `_shared/housekeepingNotify.ts` (pure formatters + IO orchestration, ไม่ throw, log ทุกครั้ง) + transport `pushTextToGroup` ใน `lineClient.ts`. เหตุการณ์ real-time hook เข้า `bookingNotify.ts` (flow เดิม). สรุปพรุ่งนี้ใช้ pg_cron รายชั่วโมงเรียก edge function `send-housekeeping-digest` ที่เช็คเวลา (Asia/Bangkok) + guard กันส่งซ้ำเอง. ตั้งค่าเปิด/ปิด, group ID, ชั่วโมงส่ง อยู่ใน `system_config` แก้ผ่านหน้า `/dashboard/settings`.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), Vitest (unit), Next.js 16 (App Router) + Tailwind v4, LINE Messaging API (push to group), pg_cron + pg_net.

## Global Constraints

- ทุก Edge Function ห่อด้วย `withErrorHandling()` จาก `_shared/handler.ts` — ไม่เขียน try-catch เอง (CLAUDE.md ข้อ 1)
- โมดูล notify **ห้าม throw เด็ดขาด** — ห่อ try/catch ทุก export (pattern เดียวกับ `bookingNotify.ts`)
- ทุกการเรียก external service (LINE) ต้อง log ผ่าน `logIntegration()` เข้า `integration_health` ทั้งสำเร็จ/ล้มเหลว (CLAUDE.md ข้อ 5)
- Business hours อ่านจาก `system_config` เท่านั้น ห้าม hardcode (CLAUDE.md ข้อ 4)
- Migration: ห้าม DROP COLUMN/TABLE ตรงๆ — migration 015 เป็น ADD/CREATE ล้วน (CLAUDE.md ข้อ 8); รันผ่าน `apply_migration` MCP tool, ตรวจ `list_migrations` ก่อน
- ข้อความ UI/แจ้งเตือนทั้งหมดเป็นภาษาไทยทางการเหมาะกับหน่วยงานราชการ (CLAUDE.md ข้อ 9)
- UI component ใช้ design token จาก `docs/DESIGN.md` เท่านั้น ห้าม hardcode สี/spacing/font (CLAUDE.md ข้อ 10)
- การเปลี่ยน `system_config` ต้องผ่าน Edge Function ที่ใช้ service_role (SCHEMA.md) — client เขียนตรงไม่ได้
- Group push นับรวมโควตา LINE 500/เดือน — ต้อง guard เหมือน push เดิม (payload `{kind:'push'}` เพื่อให้ตัวนับเดิมนับถูก)
- เขตเวลา: ทุกการคำนวณวันที่/เวลาใช้ `Asia/Bangkok` (ไทยไม่มี DST, UTC+7 คงที่)
- Timestamp เทียบ: ใช้ formatter เดิมจาก `_shared/notify.ts` (`formatThaiDate`, `formatThaiTimeRange`)

---

### Task 1: Migration 015 — schema + view + pg_cron

**Files:**
- Create: `supabase/migrations/015_housekeeping_notify.sql`

**Interfaces:**
- Produces (columns ที่ task อื่นพึ่ง): `bookings.notes_for_staff text`, `system_config.housekeeping_enabled bool`, `system_config.housekeeping_line_group_id text`, `system_config.housekeeping_digest_hour int`, `system_config.housekeeping_digest_last_sent_on date`, view `booking_detail.notes_for_staff`

- [ ] **Step 1: เขียนไฟล์ migration**

`supabase/migrations/015_housekeeping_notify.sql`:
```sql
-- ============================================================
-- 015_housekeeping_notify.sql
-- แจ้งเตือนกลุ่มแม่บ้าน (LINE group): สรุปพรุ่งนี้ + อนุมัติ/ยกเลิกระยะใกล้
-- ADD/CREATE ล้วน ไม่ DROP (production เดียว)
-- ============================================================

-- 1. หมายเหตุถึงแม่บ้านต่อการจอง (การจัดห้อง/อุปกรณ์/น้ำ) — ไม่บังคับ
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes_for_staff text;

-- 2. ตั้งค่าแจ้งเตือนกลุ่มแม่บ้าน (system_config เป็น singleton)
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS housekeeping_enabled            boolean NOT NULL DEFAULT false;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS housekeeping_line_group_id      text;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS housekeeping_digest_hour        int NOT NULL DEFAULT 17
                                    CHECK (housekeeping_digest_hour BETWEEN 0 AND 23);
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS housekeeping_digest_last_sent_on date;

-- 3. เพิ่ม notes_for_staff เข้า view booking_detail (recreate — เดิมมี activity/attendees/department แล้ว)
CREATE OR REPLACE VIEW booking_detail AS
SELECT
  b.id,
  b.ref_id,
  b.title,
  b.activity,
  b.attendees,
  b.notes_for_staff,
  b.start_time,
  b.end_time,
  b.final_status,
  b.current_step,
  b.gcal_event_id,
  b.cancellation_reason,
  b.created_at,
  r.id           AS room_id,
  r.name         AS room_name,
  r.capacity     AS room_capacity,
  r.equipment    AS room_equipment,
  u.id           AS requester_id,
  u.full_name    AS requester_name,
  u.email        AS requester_email,
  u.line_user_id AS requester_line_id,
  u.department   AS requester_department
FROM bookings b
JOIN rooms r ON r.id = b.room_id
JOIN users u ON u.id = b.requester_id;

-- 4. เปิด extension สำหรับตั้งเวลา (ตรวจ list_extensions ก่อน)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

> หมายเหตุ: cron.schedule ที่ต้องใช้ SUPABASE_URL + SERVICE_ROLE_KEY **ไม่อยู่ในไฟล์นี้** (กัน secret หลุดเข้า git) — สร้างใน Step 4 ผ่าน `execute_sql` MCP ด้วยค่าจริง

- [ ] **Step 2: apply migration ผ่าน MCP**

ก่อนรัน: เรียก `list_migrations` ตรวจว่า 001–014 รันครบและ 015 ยังไม่รัน. เรียก `list_extensions` ตรวจว่า `pg_cron`/`pg_net` มีให้ใช้.
รัน: `apply_migration` name=`015_housekeeping_notify` พร้อมเนื้อไฟล์ Step 1.

- [ ] **Step 3: verify schema**

รัน `execute_sql`:
```sql
select column_name from information_schema.columns
where table_name='system_config' and column_name like 'housekeeping%'
order by column_name;
select column_name from information_schema.columns
where table_name='bookings' and column_name='notes_for_staff';
select column_name from information_schema.columns
where table_name='booking_detail' and column_name='notes_for_staff';
```
Expected: 4 คอลัมน์ housekeeping_*, `notes_for_staff` ใน bookings และ booking_detail

- [ ] **Step 4: สร้าง cron job (ค่าจริง — ไม่ commit)**

รัน `execute_sql` (แทน `<SUPABASE_URL>` และ `<SERVICE_ROLE_KEY>` ด้วยค่าจริงจาก `get_project_url` / secrets):
```sql
select cron.schedule(
  'housekeeping-digest-hourly',
  '0 * * * *',
  $$ select net.http_post(
       url := '<SUPABASE_URL>/functions/v1/send-housekeeping-digest',
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'Authorization','Bearer <SERVICE_ROLE_KEY>'
       )
     ) $$
);
```
Verify: `select jobname, schedule from cron.job where jobname='housekeeping-digest-hourly';` Expected: 1 แถว `0 * * * *`
> ทำหลัง Task 5 deploy edge function แล้ว หรือทำตอนนี้ก็ได้ (fn ที่ยังไม่ deploy จะตอบ 404 แต่ไม่ทำให้ cron พัง)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/015_housekeeping_notify.sql
git commit -m "feat(housekeeping): migration 015 — notes_for_staff, config, view, pg_cron"
```

---

### Task 2: Pure formatters + gates ใน housekeepingNotify.ts

**Files:**
- Create: `supabase/functions/_shared/housekeepingNotify.ts`
- Test: `supabase/functions/_shared/housekeepingNotify.test.ts`

**Interfaces:**
- Consumes: `formatThaiDate`, `formatThaiTimeRange` จาก `./notify.ts`
- Produces:
  - `addDaysISODate(dateStr: string, days: number): string`
  - `bangkokDateString(iso: string): string` (YYYY-MM-DD)
  - `bangkokHour(iso: string): number` (0–23)
  - `isNearTerm(startIso: string, nowIso: string): "today" | "tomorrow" | null`
  - `interface HousekeepingRow { ref_id, room_name, title, activity, attendees, start_time, end_time, requester_name, requester_department, notes_for_staff }`
  - `buildDigestMessage(rows: HousekeepingRow[], forDateIso: string): string`
  - `buildApprovedMessage(row: HousekeepingRow, nearTerm: "today"|"tomorrow"): string`
  - `buildCancelledMessage(row: HousekeepingRow, nearTerm: "today"|"tomorrow"): string`
  - `interface DigestGateConfig { housekeeping_enabled: boolean; housekeeping_line_group_id: string | null; housekeeping_digest_hour: number; housekeeping_digest_last_sent_on: string | null }`
  - `shouldSendDigestNow(cfg: DigestGateConfig, nowIso: string): boolean`

- [ ] **Step 1: เขียน failing tests**

`supabase/functions/_shared/housekeepingNotify.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  addDaysISODate,
  bangkokDateString,
  bangkokHour,
  isNearTerm,
  buildDigestMessage,
  buildApprovedMessage,
  buildCancelledMessage,
  shouldSendDigestNow,
  type HousekeepingRow,
} from "./housekeepingNotify.ts";

const row = (over: Partial<HousekeepingRow> = {}): HousekeepingRow => ({
  ref_id: "BK-20260724-001",
  room_name: "ห้องประชุมสภา ชั้น 8",
  title: "ประชุมสภาวิชาการ",
  activity: "พิจารณาหลักสูตร",
  attendees: 25,
  start_time: "2026-07-24T02:00:00Z", // 09:00 Bangkok
  end_time: "2026-07-24T05:00:00Z",   // 12:00 Bangkok
  requester_name: "สมชาย ใจดี",
  requester_department: "คณะครุศาสตร์",
  notes_for_staff: null,
  ...over,
});

describe("addDaysISODate", () => {
  it("บวกวันข้ามเดือนถูกต้อง", () => {
    expect(addDaysISODate("2026-07-31", 1)).toBe("2026-08-01");
  });
});

describe("bangkokDateString / bangkokHour", () => {
  it("แปลง UTC เป็นวันที่/ชั่วโมง Asia/Bangkok (+7)", () => {
    // 2026-07-23T17:30:00Z = 2026-07-24 00:30 Bangkok
    expect(bangkokDateString("2026-07-23T17:30:00Z")).toBe("2026-07-24");
    expect(bangkokHour("2026-07-23T17:30:00Z")).toBe(0);
    expect(bangkokHour("2026-07-23T10:00:00Z")).toBe(17);
  });
});

describe("isNearTerm", () => {
  const now = "2026-07-23T03:00:00Z"; // 10:00 Bangkok, วันที่ 23
  it("start วันนี้ → today", () => {
    expect(isNearTerm("2026-07-23T06:00:00Z", now)).toBe("today");
  });
  it("start พรุ่งนี้ → tomorrow", () => {
    expect(isNearTerm("2026-07-24T06:00:00Z", now)).toBe("tomorrow");
  });
  it("start มะรืน → null", () => {
    expect(isNearTerm("2026-07-25T06:00:00Z", now)).toBeNull();
  });
  it("ขอบเขตข้ามเที่ยงคืน Bangkok คิดตามวันที่ Bangkok ไม่ใช่ UTC", () => {
    // now = 2026-07-23T18:00:00Z = 2026-07-24 01:00 Bangkok → "วันนี้" = 24
    const lateNow = "2026-07-23T18:00:00Z";
    expect(isNearTerm("2026-07-24T06:00:00Z", lateNow)).toBe("today");
    expect(isNearTerm("2026-07-25T06:00:00Z", lateNow)).toBe("tomorrow");
  });
});

describe("buildDigestMessage", () => {
  const forDate = "2026-07-24T00:00:00+07:00";
  it("ว่าง → ข้อความไม่มีการใช้ห้องประชุม", () => {
    const msg = buildDigestMessage([], forDate);
    expect(msg).toContain("ไม่มีการใช้ห้องประชุม");
  });
  it("มีรายการ → เรียงเวลา + ข้อมูลครบ", () => {
    const msg = buildDigestMessage([row()], forDate);
    expect(msg).toContain("1 รายการ");
    expect(msg).toContain("ห้องประชุมสภา ชั้น 8");
    expect(msg).toContain("25 คน");
    expect(msg).toContain("สมชาย ใจดี");
    expect(msg).toContain("คณะครุศาสตร์");
    expect(msg).toContain("BK-20260724-001");
  });
  it("มี notes_for_staff → แสดงบรรทัด 📝, ถ้าไม่มี → ไม่แสดง", () => {
    expect(buildDigestMessage([row({ notes_for_staff: "จัดโต๊ะรูปตัว U" })], forDate)).toContain("📝 จัดโต๊ะรูปตัว U");
    expect(buildDigestMessage([row()], forDate)).not.toContain("📝");
  });
});

describe("buildApprovedMessage / buildCancelledMessage", () => {
  it("approved → ป้าย ✅ + คำว่า (พรุ่งนี้) + notes", () => {
    const msg = buildApprovedMessage(row({ notes_for_staff: "เตรียมน้ำ 25 ที่" }), "tomorrow");
    expect(msg).toContain("✅");
    expect(msg).toContain("พรุ่งนี้");
    expect(msg).toContain("เตรียมน้ำ 25 ที่");
  });
  it("cancelled → ป้าย ❌ + (วันนี้) + ข้อความไม่ต้องเตรียม", () => {
    const msg = buildCancelledMessage(row(), "today");
    expect(msg).toContain("❌");
    expect(msg).toContain("วันนี้");
    expect(msg).toContain("ไม่ต้องเตรียมห้องนี้แล้ว");
  });
});

describe("shouldSendDigestNow", () => {
  const base = {
    housekeeping_enabled: true,
    housekeeping_line_group_id: "Cxxxx",
    housekeeping_digest_hour: 17,
    housekeeping_digest_last_sent_on: null,
  };
  const at17 = "2026-07-23T10:00:00Z"; // 17:00 Bangkok, วันที่ 23
  it("เปิด + ตรงชั่วโมง + ยังไม่ส่งวันนี้ → true", () => {
    expect(shouldSendDigestNow(base, at17)).toBe(true);
  });
  it("ปิดใช้งาน → false", () => {
    expect(shouldSendDigestNow({ ...base, housekeeping_enabled: false }, at17)).toBe(false);
  });
  it("ไม่มี group id → false", () => {
    expect(shouldSendDigestNow({ ...base, housekeeping_line_group_id: null }, at17)).toBe(false);
  });
  it("ยังไม่ถึงชั่วโมง → false", () => {
    expect(shouldSendDigestNow(base, "2026-07-23T09:00:00Z")).toBe(false); // 16:00
  });
  it("ส่งไปแล้ววันนี้ → false", () => {
    expect(shouldSendDigestNow({ ...base, housekeeping_digest_last_sent_on: "2026-07-23" }, at17)).toBe(false);
  });
});
```

- [ ] **Step 2: รันเทสต์ให้ FAIL**

Run: `npm run test -- housekeepingNotify`
Expected: FAIL — "Cannot find module './housekeepingNotify.ts'"

- [ ] **Step 3: เขียน implementation (pure ส่วนแรก)**

`supabase/functions/_shared/housekeepingNotify.ts`:
```ts
import { formatThaiDate, formatThaiTimeRange } from "./notify.ts";

const TZ = "Asia/Bangkok";

export interface HousekeepingRow {
  ref_id: string;
  room_name: string;
  title: string;
  activity: string;
  attendees: number;
  start_time: string;
  end_time: string;
  requester_name: string;
  requester_department: string | null;
  notes_for_staff: string | null;
}

// บวก/ลบวันบน date string "YYYY-MM-DD" โดยไม่ยุ่งเขตเวลา
export function addDaysISODate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function bangkokDateString(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso)); // en-CA → YYYY-MM-DD
}

export function bangkokHour(iso: string): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return Number(s);
}

export function isNearTerm(
  startIso: string,
  nowIso: string
): "today" | "tomorrow" | null {
  const startDate = bangkokDateString(startIso);
  const today = bangkokDateString(nowIso);
  if (startDate === today) return "today";
  if (startDate === addDaysISODate(today, 1)) return "tomorrow";
  return null;
}

const NEAR_LABEL: Record<"today" | "tomorrow", string> = {
  today: "วันนี้",
  tomorrow: "พรุ่งนี้",
};

function itemLines(r: HousekeepingRow): string {
  const dept = r.requester_department ? ` (${r.requester_department})` : "";
  const lines = [
    `🕐 ${formatThaiTimeRange(r.start_time, r.end_time)} | ${r.room_name}`,
    `${r.title} · ${r.attendees} คน`,
    `โดย: ${r.requester_name}${dept}`,
  ];
  if (r.notes_for_staff && r.notes_for_staff.trim()) {
    lines.push(`📝 ${r.notes_for_staff.trim()}`);
  }
  lines.push(`[${r.ref_id}]`);
  return lines.join("\n");
}

export function buildDigestMessage(
  rows: HousekeepingRow[],
  forDateIso: string
): string {
  const dateLabel = formatThaiDate(forDateIso);
  if (rows.length === 0) {
    return `📋 ห้องประชุมพรุ่งนี้ (${dateLabel})\nพรุ่งนี้ (${dateLabel}) ไม่มีการใช้ห้องประชุม`;
  }
  const header = `📋 ห้องประชุมพรุ่งนี้ (${dateLabel}) — ${rows.length} รายการ`;
  const items = rows.map((r, i) => {
    const dept = r.requester_department ? ` (${r.requester_department})` : "";
    const body = [
      `${i + 1}) ${formatThaiTimeRange(r.start_time, r.end_time)} | ${r.room_name}`,
      `   ${r.title} · ${r.attendees} คน`,
      `   โดย: ${r.requester_name}${dept}`,
    ];
    if (r.notes_for_staff && r.notes_for_staff.trim()) {
      body.push(`   📝 ${r.notes_for_staff.trim()}`);
    }
    body.push(`   [${r.ref_id}]`);
    return body.join("\n");
  });
  return `${header}\n\n${items.join("\n\n")}`;
}

export function buildApprovedMessage(
  r: HousekeepingRow,
  nearTerm: "today" | "tomorrow"
): string {
  return `✅ ยืนยันการประชุม (${NEAR_LABEL[nearTerm]})\n${itemLines(r)}`;
}

export function buildCancelledMessage(
  r: HousekeepingRow,
  nearTerm: "today" | "tomorrow"
): string {
  const head = `❌ ยกเลิกการประชุม (${NEAR_LABEL[nearTerm]})`;
  const lines = [
    `🕐 ${formatThaiTimeRange(r.start_time, r.end_time)} | ${r.room_name}`,
    r.title,
    `[${r.ref_id}]`,
    "ไม่ต้องเตรียมห้องนี้แล้ว",
  ];
  return `${head}\n${lines.join("\n")}`;
}

export interface DigestGateConfig {
  housekeeping_enabled: boolean;
  housekeeping_line_group_id: string | null;
  housekeeping_digest_hour: number;
  housekeeping_digest_last_sent_on: string | null;
}

export function shouldSendDigestNow(
  cfg: DigestGateConfig,
  nowIso: string
): boolean {
  if (!cfg.housekeeping_enabled) return false;
  if (!cfg.housekeeping_line_group_id) return false;
  if (bangkokHour(nowIso) !== cfg.housekeeping_digest_hour) return false;
  if (cfg.housekeeping_digest_last_sent_on === bangkokDateString(nowIso)) return false;
  return true;
}
```

- [ ] **Step 4: รันเทสต์ให้ PASS**

Run: `npm run test -- housekeepingNotify`
Expected: PASS ทุกเคส

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/housekeepingNotify.ts supabase/functions/_shared/housekeepingNotify.test.ts
git commit -m "feat(housekeeping): pure formatters + digest gate logic"
```

---

### Task 3: `pushTextToGroup` transport ใน lineClient.ts

**Files:**
- Modify: `supabase/functions/_shared/lineClient.ts` (เพิ่มฟังก์ชันท้ายไฟล์ หลัง `replyText`)

**Interfaces:**
- Produces: `pushTextToGroup(groupId: string, text: string): Promise<void>` — POST LINE `/push` ด้วย `to: groupId`, throw เมื่อไม่ใช่ 2xx

- [ ] **Step 1: เพิ่มฟังก์ชัน**

ต่อท้าย `supabase/functions/_shared/lineClient.ts` (ใช้ `accessToken()` เดิมในไฟล์):
```ts
// ส่งข้อความ text เข้าห้องแชท/กลุ่ม (to = groupId) — ใช้กับกลุ่มแม่บ้าน
// Transport ล้วน (ทดสอบตอน live เหมือน pushFlex) — throw เมื่อไม่ใช่ 2xx
export async function pushTextToGroup(groupId: string, text: string): Promise<void> {
  const res = await fetch(`${LINE_API}/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken()}`,
    },
    body: JSON.stringify({ to: groupId, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    throw new Error(`LINE group push failed: ${res.status} ${await res.text()}`);
  }
}
```

- [ ] **Step 2: typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` (หรือ lint ที่โปรเจกต์ใช้)
Expected: ไม่มี error ใหม่จาก lineClient.ts
> ฟังก์ชันนี้เป็น transport (Deno fetch) — ไม่มี unit test ตาม pattern เดิมของ `pushFlex`/`replyText`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/lineClient.ts
git commit -m "feat(housekeeping): add pushTextToGroup transport to lineClient"
```

---

### Task 4: IO orchestration — ส่งเข้ากลุ่ม + near-term gating + digest

**Files:**
- Modify: `supabase/functions/_shared/notify.ts` (export `countLinePushesThisMonth` เพื่อ reuse ตัวนับ quota — กัน logic แตก 2 ชุด)
- Modify: `supabase/functions/_shared/housekeepingNotify.ts` (เพิ่มส่วน IO)
- Test: `supabase/functions/_shared/housekeepingNotify.test.ts` (เพิ่มเทสต์ orchestration ด้วย mock)
- Modify: `supabase/functions/_shared/mockClient.ts` (เพิ่ม `.order()`, `.lt()` builder methods)

**Interfaces:**
- Consumes: `pushTextToGroup` (Task 3), `logIntegration` จาก `./integrationLog.ts`, `countLinePushesThisMonth` จาก `./notify.ts`, pure fns จาก Task 2
- Produces:
  - `notifyHousekeepingApproved(client: SupabaseClient, bookingId: string): Promise<void>`
  - `notifyHousekeepingCancelled(client: SupabaseClient, bookingId: string): Promise<void>`
  - `sendHousekeepingDigest(client: SupabaseClient): Promise<void>`

- [ ] **Step 1: export ตัวนับ quota เดิม**

ใน `supabase/functions/_shared/notify.ts` เปลี่ยนบรรทัด:
```ts
async function countLinePushesThisMonth(client: SupabaseClient): Promise<number> {
```
เป็น:
```ts
export async function countLinePushesThisMonth(client: SupabaseClient): Promise<number> {
```
(logic ภายในคงเดิม — favor delivery, พังคืน 0)

- [ ] **Step 2: เพิ่ม builder methods ใน mockClient**

ใน `supabase/functions/_shared/mockClient.ts` เพิ่มใน object `builder` (หลัง `gte`):
```ts
      lt(key: string, value: unknown) {
        state.filters.push([key, value]);
        return builder;
      },
      order(_key: string, _opts?: unknown) {
        return builder;
      },
```

- [ ] **Step 3: เขียน failing tests (orchestration)**

เพิ่มท้าย `supabase/functions/_shared/housekeepingNotify.test.ts`:
```ts
import { makeClient, type DbCallContext } from "./mockClient.ts";
import {
  notifyHousekeepingApproved,
  notifyHousekeepingCancelled,
  sendHousekeepingDigest,
} from "./housekeepingNotify.ts";

// booking_detail row ที่ approved + near-term (start วันนี้เทียบ now ด้านล่าง)
const detailRow = (over: Record<string, unknown> = {}) => ({
  id: "bk-1",
  ref_id: "BK-20260724-001",
  room_name: "ห้องสภา",
  title: "ประชุม",
  activity: "x",
  attendees: 10,
  start_time: new Date(Date.now() + 3 * 3600_000).toISOString(), // อีก 3 ชม. = วันนี้เกือบทุกกรณี
  end_time: new Date(Date.now() + 5 * 3600_000).toISOString(),
  requester_name: "สมชาย",
  requester_department: "คณะครุ",
  notes_for_staff: null,
  current_step: 3,
  ...over,
});

const enabledCfg = {
  housekeeping_enabled: true,
  housekeeping_line_group_id: "Cxxxx",
  housekeeping_digest_hour: 17,
  housekeeping_digest_last_sent_on: null,
};

describe("notifyHousekeepingApproved (gating)", () => {
  it("ปิดใช้งาน → ไม่ส่ง (ไม่มี integration_health line push)", async () => {
    const { client, calls } = makeClient((ctx: DbCallContext) => {
      if (ctx.table === "booking_detail") return { data: detailRow(), error: null };
      if (ctx.table === "system_config")
        return { data: { ...enabledCfg, housekeeping_enabled: false }, error: null };
      return { data: null, error: null };
    });
    await notifyHousekeepingApproved(client as never, "bk-1");
    const linePush = calls.find(
      (c) => c.table === "integration_health" && (c.payload as Record<string, unknown>)?.service === "line"
    );
    expect(linePush).toBeUndefined();
  });

  it("เปิด + near-term → log line push success เข้า integration_health", async () => {
    const { client, calls } = makeClient((ctx: DbCallContext) => {
      if (ctx.table === "booking_detail") return { data: detailRow(), error: null };
      if (ctx.table === "system_config") return { data: enabledCfg, error: null };
      if (ctx.table === "integration_health" && ctx.op === "select") return { data: [], error: null };
      return { data: null, error: null };
    });
    // pushTextToGroup จะ throw (ไม่มี LINE_CHANNEL_ACCESS_TOKEN ใน test env) → คาดว่า log failed
    await notifyHousekeepingApproved(client as never, "bk-1");
    const lineLog = calls.find(
      (c) => c.table === "integration_health" && (c.payload as Record<string, unknown>)?.service === "line"
    );
    expect(lineLog).toBeDefined(); // ยิงเข้า branch ส่ง (สำเร็จหรือ failed ก็ log)
  });
});

describe("notifyHousekeepingCancelled (gating)", () => {
  it("current_step != 3 (ไม่เคย approved) → ไม่ส่ง", async () => {
    const { client, calls } = makeClient((ctx: DbCallContext) => {
      if (ctx.table === "booking_detail") return { data: detailRow({ current_step: 1 }), error: null };
      if (ctx.table === "system_config") return { data: enabledCfg, error: null };
      return { data: null, error: null };
    });
    await notifyHousekeepingCancelled(client as never, "bk-1");
    const lineLog = calls.find(
      (c) => c.table === "integration_health" && (c.payload as Record<string, unknown>)?.service === "line"
    );
    expect(lineLog).toBeUndefined();
  });
});

describe("sendHousekeepingDigest (time gate)", () => {
  it("ยังไม่ถึงชั่วโมงส่ง → ไม่ query booking_detail", async () => {
    const { client, calls } = makeClient((ctx: DbCallContext) => {
      if (ctx.table === "system_config")
        return { data: { ...enabledCfg, housekeeping_digest_hour: (new Date().getUTCHours() + 20) % 24 }, error: null };
      return { data: [], error: null };
    });
    await sendHousekeepingDigest(client as never);
    expect(calls.find((c) => c.table === "booking_detail")).toBeUndefined();
  });
});
```

- [ ] **Step 4: รันเทสต์ให้ FAIL**

Run: `npm run test -- housekeepingNotify`
Expected: FAIL — ฟังก์ชัน IO ยังไม่ถูก export

- [ ] **Step 5: เขียน IO implementation**

ก่อนอื่น ย้าย/รวม import ไว้บนสุดของ `supabase/functions/_shared/housekeepingNotify.ts` — แก้บรรทัด import เดิม (จาก Task 2) ให้เป็น:
```ts
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatThaiDate, formatThaiTimeRange } from "./notify.ts";
import { countLinePushesThisMonth } from "./notify.ts";
import { logIntegration } from "./integrationLog.ts";
import { pushTextToGroup } from "./lineClient.ts";
```

จากนั้นเพิ่มส่วน IO **ท้ายไฟล์** (ต่อจาก `shouldSendDigestNow`):
```ts
const DETAIL_COLS =
  "id, ref_id, room_name, title, activity, attendees, start_time, end_time, requester_name, requester_department, notes_for_staff, current_step";

interface HousekeepingConfigRow extends DigestGateConfig {}

async function loadConfig(client: SupabaseClient): Promise<HousekeepingConfigRow | null> {
  try {
    const { data, error } = await client
      .from("system_config")
      .select(
        "housekeeping_enabled, housekeeping_line_group_id, housekeeping_digest_hour, housekeeping_digest_last_sent_on"
      )
      .single();
    if (error || !data) return null;
    return data as HousekeepingConfigRow;
  } catch (err) {
    console.error("[housekeeping] loadConfig", err);
    return null;
  }
}

async function loadDetail(
  client: SupabaseClient,
  bookingId: string
): Promise<(HousekeepingRow & { current_step: number }) | null> {
  try {
    const { data, error } = await client
      .from("booking_detail")
      .select(DETAIL_COLS)
      .eq("id", bookingId)
      .single();
    if (error || !data) return null;
    return data as HousekeepingRow & { current_step: number };
  } catch (err) {
    console.error("[housekeeping] loadDetail", err);
    return null;
  }
}

// ส่ง text เข้ากลุ่ม ถ้าเปิดใช้งาน + มี group id + quota ไม่เต็ม — log ทุกกรณี ไม่ throw
async function sendToHousekeepingGroup(
  client: SupabaseClient,
  cfg: HousekeepingConfigRow,
  text: string
): Promise<void> {
  if (!cfg.housekeeping_enabled || !cfg.housekeeping_line_group_id) return;
  try {
    const sent = await countLinePushesThisMonth(client);
    if (sent >= 500) {
      await logIntegration(client, {
        service: "internal",
        status: "success",
        payload: { skipped: "line_quota", sent, target: "housekeeping" },
      });
      return;
    }
    await pushTextToGroup(cfg.housekeeping_line_group_id, text);
    await logIntegration(client, {
      service: "line",
      status: "success",
      payload: { kind: "push", target: "housekeeping" },
    });
  } catch (err) {
    console.error("[housekeeping] sendToGroup", err);
    await logIntegration(client, {
      service: "line",
      status: "failed",
      payload: { kind: "push", target: "housekeeping" },
      error_detail: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function notifyHousekeepingApproved(
  client: SupabaseClient,
  bookingId: string
): Promise<void> {
  try {
    const cfg = await loadConfig(client);
    if (!cfg || !cfg.housekeeping_enabled || !cfg.housekeeping_line_group_id) return;
    const d = await loadDetail(client, bookingId);
    if (!d) return;
    const near = isNearTerm(d.start_time, new Date().toISOString());
    if (!near) return;
    await sendToHousekeepingGroup(client, cfg, buildApprovedMessage(d, near));
  } catch (err) {
    console.error("[notifyHousekeepingApproved]", err);
  }
}

export async function notifyHousekeepingCancelled(
  client: SupabaseClient,
  bookingId: string
): Promise<void> {
  try {
    const cfg = await loadConfig(client);
    if (!cfg || !cfg.housekeeping_enabled || !cfg.housekeeping_line_group_id) return;
    const d = await loadDetail(client, bookingId);
    if (!d) return;
    // แจ้งยกเลิกเฉพาะ booking ที่เคยผ่าน chain ครบ (current_step === 3) — แม่บ้านเคยรับข้อมูลไปแล้ว
    if (d.current_step !== 3) return;
    const near = isNearTerm(d.start_time, new Date().toISOString());
    if (!near) return;
    await sendToHousekeepingGroup(client, cfg, buildCancelledMessage(d, near));
  } catch (err) {
    console.error("[notifyHousekeepingCancelled]", err);
  }
}

export async function sendHousekeepingDigest(client: SupabaseClient): Promise<void> {
  try {
    const cfg = await loadConfig(client);
    if (!cfg) return;
    const nowIso = new Date().toISOString();
    if (!shouldSendDigestNow(cfg, nowIso)) return;

    const tomorrow = addDaysISODate(bangkokDateString(nowIso), 1);
    const startBound = `${tomorrow}T00:00:00+07:00`;
    const endBound = `${addDaysISODate(tomorrow, 1)}T00:00:00+07:00`;

    const { data, error } = await client
      .from("booking_detail")
      .select(DETAIL_COLS)
      .eq("final_status", "approved")
      .gte("start_time", startBound)
      .lt("start_time", endBound)
      .order("start_time", { ascending: true });

    if (error) {
      console.error("[housekeeping] digest query", error);
      return;
    }

    const rows = (data ?? []) as HousekeepingRow[];
    await sendToHousekeepingGroup(client, cfg, buildDigestMessage(rows, startBound));

    // guard กันส่งซ้ำวันนี้ (ทำหลังส่ง เพื่อ retry ได้ถ้าชั่วโมงยังไม่ผ่าน)
    await client
      .from("system_config")
      .update({ housekeeping_digest_last_sent_on: bangkokDateString(nowIso) })
      .eq("housekeeping_enabled", true);
  } catch (err) {
    console.error("[sendHousekeepingDigest]", err);
  }
}
```

- [ ] **Step 6: รันเทสต์ให้ PASS**

Run: `npm run test -- housekeepingNotify`
Expected: PASS ทุกเคส (pure + orchestration)

- [ ] **Step 7: รันเทสต์ทั้ง suite กันของเดิมพัง**

Run: `npm run test`
Expected: PASS ทั้งหมด (โดยเฉพาะ `notify` ที่แก้ export และ mockClient ที่เพิ่ม method)

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/housekeepingNotify.ts supabase/functions/_shared/housekeepingNotify.test.ts supabase/functions/_shared/notify.ts supabase/functions/_shared/mockClient.ts
git commit -m "feat(housekeeping): IO orchestration — group send, near-term gate, digest"
```

---

### Task 5: Edge function `send-housekeeping-digest`

**Files:**
- Create: `supabase/functions/send-housekeeping-digest/index.ts`

**Interfaces:**
- Consumes: `sendHousekeepingDigest` (Task 4), `withErrorHandling`

- [ ] **Step 1: เขียน edge function**

`supabase/functions/send-housekeeping-digest/index.ts` (โครงตาม `check-make-quota/index.ts`):
```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { sendHousekeepingDigest } from "../_shared/housekeepingNotify.ts";

// send-housekeeping-digest: เรียกจาก pg_cron รายชั่วโมง (Bearer = SERVICE_ROLE_KEY)
// ตัวฟังก์ชันเช็คเวลา (Asia/Bangkok) + guard กันส่งซ้ำเอง — sendHousekeepingDigest ไม่ throw
Deno.serve(
  withErrorHandling(async (_req: Request) => {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await sendHousekeepingDigest(adminClient);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
```

- [ ] **Step 2: deploy**

รัน `deploy_edge_function` (MCP) name=`send-housekeeping-digest` พร้อมเนื้อไฟล์ (verify_jwt=true — เรียกด้วย service role Bearer เท่านั้น)
Verify: `list_edge_functions` เห็น `send-housekeeping-digest`

- [ ] **Step 3: smoke test นอกเวลาส่ง**

รัน (curl หรือ MCP): POST `<SUPABASE_URL>/functions/v1/send-housekeeping-digest` header `Authorization: Bearer <SERVICE_ROLE_KEY>`
Expected: `{"ok":true}` และ (นอกชั่วโมงส่ง) ไม่มีแถว integration_health line push ใหม่ — ตรวจ `get_logs` service=edge-function ไม่มี error

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-housekeeping-digest/index.ts
git commit -m "feat(housekeeping): send-housekeeping-digest edge function"
```

---

### Task 6: Hook เข้า flow เดิม (approved / cancelled)

**Files:**
- Modify: `supabase/functions/_shared/bookingNotify.ts`

**Interfaces:**
- Consumes: `notifyHousekeepingApproved`, `notifyHousekeepingCancelled` (Task 4)

- [ ] **Step 1: import**

ต้นไฟล์ `supabase/functions/_shared/bookingNotify.ts` เพิ่ม:
```ts
import { notifyHousekeepingApproved, notifyHousekeepingCancelled } from "./housekeepingNotify.ts";
```

- [ ] **Step 2: hook approved**

ใน `notifyApprovalOutcome`, บล็อก `if (result.finalStatus === "approved") { ... }` — หลัง `await notifyAndLog(...)` และก่อน `return;` เพิ่ม:
```ts
      await notifyHousekeepingApproved(client, bookingId);
```
(ผลลัพธ์: booking ที่ผ่าน chain ครบ + start วันนี้/พรุ่งนี้ → เข้ากลุ่มแม่บ้าน; ตัวฟังก์ชัน self-gate near-term/config เอง)

- [ ] **Step 3: hook cancelled (อนุมัติคำขอยกเลิก)**

ใน `notifyCancellationDecision`, บล็อก `if (decision === "approve") { ... }` — หลัง `await notifyAndLog(...)` เพิ่ม:
```ts
      await notifyHousekeepingCancelled(client, bookingId);
```

- [ ] **Step 4: hook cancelled (Admin ยกเลิกตรง)**

ใน `notifyBookingCancelledByAdmin`, หลัง `await notifyAndLog(...)` (ก่อนปิด try) เพิ่ม:
```ts
    await notifyHousekeepingCancelled(client, bookingId);
```
(ตัวฟังก์ชัน self-gate `current_step === 3` → ยิงเฉพาะเคสที่เคย approved เท่านั้น pending ที่ Admin ยกเลิกจะไม่เข้ากลุ่ม)

- [ ] **Step 5: รันเทสต์ + typecheck**

Run: `npm run test`
Expected: PASS (ของเดิมไม่พัง — การเพิ่ม fire-and-forget call ไม่กระทบ assertion เดิม)

- [ ] **Step 6: redeploy edge functions ที่ใช้ bookingNotify**

`deploy_edge_function` ใหม่สำหรับ: `approve-booking`, `decide-cancellation`, `direct-cancel-booking` (ทั้ง 3 import bookingNotify — Supabase bundle รวม `_shared` ตอน deploy จึงต้อง redeploy ให้ได้โค้ดใหม่)
Verify: `list_edge_functions` แสดง updated_at เปลี่ยน

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/bookingNotify.ts
git commit -m "feat(housekeeping): hook approved/cancelled into booking notify flow"
```

---

### Task 7: `notes_for_staff` — create-booking + หน้า /booking

**Files:**
- Modify: `supabase/functions/create-booking/index.ts`
- Modify: `app/(app)/booking/page.tsx`

**Interfaces:**
- Produces: create-booking รับ field `notes_for_staff?: string` และบันทึกลง bookings

- [ ] **Step 1: create-booking รับ field**

ใน `supabase/functions/create-booking/index.ts`:
เพิ่มใน `interface CreateBookingRequest`:
```ts
  notes_for_staff?: string;
```
ใน `.insert({ ... })` เพิ่มบรรทัด (ตัด whitespace, จำกัด 500 ตัวอักษร, ว่าง→null):
```ts
        notes_for_staff:
          body.notes_for_staff && body.notes_for_staff.trim()
            ? body.notes_for_staff.trim().slice(0, 500)
            : null,
```

- [ ] **Step 2: deploy create-booking**

`deploy_edge_function` name=`create-booking` พร้อมเนื้อไฟล์ใหม่

- [ ] **Step 3: เพิ่ม state + textarea ในหน้า /booking**

ใน `app/(app)/booking/page.tsx`:
หลัง `const [activity, setActivity] = useState("");` เพิ่ม:
```tsx
  const [notesForStaff, setNotesForStaff] = useState("");
```
ใน `body: JSON.stringify({ ... })` ของ `handleSubmit` เพิ่ม:
```tsx
          notes_for_staff: notesForStaff,
```
ใน step 2 (หลัง `<label>...รายละเอียดกิจกรรม...</label>` block ปิด `</label>` ของ activity) เพิ่ม textarea ใหม่ ใช้ token เดียวกับ field เดิม:
```tsx
                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  หมายเหตุถึงแม่บ้าน (การจัดห้อง / อุปกรณ์ / น้ำ)
                  <textarea
                    value={notesForStaff}
                    onChange={(e) => setNotesForStaff(e.target.value)}
                    maxLength={500}
                    placeholder="เช่น จัดโต๊ะรูปตัว U + เตรียมน้ำ 25 ที่ (ไม่บังคับ)"
                    className="rounded-sm border border-neutral-300 px-3 py-2"
                  />
                </label>
```
> field นี้ไม่บังคับ — ไม่ต้องเพิ่มใน `disabled={...}` ของปุ่มยืนยัน

- [ ] **Step 4: verify ในเบราว์เซอร์**

รัน dev server (preview_start), ไปหน้า `/booking`, ค้นหาห้อง → เลือกห้อง → step 2 เห็น textarea "หมายเหตุถึงแม่บ้าน"; กรอกแล้วยืนยันได้สำเร็จ (preview_snapshot ยืนยันมี field, preview_screenshot ยืนยัน layout)

- [ ] **Step 5: verify DB**

`execute_sql`: `select notes_for_staff from bookings order by created_at desc limit 1;`
Expected: ค่าที่กรอก (หรือ null ถ้าเว้นว่าง)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/create-booking/index.ts "app/(app)/booking/page.tsx"
git commit -m "feat(housekeeping): notes_for_staff field on booking form + create-booking"
```

---

### Task 8: ตั้งค่าแจ้งเตือนแม่บ้าน — edge function + /dashboard/settings

**Files:**
- Create: `supabase/functions/update-housekeeping-settings/index.ts`
- Modify: `app/(app)/dashboard/settings/page.tsx`

**Interfaces:**
- Produces: POST `/functions/v1/update-housekeeping-settings` body `{ housekeeping_enabled: boolean; housekeeping_line_group_id: string | null; housekeeping_digest_hour: number }` (admin เท่านั้น)

- [ ] **Step 1: เขียน edge function**

`supabase/functions/update-housekeeping-settings/index.ts` (โครง auth ตาม `update-notification-settings/index.ts`):
```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { ForbiddenError, UnauthorizedError, ValidationError } from "../_shared/errors.ts";

interface Body {
  housekeeping_enabled: boolean;
  housekeeping_line_group_id: string | null;
  housekeeping_digest_hour: number;
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

    if (typeof body.housekeeping_enabled !== "boolean") {
      throw new ValidationError("ค่าเปิด/ปิดไม่ถูกต้อง");
    }
    if (
      !Number.isInteger(body.housekeeping_digest_hour) ||
      body.housekeeping_digest_hour < 0 ||
      body.housekeeping_digest_hour > 23
    ) {
      throw new ValidationError("ชั่วโมงส่งต้องอยู่ระหว่าง 0–23");
    }
    const groupId =
      body.housekeeping_line_group_id && body.housekeeping_line_group_id.trim()
        ? body.housekeeping_line_group_id.trim()
        : null;
    if (body.housekeeping_enabled && !groupId) {
      throw new ValidationError("กรุณากรอก LINE Group ID ก่อนเปิดใช้งาน");
    }

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

    const { data: config, error: configError } = await adminClient
      .from("system_config")
      .select("id")
      .single();
    if (configError || !config) throw new ValidationError("ไม่พบข้อมูลการตั้งค่าระบบ");

    const { data: updated, error: updateError } = await adminClient
      .from("system_config")
      .update({
        housekeeping_enabled: body.housekeeping_enabled,
        housekeeping_line_group_id: groupId,
        housekeeping_digest_hour: body.housekeeping_digest_hour,
      })
      .eq("id", config.id)
      .select("housekeeping_enabled, housekeeping_line_group_id, housekeeping_digest_hour")
      .single();
    if (updateError) throw updateError;

    await adminClient.from("activity_logs").insert({
      actor_id: user.id,
      action: "update_housekeeping_settings",
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

- [ ] **Step 2: deploy**

`deploy_edge_function` name=`update-housekeeping-settings`
Verify: `list_edge_functions` เห็นฟังก์ชันใหม่

- [ ] **Step 3: เพิ่ม state + โหลดค่าในหน้า settings**

ใน `app/(app)/dashboard/settings/page.tsx`:
เพิ่ม state (ใกล้ `const [lineEnabled...]`):
```tsx
  const [hkEnabled, setHkEnabled] = useState(false);
  const [hkGroupId, setHkGroupId] = useState("");
  const [hkDigestHour, setHkDigestHour] = useState("17");
  const [hkSaving, setHkSaving] = useState(false);
  const [hkError, setHkError] = useState<string | null>(null);
  const [hkSuccess, setHkSuccess] = useState<string | null>(null);
```
ใน `loadSettings()` — เพิ่ม column ใน `.select(...)` ของ `system_config`:
```
, housekeeping_enabled, housekeeping_line_group_id, housekeeping_digest_hour
```
และหลัง `setLineEnabled(...)` เพิ่ม:
```tsx
    setHkEnabled(configRes.data.housekeeping_enabled ?? false);
    setHkGroupId(configRes.data.housekeeping_line_group_id ?? "");
    setHkDigestHour(String(configRes.data.housekeeping_digest_hour ?? 17));
```

- [ ] **Step 4: เพิ่ม save handler**

หลังฟังก์ชัน `handleSaveNotif()` เพิ่ม:
```tsx
  async function handleSaveHousekeeping() {
    setHkSaving(true);
    setHkError(null);
    setHkSuccess(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setHkError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setHkSaving(false);
      return;
    }
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-housekeeping-settings`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            housekeeping_enabled: hkEnabled,
            housekeeping_line_group_id: hkGroupId,
            housekeeping_digest_hour: Number(hkDigestHour),
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        setHkError(result.message ?? "บันทึกไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      setHkSuccess("บันทึกการตั้งค่าแจ้งเตือนแม่บ้านสำเร็จ");
      await loadSettings();
    } catch {
      setHkError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setHkSaving(false);
    }
  }
```

- [ ] **Step 5: เพิ่ม UI section**

ก่อน `<EditorialCard>` ของ "ช่องทางแจ้งเตือน (เปิด/ปิดทั้งระบบ)" (หรือหลัง — ตำแหน่งใดก็ได้ในบล็อก `!loading`) เพิ่มการ์ดใหม่ ใช้ token เดียวกับการ์ดอื่น:
```tsx
          <EditorialCard>
            <EditorialCard.Section>
            <SectionTitle>แจ้งเตือนกลุ่มแม่บ้าน (LINE)</SectionTitle>
            <p className="mt-1 text-sm text-text-secondary">
              ส่งสรุปห้องประชุมพรุ่งนี้ และแจ้งอนุมัติ/ยกเลิกของวันนี้–พรุ่งนี้ เข้ากลุ่ม LINE แม่บ้าน
            </p>
            <div className="mt-3 space-y-3">
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={hkEnabled}
                  onChange={(e) => setHkEnabled(e.target.checked)}
                />
                เปิดใช้งานการแจ้งเตือนกลุ่มแม่บ้าน
              </label>
              <div>
                <label className="text-sm text-text-secondary">LINE Group ID</label>
                <input
                  type="text"
                  value={hkGroupId}
                  onChange={(e) => setHkGroupId(e.target.value)}
                  placeholder="เช่น Cxxxxxxxxxxxxxxxx"
                  className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
                />
                <p className="mt-1 text-xs text-text-muted">
                  เชิญ LINE OA เข้ากลุ่มแม่บ้านก่อน แล้วดู Group ID ได้ที่หน้าเชื่อมต่อระบบ (Integration Health)
                </p>
              </div>
              <div>
                <label className="text-sm text-text-secondary">เวลาส่งสรุปพรุ่งนี้ (ชม.)</label>
                <select
                  value={hkDigestHour}
                  onChange={(e) => setHkDigestHour(e.target.value)}
                  className="mt-1 w-28 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={String(h)}>
                      {String(h).padStart(2, "0")}:00 น.
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {hkError && <p className="mt-3 text-sm text-danger-text">{hkError}</p>}
            {hkSuccess && <p className="mt-3 text-sm text-success-text">{hkSuccess}</p>}
            <Button onClick={handleSaveHousekeeping} disabled={hkSaving} className="mt-3">
              {hkSaving ? "กำลังบันทึก..." : "บันทึกการตั้งค่าแม่บ้าน"}
            </Button>
            </EditorialCard.Section>
          </EditorialCard>
```

- [ ] **Step 6: verify ในเบราว์เซอร์**

`/dashboard/settings` (ล็อกอิน admin): เห็นการ์ด "แจ้งเตือนกลุ่มแม่บ้าน (LINE)"; ลองเปิด toggle โดยเว้น Group ID → กดบันทึก → ขึ้น error "กรุณากรอก LINE Group ID ก่อนเปิดใช้งาน"; กรอก Group ID + เลือกเวลา + บันทึก → success (preview_snapshot/preview_screenshot ยืนยัน)

- [ ] **Step 7: verify DB**

`execute_sql`: `select housekeeping_enabled, housekeeping_line_group_id, housekeeping_digest_hour from system_config;`
Expected: ค่าที่บันทึก

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/update-housekeeping-settings/index.ts "app/(app)/dashboard/settings/page.tsx"
git commit -m "feat(housekeeping): settings — enable/group id/digest hour"
```

---

### Task 9: line-webhook ดัก group ID จาก event join

**Files:**
- Modify: `supabase/functions/line-webhook/index.ts`

**Interfaces:**
- Consumes: `logIntegration` จาก `../_shared/integrationLog.ts`

- [ ] **Step 1: import + ขยาย type**

ใน `supabase/functions/line-webhook/index.ts`:
เพิ่ม import:
```ts
import { logIntegration } from "../_shared/integrationLog.ts";
```
ใน `interface LineEvent` ขยาย `source`:
```ts
  source?: { userId?: string; type?: string; groupId?: string };
```

- [ ] **Step 2: จัดการ event join**

ใน `handleEvent`, ก่อนบล็อก `// event อื่น` เพิ่ม:
```ts
  // join: OA ถูกเชิญเข้ากลุ่ม/ห้อง → log groupId ให้ Admin คัดลอกไปตั้งค่าแม่บ้าน
  if (event.type === "join" && event.source?.groupId) {
    await logIntegration(client, {
      service: "line",
      status: "success",
      payload: { kind: "group_join", groupId: event.source.groupId },
    });
    return;
  }
```
> ไม่ reply ในกลุ่ม (กันโควตา/รบกวน) — แค่ log ให้ Admin ดูที่ /dashboard/integrations

- [ ] **Step 3: deploy**

`deploy_edge_function` name=`line-webhook` (verify_jwt=false ตามเดิม — LINE เรียกด้วย signature)

- [ ] **Step 4: verify (live)**

เชิญ LINE OA เข้ากลุ่มทดสอบ → `execute_sql`:
```sql
select payload from integration_health
where service='line' and payload->>'kind'='group_join'
order by created_at desc limit 1;
```
Expected: `{"kind":"group_join","groupId":"Cxxxx"}`
> ถ้ายังไม่มีกลุ่มทดสอบ ข้ามการ verify live ได้ — logic ตรงไปตรงมา

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/line-webhook/index.ts
git commit -m "feat(housekeeping): capture group id on LINE join event"
```

---

## End-to-End Verification (หลังทำครบทุก Task)

- [ ] **E2E-1: ตั้งค่าจริง** — เชิญ OA เข้ากลุ่มแม่บ้าน → คัดลอก group ID จาก integration_health → กรอกที่ /dashboard/settings → เปิด toggle + ตั้งชั่วโมงส่งเป็นชั่วโมงปัจจุบัน (Asia/Bangkok)
- [ ] **E2E-2: digest** — เรียก `send-housekeeping-digest` ด้วย service role → กลุ่มได้รับสรุปห้องพรุ่งนี้ (หรือ "ไม่มีการใช้ห้องประชุม"); เรียกซ้ำในชั่วโมงเดิม → ไม่ส่งซ้ำ (guard `housekeeping_digest_last_sent_on`)
- [ ] **E2E-3: approved near-term** — สร้าง booking วันพรุ่งนี้ + notes_for_staff → อนุมัติครบ chain → กลุ่มได้รับการ์ด ✅ พร้อม 📝
- [ ] **E2E-4: approved far-future** — สร้าง booking อีก 2 สัปดาห์ → อนุมัติครบ → กลุ่ม **ไม่** ได้รับ (near-term gate)
- [ ] **E2E-5: cancelled near-term** — Admin ยกเลิก approved booking ของพรุ่งนี้ → กลุ่มได้รับการ์ด ❌ "ไม่ต้องเตรียมห้องนี้แล้ว"
- [ ] **E2E-6: quota** — ตรวจ `get_advisors` (security/performance หลัง migrate) + `integration_monthly_usage` เห็น line push เพิ่มตามจำนวนจริง ไม่มี error ค้าง

## Self-Review Notes (ผู้เขียน plan ตรวจแล้ว)

- **Spec coverage:** เหตุการณ์ A/B/C → Task 5+4 / Task 6+4 / Task 6+4; schema → Task 1; notes_for_staff → Task 1+7; settings → Task 8; group id capture → Task 9; ครบทุกหัวข้อใน spec §2–§7
- **near-term นิยาม:** วันนี้+พรุ่งนี้ (ตามที่ผู้ใช้ยืนยัน) — `isNearTerm` คืน today/tomorrow ทั้งคู่ trigger; digest query เฉพาะพรุ่งนี้
- **Type consistency:** `HousekeepingRow`, `DigestGateConfig`, ชื่อฟังก์ชัน (`notifyHousekeepingApproved/Cancelled`, `sendHousekeepingDigest`, `pushTextToGroup`, `countLinePushesThisMonth`) ตรงกันทุก task
- **quota:** group push log `{kind:'push'}` เพื่อให้ `countLinePushesThisMonth` (filter `payload->>kind='push'`) นับถูก — ไม่แตก logic 2 ชุด
