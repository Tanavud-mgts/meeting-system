# Track D (sub-project 6) — Integration Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างหน้า `/dashboard/integrations` ให้ Admin ดู quota summary รายเดือนต่อ external service และรายการที่ล้มเหลวล่าสุดสำหรับ debug

**Architecture:** Read-only page ล้วน ไม่มี Edge Function — query ตรงจาก client 2 จุด: view `integration_monthly_usage` (quota summary) และตาราง `integration_health` filter `status='failed'` (failed logs พร้อม filter+pagination) ทั้งสองมี RLS บังคับ admin-only อยู่แล้วที่ชั้น database

**Tech Stack:** Next.js 16 App Router (client component), Supabase client-side query

## Global Constraints

- **Design tokens เท่านั้น** (CLAUDE.md กฎข้อ 10)
- **ข้อความ UI ภาษาไทยทางการ** (CLAUDE.md กฎข้อ 9)
- **ไม่มี Edge Function ในสโคปนี้** — ไม่มี `fetch()` ที่ต้องห่อ try/catch/finally
- **ไม่ต้องแก้ middleware** — prefix `/dashboard` ครอบคลุม `/dashboard/integrations` อยู่แล้ว
- **ไม่ต้องแก้ nav** — `app/(app)/layout.tsx` มีลิงก์ `{ href: "/dashboard/integrations", label: "Integration Health" }` อยู่แล้วจาก sub-project ก่อนหน้า
- **5 service ตายตัวตามลำดับ CHECK constraint:** `make_com`, `line`, `google_calendar`, `vercel`, `internal` — แสดงครบทุกตัวเสมอแม้ไม่มี row ใน view (แสดง 0 แทนที่จะซ่อนการ์ด)
- **Reference limit เฉพาะ `make_com`/`line`** พร้อม caveat ข้อความชัดเจนว่านับรวมทุก call ไม่ได้แยก push/reply หรือแปลงเป็น credit จริง — `google_calendar`/`vercel`/`internal` ไม่มี reference limit
- **`ORDER BY created_at DESC` ต้อง explicit เสมอ** ห้ามพึ่ง default order (บทเรียนจาก sub-project 3's activity page)
- **ไม่แสดง `payload`** (JSON ดิบ) ในรายการ failed logs — ตัด YAGNI

## File Structure

| File | หน้าที่ |
|---|---|
| `app/(app)/dashboard/integrations/page.tsx` | หน้า Integration Health — Quota Summary + Failed Logs |

---

### Task 1: หน้า `/dashboard/integrations`

**Files:**
- Create: `app/(app)/dashboard/integrations/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client`
- Produces: route `/dashboard/integrations`

**คำเตือนสำคัญ:** สร้างไดเรกทอรีด้วยชื่อ `app/(app)/dashboard/integrations/` ให้ตรงเป๊ะ (วงเล็บเปิด-ปิดชิดกัน `(app)` ไม่มี `/` แทรก) — ไดเรกทอรี `app/(app)/dashboard/` มีอยู่แล้ว (มี `activity/`, `bookings/`, `data/`, `rooms/`, `settings/`, `users/`, `page.tsx` จาก sub-project ก่อนหน้า) ใช้ `mkdir -p "app/(app)/dashboard/integrations"` เป็นคำสั่งเดียว **ห้ามสร้างไดเรกทอรี `(app)` ใหม่**

- [ ] **Step 1: สร้างไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ServiceName =
  | "make_com"
  | "line"
  | "google_calendar"
  | "vercel"
  | "internal";

type QuotaRow = {
  service: ServiceName;
  total_calls: number;
  success_count: number;
  failed_count: number;
  last_called_at: string | null;
};

type FailedLogRow = {
  id: string;
  service: ServiceName;
  error_detail: string | null;
  created_at: string;
};

const SERVICES: ServiceName[] = [
  "make_com",
  "line",
  "google_calendar",
  "vercel",
  "internal",
];

const SERVICE_LABEL: Record<ServiceName, string> = {
  make_com: "Make.com",
  line: "LINE",
  google_calendar: "Google Calendar",
  vercel: "Vercel",
  internal: "ภายในระบบ",
};

const REFERENCE_LIMIT: Partial<Record<ServiceName, string>> = {
  make_com:
    "อ้างอิง Make.com Free Plan: 1,000 credits/เดือน (นับรวมทุกการเรียก ไม่ใช่จำนวน credit จริง)",
  line: "อ้างอิง LINE OA Free Plan: 500 ครั้ง/เดือน (นับรวมทุกการเรียก ไม่ได้แยก push/reply)",
};

const PAGE_SIZE = 20;

function emptyQuotaRow(service: ServiceName): QuotaRow {
  return {
    service,
    total_calls: 0,
    success_count: 0,
    failed_count: 0,
    last_called_at: null,
  };
}

export default function DashboardIntegrationsPage() {
  const [quotaMap, setQuotaMap] = useState<
    Record<string, QuotaRow>
  >({});
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const [failedLogs, setFailedLogs] = useState<FailedLogRow[]>([]);
  const [serviceFilter, setServiceFilter] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [logsError, setLogsError] = useState<string | null>(null);

  async function loadQuota() {
    setQuotaError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("integration_monthly_usage")
      .select("service, total_calls, success_count, failed_count, last_called_at");

    if (error) {
      setQuotaError("ไม่สามารถโหลดข้อมูล Quota ได้");
      return;
    }

    const map: Record<string, QuotaRow> = {};
    for (const row of (data ?? []) as QuotaRow[]) {
      map[row.service] = row;
    }
    setQuotaMap(map);
  }

  async function loadFailedLogs() {
    setLogsError(null);

    const supabase = createClient();
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("integration_health")
      .select("id, service, error_detail, created_at", { count: "exact" })
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (serviceFilter) {
      query = query.eq("service", serviceFilter);
    }

    const { data, error, count } = await query;

    if (error) {
      setLogsError("ไม่สามารถโหลดรายการที่ล้มเหลวได้");
      return;
    }

    setFailedLogs((data ?? []) as FailedLogRow[]);
    setTotalCount(count ?? 0);
  }

  useEffect(() => {
    loadQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadFailedLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, serviceFilter]);

  function handleServiceFilterChange(value: string) {
    setServiceFilter(value);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        Integration Health
      </h1>

      {quotaError && (
        <p className="mt-4 text-sm text-danger-text">{quotaError}</p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SERVICES.map((service) => {
          const row = quotaMap[service] ?? emptyQuotaRow(service);
          const referenceLimit = REFERENCE_LIMIT[service];

          return (
            <div
              key={service}
              className="rounded-lg border border-neutral-200 bg-surface-card p-5"
            >
              <p className="font-medium text-text-primary">
                {SERVICE_LABEL[service]}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                เรียกทั้งหมด: {row.total_calls} ครั้ง
              </p>
              <p className="text-sm text-text-secondary">
                สำเร็จ: {row.success_count} · ล้มเหลว: {row.failed_count}
              </p>
              <p className="text-sm text-text-secondary">
                เรียกล่าสุด:{" "}
                {row.last_called_at
                  ? new Date(row.last_called_at).toLocaleString("th-TH")
                  : "ยังไม่เคยเรียกเดือนนี้"}
              </p>
              {referenceLimit && (
                <p className="mt-2 text-xs text-text-secondary">
                  {referenceLimit}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="mt-8 text-lg font-semibold text-text-primary">
        รายการที่ล้มเหลวล่าสุด
      </h2>

      <div className="mt-4">
        <select
          value={serviceFilter}
          onChange={(e) => handleServiceFilterChange(e.target.value)}
          className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
        >
          <option value="">ทั้งหมด</option>
          {SERVICES.map((service) => (
            <option key={service} value={service}>
              {SERVICE_LABEL[service]}
            </option>
          ))}
        </select>
      </div>

      {logsError && (
        <p className="mt-4 text-sm text-danger-text">{logsError}</p>
      )}

      {!logsError && failedLogs.length === 0 && (
        <p className="mt-4 text-sm text-text-secondary">
          ไม่พบรายการที่ล้มเหลว
        </p>
      )}

      <div className="mt-4 space-y-3">
        {failedLogs.map((log) => (
          <div
            key={log.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <span className="inline-block rounded-pill bg-danger-surface px-2.5 py-0.5 text-xs font-semibold text-danger-text">
              {SERVICE_LABEL[log.service]}
            </span>
            {log.error_detail && (
              <p className="mt-2 text-sm text-text-secondary">
                {log.error_detail}
              </p>
            )}
            <p className="mt-1 text-sm text-text-secondary">
              {new Date(log.created_at).toLocaleString("th-TH")}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary disabled:opacity-50"
        >
          ก่อนหน้า
        </button>
        <span className="text-sm text-text-secondary">
          หน้า {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={page + 1 >= totalPages}
          className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary disabled:opacity-50"
        >
          ถัดไป
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build สำเร็จ, route list มี `/dashboard/integrations` (ตรวจด้วย `ls "app/(app)/dashboard/integrations/"` ก่อนด้วยว่ามีแค่ไฟล์นี้ ไม่มีไดเรกทอรี `(app` หรือ `(app/)` แปลกปลอมเกิดขึ้น)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/integrations/page.tsx"
git commit -m "feat: add integration health dashboard page with quota summary and failed logs"
```

---

### Task 2: Manual Verification

**Files:** ไม่มี (verification เท่านั้น)

ไม่มี Edge Function ในสโคปนี้ ทุกข้อทดสอบได้ครบในเซสชันนี้ ไม่มีขั้นตอนที่ deferred ให้ผู้ใช้

- [ ] **Step 1: Build รวม**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่, route list มี `/dashboard/integrations`

- [ ] **Step 2: ทดสอบ `/dashboard/integrations` — login เป็น admin@test.local**

เข้า `/dashboard/integrations`
Expected: เห็นการ์ด quota ครบ 5 ใบ (Make.com, LINE, Google Calendar, Vercel, ภายในระบบ) ทั้งหมดแสดง "เรียกทั้งหมด: 0 ครั้ง" และ "เรียกล่าสุด: ยังไม่เคยเรียกเดือนนี้" (เพราะไม่มี seed data ใน `integration_health`) ไม่มี error

- [ ] **Step 3: ตรวจ reference limit**

ดูการ์ด Make.com และ LINE
Expected: มีบรรทัดข้อความอ้างอิง limit ("อ้างอิง Make.com Free Plan: 1,000 credits/เดือน..." และ "อ้างอิง LINE OA Free Plan: 500 ครั้ง/เดือน...") ส่วนการ์ด Google Calendar/Vercel/ภายในระบบ **ไม่มี** บรรทัดนี้

- [ ] **Step 4: ทดสอบส่วนรายการที่ล้มเหลว**

เลื่อนลงไปที่ "รายการที่ล้มเหลวล่าสุด"
Expected: เห็นข้อความ "ไม่พบรายการที่ล้มเหลว" ไม่ error

- [ ] **Step 5: ทดสอบ filter dropdown**

เลือก service ใน dropdown (เช่น "LINE") แล้วเปลี่ยนกลับเป็น "ทั้งหมด"
Expected: ไม่ error แม้ผลลัพธ์ว่างเปล่าทุกครั้ง, หน้า pagination แสดง "หน้า 1 / 1" เสมอ (เพราะ `totalCount=0`)

- [ ] **Step 6: ทดสอบ middleware gate**

Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/dashboard/integrations` ตรงๆ ทาง URL
Expected: ถูก middleware redirect ไป `/home` ทันที (ครอบคลุมด้วย prefix `/dashboard` อยู่แล้ว ไม่ต้องแก้ middleware เพิ่ม)

---

## Self-Review Notes

- **Spec coverage:** Quota Summary section (5 การ์ดตายตัว, reference limit เฉพาะ make_com/line) → Task 1; Failed Logs section (filter+pagination, explicit order, ไม่แสดง payload) → Task 1; empty state handling → Task 1 + verified ใน Task 2 Step 2/4; middleware gate → Task 2 Step 6 ครบทุกข้อในสเปค
- **Placeholder scan:** ไม่มี TBD/TODO ที่ไม่มีเนื้อหา
- **Type consistency:** `ServiceName` union type ใช้ตรงกันทั้ง `QuotaRow.service`, `FailedLogRow.service`, `SERVICES` array, `SERVICE_LABEL`/`REFERENCE_LIMIT` Record keys — ไม่มีจุดที่ signature ไม่ตรงกัน
- **Route-group directory bug (Track B lesson):** เพิ่มคำเตือนใน Task 1 ให้ตรวจ `ls "app/(app)/dashboard/..."` หลังสร้างไฟล์
- **บทเรียนจาก sub-project 3's activity page ถูกนำมาใช้ล่วงหน้า:** `.order("created_at", { ascending: false })` explicit ใน `loadFailedLogs()`, ไม่พึ่ง default order ของตาราง
- **ไม่มี fetch() ในสโคปนี้** จึงไม่มี Global Constraint เรื่อง try/catch/finally ที่ต้องใช้ (ต่างจาก sub-project 5) — ใช้ pattern error-state เดียวกับ `/dashboard/activity` แทน
