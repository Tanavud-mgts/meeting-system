# Track D (sub-project 5) — จัดการข้อมูล Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างหน้า `/dashboard/data` ให้ Admin export ข้อมูลเป็น CSV, แก้ retention settings ของ log, และล้าง log เก่าได้ทันที

**Architecture:** 3 Edge Function แยกกันตามหลัก "หนึ่ง Edge Function ทำหนึ่งอย่าง" (`export-data`, `update-retention-settings`, `cleanup-logs-now`) + หน้าเดียว 3 ส่วน (Export/Retention/Danger Zone)

**Tech Stack:** Next.js 16 App Router (client component), Supabase Edge Function (Deno), `@supabase/supabase-js@2`

## Global Constraints

- **Design tokens เท่านั้น** (CLAUDE.md กฎข้อ 10)
- **ข้อความ UI ภาษาไทยทางการ** (CLAUDE.md กฎข้อ 9)
- **ทุก Edge Function ห่อด้วย `withErrorHandling()`** จาก `_shared/handler.ts`, throw `AppError` subclass จาก `_shared/errors.ts` เท่านั้น (CLAUDE.md กฎข้อ 1)
- **ทุก `fetch()` ไปยัง Edge Function จาก client ต้องห่อด้วย `try/catch/finally` เสมอ** (บทเรียนจาก sub-project 1's final review) — `finally` ต้อง reset submitting/loading state, `catch` ต้องแสดงข้อความ error ภาษาไทย
- **CSV ไม่ใช้ library ภายนอก** — สร้าง string เองด้วยการ escape ตาม RFC 4180 (ครอบด้วย `"` และ double-up `"` ถ้าค่ามี comma/quote/newline)
- **`cleanup_old_logs()` เป็นฟังก์ชันที่มีอยู่แล้ว** จาก migration 011 — เรียกผ่าน `.rpc()` ตรงๆ ไม่ต้องเขียน logic ลบเอง
- **`export-data`/`update-retention-settings`/`cleanup-logs-now` ทั้ง 3 ต้องเป็น admin เท่านั้น** — ตรวจ role จากตาราง `users` เหมือน Edge Function อื่นในโปรเจกต์
- **ไม่ต้องแก้ `lib/supabase/middleware.ts`** — prefix `/dashboard` → `["admin"]` ที่มีอยู่แล้วครอบคลุม `/dashboard/data`
- **ไม่ต้องเพิ่ม `"supabase/functions"` เข้า tsconfig.json exclude อีก** — ทำไปแล้วในเวิร์กทรีนี้ตั้งแต่ sub-project 1
- **ไม่มี Deno CLI / Supabase CLI / Supabase MCP ในเซสชันนี้** — Edge Function `.ts` verify ด้วย manual code review + `npx tsc --noEmit`/`npm run build` (เฉพาะไฟล์ frontend) เท่านั้น

## File Structure

| File | หน้าที่ |
|---|---|
| `supabase/functions/export-data/index.ts` | Edge Function สร้าง CSV ตาม dataset ที่ขอ |
| `supabase/functions/update-retention-settings/index.ts` | Edge Function แก้ retention period ใน `system_config` |
| `supabase/functions/cleanup-logs-now/index.ts` | Edge Function เรียก `cleanup_old_logs()` ทันที |
| `supabase/config.toml` | เพิ่ม `[functions.*]` พร้อม `verify_jwt=true` ให้ทั้ง 3 ฟังก์ชัน |
| `app/(app)/dashboard/data/page.tsx` | หน้าจัดการข้อมูล — Export/Retention/Danger Zone |

---

### Task 1: `export-data` Edge Function

**Files:**
- Create: `supabase/functions/export-data/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `withErrorHandling()` จาก `../_shared/handler.ts`, `ForbiddenError`/`UnauthorizedError`/`ValidationError` จาก `../_shared/errors.ts`
- Produces: HTTP endpoint `POST /functions/v1/export-data` รับ `{ dataset: 'bookings' | 'approval_history' | 'users' }` คืน CSV response พร้อม `Content-Disposition: attachment`

- [ ] **Step 1: สร้างไฟล์**

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../_shared/errors.ts";

type Dataset = "bookings" | "approval_history" | "users";

interface ExportDataBody {
  dataset: Dataset;
}

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.map(csvEscape).join(",");
  const dataLines = rows.map((row) =>
    headers.map((h) => csvEscape(row[h])).join(",")
  );
  return [headerLine, ...dataLines].join("\r\n");
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

    const body: ExportDataBody = await req.json();

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
      throw new ForbiddenError("ท่านไม่มีสิทธิ์ดำเนินการนี้");
    }

    if (
      body.dataset !== "bookings" &&
      body.dataset !== "approval_history" &&
      body.dataset !== "users"
    ) {
      throw new ValidationError("ประเภทข้อมูลไม่ถูกต้อง");
    }

    let headers: string[];
    let rows: Record<string, unknown>[];

    if (body.dataset === "bookings") {
      const { data, error } = await adminClient
        .from("booking_detail")
        .select(
          "ref_id, title, room_name, requester_name, requester_department, final_status, start_time, end_time, attendees, created_at"
        );
      if (error) throw error;
      headers = [
        "ref_id",
        "title",
        "room_name",
        "requester_name",
        "requester_department",
        "final_status",
        "start_time",
        "end_time",
        "attendees",
        "created_at",
      ];
      rows = data ?? [];
    } else if (body.dataset === "approval_history") {
      const { data, error } = await adminClient
        .from("staff_activity_timeline")
        .select("actor_name, related_ref, sub_type, detail, occurred_at")
        .eq("event_type", "approval");
      if (error) throw error;
      headers = [
        "actor_name",
        "related_ref",
        "sub_type",
        "detail",
        "occurred_at",
      ];
      rows = data ?? [];
    } else {
      const { data, error } = await adminClient
        .from("users")
        .select("full_name, email, role, department, created_at");
      if (error) throw error;
      headers = ["full_name", "email", "role", "department", "created_at"];
      rows = data ?? [];
    }

    const csv = toCsv(headers, rows);
    const dateStr = new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
      .replace(/-/g, "");

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${body.dataset}-${dateStr}.csv"`,
      },
    });
  })
);
```

- [ ] **Step 2: เพิ่ม declarative config ใน `supabase/config.toml`**

หาบรรทัดสุดท้ายของไฟล์ (`[functions.direct-cancel-booking]` block จาก sub-project 2) แล้วเพิ่มต่อท้ายไฟล์:

```toml

[functions.export-data]
verify_jwt = true
```

- [ ] **Step 3: ตรวจว่า type-check + build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ทั้งสองคำสั่งผ่าน

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/export-data/index.ts supabase/config.toml
git commit -m "feat: add export-data edge function"
```

---

### Task 2: `update-retention-settings` Edge Function

**Files:**
- Create: `supabase/functions/update-retention-settings/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `withErrorHandling()`, `ForbiddenError`/`UnauthorizedError`/`ValidationError`
- Produces: HTTP endpoint `POST /functions/v1/update-retention-settings` รับ `{ activity_log_retention_months, integration_log_retention_months, line_token_retention_days }` คืนแถว `system_config` ที่อัปเดตแล้ว

- [ ] **Step 1: สร้างไฟล์**

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../_shared/errors.ts";

interface UpdateRetentionSettingsBody {
  activity_log_retention_months: number;
  integration_log_retention_months: number;
  line_token_retention_days: number;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
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

    const body: UpdateRetentionSettingsBody = await req.json();

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
      throw new ForbiddenError("ท่านไม่มีสิทธิ์ดำเนินการนี้");
    }

    if (
      !isPositiveInteger(body.activity_log_retention_months) ||
      !isPositiveInteger(body.integration_log_retention_months) ||
      !isPositiveInteger(body.line_token_retention_days)
    ) {
      throw new ValidationError("ค่าที่กรอกต้องเป็นจำนวนเต็มบวก");
    }

    const { data: config, error: configError } = await adminClient
      .from("system_config")
      .select("id")
      .single();

    if (configError || !config) {
      throw new ValidationError("ไม่พบข้อมูลการตั้งค่าระบบ");
    }

    const { data: updated, error: updateError } = await adminClient
      .from("system_config")
      .update({
        activity_log_retention_months: body.activity_log_retention_months,
        integration_log_retention_months:
          body.integration_log_retention_months,
        line_token_retention_days: body.line_token_retention_days,
      })
      .eq("id", config.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
```

- [ ] **Step 2: เพิ่ม declarative config ใน `supabase/config.toml`**

เพิ่มต่อท้ายไฟล์ (ต่อจาก block ของ Task 1):

```toml

[functions.update-retention-settings]
verify_jwt = true
```

- [ ] **Step 3: ตรวจว่า type-check + build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ทั้งสองคำสั่งผ่าน

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/update-retention-settings/index.ts supabase/config.toml
git commit -m "feat: add update-retention-settings edge function"
```

---

### Task 3: `cleanup-logs-now` Edge Function

**Files:**
- Create: `supabase/functions/cleanup-logs-now/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `withErrorHandling()`, `ForbiddenError`/`UnauthorizedError`
- Produces: HTTP endpoint `POST /functions/v1/cleanup-logs-now` (ไม่มี body) คืน `{ success: true }`

- [ ] **Step 1: สร้างไฟล์**

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { ForbiddenError, UnauthorizedError } from "../_shared/errors.ts";

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
      throw new ForbiddenError("ท่านไม่มีสิทธิ์ดำเนินการนี้");
    }

    const { error: rpcError } = await adminClient.rpc("cleanup_old_logs");

    if (rpcError) throw rpcError;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
```

- [ ] **Step 2: เพิ่ม declarative config ใน `supabase/config.toml`**

เพิ่มต่อท้ายไฟล์ (ต่อจาก block ของ Task 2):

```toml

[functions.cleanup-logs-now]
verify_jwt = true
```

- [ ] **Step 3: ตรวจว่า type-check + build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ทั้งสองคำสั่งผ่าน

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/cleanup-logs-now/index.ts supabase/config.toml
git commit -m "feat: add cleanup-logs-now edge function"
```

---

### Task 4: หน้า `/dashboard/data`

**Files:**
- Create: `app/(app)/dashboard/data/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client`, Edge Functions `export-data`/`update-retention-settings`/`cleanup-logs-now` จาก Task 1-3
- Produces: route `/dashboard/data`

**คำเตือนสำคัญ:** สร้างไดเรกทอรีด้วยชื่อ `app/(app)/dashboard/data/` ให้ตรงเป๊ะ (วงเล็บเปิด-ปิดชิดกัน `(app)` ไม่มี `/` แทรก) — ไดเรกทอรี `app/(app)/dashboard/` มีอยู่แล้ว (มี `activity/`, `bookings/`, `rooms/`, `settings/`, `users/`, `page.tsx` จาก sub-project ก่อนหน้า) ใช้ `mkdir -p "app/(app)/dashboard/data"` เป็นคำสั่งเดียว **ห้ามสร้างไดเรกทอรี `(app)` ใหม่**

- [ ] **Step 1: สร้างไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Dataset = "bookings" | "approval_history" | "users";

const DATASET_LABEL: Record<Dataset, string> = {
  bookings: "การจอง",
  approval_history: "ประวัติการอนุมัติ",
  users: "ผู้ใช้",
};

export default function DashboardDataPage() {
  const [activityRetention, setActivityRetention] = useState("");
  const [integrationRetention, setIntegrationRetention] = useState("");
  const [lineTokenRetention, setLineTokenRetention] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [retentionSuccess, setRetentionSuccess] = useState<string | null>(
    null
  );
  const [retentionSubmitting, setRetentionSubmitting] = useState(false);
  const [exportingDataset, setExportingDataset] = useState<Dataset | null>(
    null
  );
  const [exportError, setExportError] = useState<string | null>(null);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  const [cleanupSubmitting, setCleanupSubmitting] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupSuccess, setCleanupSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      setLoadError(null);

      const supabase = createClient();
      const { data, error } = await supabase
        .from("system_config")
        .select(
          "activity_log_retention_months, integration_log_retention_months, line_token_retention_days"
        )
        .single();

      if (error || !data) {
        setLoadError("ไม่สามารถโหลดการตั้งค่าได้");
        return;
      }

      setActivityRetention(String(data.activity_log_retention_months));
      setIntegrationRetention(
        String(data.integration_log_retention_months)
      );
      setLineTokenRetention(String(data.line_token_retention_days));
    }

    loadConfig();
  }, []);

  async function handleExport(dataset: Dataset) {
    setExportingDataset(dataset);
    setExportError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setExportError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setExportingDataset(null);
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/export-data`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ dataset }),
        }
      );

      if (!res.ok) {
        const result = await res.json();
        setExportError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dataset}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setExportingDataset(null);
    }
  }

  async function handleRetentionSubmit() {
    setRetentionSubmitting(true);
    setRetentionError(null);
    setRetentionSuccess(null);

    const activityNum = Number(activityRetention);
    const integrationNum = Number(integrationRetention);
    const lineTokenNum = Number(lineTokenRetention);

    if (
      !Number.isInteger(activityNum) ||
      activityNum <= 0 ||
      !Number.isInteger(integrationNum) ||
      integrationNum <= 0 ||
      !Number.isInteger(lineTokenNum) ||
      lineTokenNum <= 0
    ) {
      setRetentionError("ค่าที่กรอกต้องเป็นจำนวนเต็มบวก");
      setRetentionSubmitting(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setRetentionError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setRetentionSubmitting(false);
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-retention-settings`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            activity_log_retention_months: activityNum,
            integration_log_retention_months: integrationNum,
            line_token_retention_days: lineTokenNum,
          }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        setRetentionError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        return;
      }

      setRetentionSuccess("บันทึกการตั้งค่าสำเร็จ");
    } catch {
      setRetentionError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setRetentionSubmitting(false);
    }
  }

  async function handleConfirmCleanup() {
    setCleanupSubmitting(true);
    setCleanupError(null);
    setCleanupSuccess(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setCleanupError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setCleanupSubmitting(false);
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cleanup-logs-now`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const result = await res.json();

      if (!res.ok) {
        setCleanupError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        return;
      }

      setCleanupSuccess("ล้าง log เก่าสำเร็จ");
      setCleanupConfirmOpen(false);
    } catch {
      setCleanupError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setCleanupSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        จัดการข้อมูล
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}

      <div className="mt-6 rounded-lg border border-neutral-200 bg-surface-card p-5">
        <p className="font-medium text-text-primary">Export ข้อมูล</p>
        {exportError && (
          <p className="mt-2 text-sm text-danger-text">{exportError}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-3">
          {(["bookings", "approval_history", "users"] as Dataset[]).map(
            (dataset) => (
              <button
                key={dataset}
                type="button"
                onClick={() => handleExport(dataset)}
                disabled={exportingDataset === dataset}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary disabled:opacity-50"
              >
                {exportingDataset === dataset
                  ? "กำลังสร้างไฟล์..."
                  : `Export ${DATASET_LABEL[dataset]} (CSV)`}
              </button>
            )
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-surface-card p-5">
        <p className="font-medium text-text-primary">Retention Settings</p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-sm text-text-secondary">
              เก็บ Activity Log กี่เดือน
            </label>
            <input
              type="number"
              min={1}
              value={activityRetention}
              onChange={(e) => setActivityRetention(e.target.value)}
              className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
          </div>
          <div>
            <label className="text-sm text-text-secondary">
              เก็บ Integration Log กี่เดือน
            </label>
            <input
              type="number"
              min={1}
              value={integrationRetention}
              onChange={(e) => setIntegrationRetention(e.target.value)}
              className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
          </div>
          <div>
            <label className="text-sm text-text-secondary">
              เก็บ LINE Token กี่วัน
            </label>
            <input
              type="number"
              min={1}
              value={lineTokenRetention}
              onChange={(e) => setLineTokenRetention(e.target.value)}
              className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
          </div>
        </div>
        {retentionError && (
          <p className="mt-2 text-sm text-danger-text">{retentionError}</p>
        )}
        {retentionSuccess && (
          <p className="mt-2 text-sm text-success-text">
            {retentionSuccess}
          </p>
        )}
        <button
          type="button"
          onClick={handleRetentionSubmit}
          disabled={retentionSubmitting}
          className="mt-3 rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
        >
          {retentionSubmitting ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>
      </div>

      <div className="mt-6 rounded-lg border border-danger-border bg-danger-surface p-5">
        <p className="font-medium text-danger-text">Danger Zone</p>
        <p className="mt-1 text-sm text-danger-text">
          การกระทำในส่วนนี้ไม่สามารถย้อนกลับได้
        </p>
        {cleanupError && (
          <p className="mt-2 text-sm text-danger-text">{cleanupError}</p>
        )}
        {cleanupSuccess && (
          <p className="mt-2 text-sm text-success-text">{cleanupSuccess}</p>
        )}
        <button
          type="button"
          onClick={() => setCleanupConfirmOpen(true)}
          className="mt-3 rounded-sm bg-danger-solid px-4 py-2 text-sm font-medium text-text-on-primary"
        >
          ล้าง log เก่าทันที
        </button>
      </div>

      {cleanupConfirmOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการล้าง log เก่า
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              การกระทำนี้จะลบ Activity Log และ Integration Log
              ที่เก่าเกินระยะเวลาที่ตั้งไว้ถาวร กู้คืนไม่ได้
              (ไม่กระทบประวัติการอนุมัติและการยกเลิก ซึ่งเก็บถาวรเสมอ)
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setCleanupConfirmOpen(false)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmCleanup}
                disabled={cleanupSubmitting}
                className="rounded-sm bg-danger-solid px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
              >
                {cleanupSubmitting ? "กำลังลบ..." : "ยืนยันลบ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build สำเร็จ, route list มี `/dashboard/data` (ตรวจด้วย `ls "app/(app)/dashboard/data/"` ก่อนด้วยว่ามีแค่ไฟล์นี้ ไม่มีไดเรกทอรี `(app` หรือ `(app/)` แปลกปลอมเกิดขึ้น)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/data/page.tsx"
git commit -m "feat: add dashboard data management page with export, retention, and danger zone"
```

---

### Task 5: Manual Verification (แบ่งเป็นส่วนที่ทดสอบได้ตอนนี้ กับส่วนที่รอ deploy)

**Files:** ไม่มี (verification เท่านั้น)

**ส่วนที่ทดสอบได้ตอนนี้ (ไม่ต้องพึ่ง Edge Function):**

- [ ] **Step 1: Build รวม**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่, route list มี `/dashboard/data`

- [ ] **Step 2: ทดสอบ `/dashboard/data` — login เป็น admin**

`npm run dev`, login ด้วย `admin@test.local`, เข้า `/dashboard/data`
Expected: เห็นค่า retention ปัจจุบันจาก seed data (`activity_log_retention_months`=6, `integration_log_retention_months`=6, `line_token_retention_days`=7) ในฟอร์ม

- [ ] **Step 3: ทดสอบ validation ฟอร์ม retention**

กรอกค่าติดลบ หรือ 0 หรือทศนิยม ในช่องใดช่องหนึ่ง → กด "บันทึกการตั้งค่า"
Expected: เห็นข้อความ "ค่าที่กรอกต้องเป็นจำนวนเต็มบวก" ไม่มีการเรียก fetch ออกไป (client-side validate ก่อน)

- [ ] **Step 4: ทดสอบ danger zone confirm dialog**

กด "ล้าง log เก่าทันที"
Expected: เห็น dialog ยืนยันพร้อมข้อความเตือนที่ระบุชัดว่า Activity/Integration Log ถูกลบ แต่ Approval/Cancellation Log ไม่ถูกแตะ — กด "ยกเลิก" ปิด dialog ได้ ไม่มีการเรียก fetch

- [ ] **Step 5: ทดสอบ middleware gate**

Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/dashboard/data` ตรงๆ ทาง URL
Expected: ถูก middleware redirect ไป `/home` ทันที (ครอบคลุมด้วย prefix `/dashboard` อยู่แล้ว ไม่ต้องแก้ middleware เพิ่ม)

**ส่วนที่ต้อง deploy Edge Function ก่อนถึงจะทดสอบได้จริง:**

- [ ] **Step 6: Deploy Edge Functions**

เซสชันนี้ไม่มี Deno CLI, ไม่มี Supabase CLI, และ Supabase MCP ไม่ได้เชื่อมต่อ — **ต้องให้ผู้ใช้ทำขั้นตอนนี้เอง**:
- Reconnect Supabase MCP แล้วใช้ `deploy_edge_function` กับ `export-data`, `update-retention-settings`, `cleanup-logs-now` (ทั้ง 3 `verify_jwt=true`)
- หรือติดตั้ง Supabase CLI แล้วรัน `supabase functions deploy` สำหรับทั้ง 3 ฟังก์ชัน

- [ ] **Step 7: ทดสอบ export จริง (หลัง deploy สำเร็จ)**

กด export ทั้ง 3 ปุ่มทีละปุ่ม
Expected: ได้ไฟล์ CSV ดาวน์โหลดลงเครื่อง เปิดด้วย Excel/text editor ตรวจว่ามี header ภาษาไทยและข้อมูลตรงกับ seed data (`bookings.csv` มี 4 แถว, `approval_history.csv` มี 7 แถว, `users.csv` มี 4 แถว)

- [ ] **Step 8: ทดสอบแก้ retention settings จริง (หลัง deploy สำเร็จ)**

แก้ค่าใดค่าหนึ่งแล้วกด "บันทึกการตั้งค่า"
Expected: เห็นข้อความ "บันทึกการตั้งค่าสำเร็จ" ตรวจใน DB ว่า `system_config` อัปเดตค่าตรงตามที่กรอก

- [ ] **Step 9: ทดสอบ "ล้าง log เก่าทันที" จริง (หลัง deploy สำเร็จ)**

กดยืนยันใน dialog
Expected: เห็นข้อความ "ล้าง log เก่าสำเร็จ" ตรวจใน DB ว่า `activity_logs`/`integration_health` ที่เก่าเกิน retention ถูกลบ แต่ `approval_logs`/`cancellation_logs` ยังอยู่ครบไม่ถูกแตะ

---

## Self-Review Notes

- **Spec coverage:** `export-data` → Task 1, `update-retention-settings` → Task 2, `cleanup-logs-now` → Task 3, หน้า `/dashboard/data` (3 ส่วน) → Task 4, success criteria ทั้ง 7 ข้อในสเปค → Task 5 ครบ (แบ่งทดสอบได้ตอนนี้ 5 ข้อ, รอ deploy 4 ข้อ — Step 7-9 ตรงกับสเปคข้อ 7 ที่แยกไว้ชัดเจนว่าต้องรอ deploy)
- **Placeholder scan:** ไม่มี TBD/TODO ที่ไม่มีเนื้อหา
- **Type consistency:** `Dataset` type ใช้ตรงกันทั้งใน Task 4's frontend และเทียบกับ literal union ที่ Task 1's backend validate (`'bookings' | 'approval_history' | 'users'`) — response shape `{ success: true }` ของ Task 3 และแถว `system_config` ที่คืนจาก Task 2 ไม่ได้ถูกอ่านค่าเจาะจงในหน้า (แค่เช็ค `res.ok` แล้วแสดงข้อความสำเร็จ) จึงไม่มีความเสี่ยง type mismatch
- **Middleware:** ไม่มี task แก้ `lib/supabase/middleware.ts` เพราะ prefix `/dashboard` ครอบคลุมอยู่แล้ว — ตรวจยืนยันด้วย Task 5 Step 5
- **Route-group directory bug (Track B lesson):** เพิ่มคำเตือนใน Task 4 ให้ตรวจ `ls "app/(app)/dashboard/..."` หลังสร้างไฟล์
- **บทเรียนจาก sub-project 1's final review (I-1) ถูกนำมาใช้ล่วงหน้าทุกจุด:** `handleExport()`, `handleRetentionSubmit()`, `handleConfirmCleanup()` ทั้ง 3 ฟังก์ชันใน Task 4 ห่อ fetch ด้วย try/catch/finally ตั้งแต่ต้น
- **CSV escaping:** ตรวจสอบแล้วว่า `csvEscape()` ใน Task 1 ครอบคลุมทั้ง 3 กรณีตาม RFC 4180 (comma, quote, newline) และ double-up quote ที่อยู่ในค่าอย่างถูกต้อง
