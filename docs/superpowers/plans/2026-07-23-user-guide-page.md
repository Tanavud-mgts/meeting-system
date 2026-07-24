# หน้าคู่มือการใช้งานระบบ (`/guide`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างหน้า `/guide` ที่แสดงคู่มือการใช้งาน + Workflows แบบเข้าใจง่าย โดยเนื้อหาแสดงสะสมตามสิทธิ์ของผู้ใช้ที่ล็อกอิน (user → approver → admin เห็นเพิ่มเป็นลำดับ)

**Architecture:** เนื้อหาเป็น data-driven แยกไว้ใน `lib/guide/content.ts` (พร้อมฟังก์ชัน `modulesForRole`) ส่วนการแสดงผลเป็น presentational components ใน `components/guide/` และหน้า `app/(app)/guide/page.tsx` เป็น client component ที่โหลด role จาก Supabase แล้ว render โมดูลตามสิทธิ์ พร้อม segmented control (client-side state) ให้ approver/admin สลับดูแต่ละโมดูล

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4 (design tokens), Supabase client, Vitest (node env)

## Global Constraints

- ใช้ design token จาก `docs/DESIGN.md` เท่านั้น — ห้าม hardcode สี/spacing/font ตรงๆ (CLAUDE.md rule #10)
- ข้อความ UI ทั้งหมดเป็นภาษาไทยทางการเหมาะกับหน่วยงานราชการ (CLAUDE.md rule #9)
- เนื้อหาคู่มืออ้างอิงจาก `docs/PRODUCT.md` — หน้านี้เป็น read-only ไม่แตะ business logic/DB/external service (ไม่ต้อง `logIntegration()`)
- Vitest ทำงานใน environment `node` include เฉพาะ `lib/**/*.test.ts` และ `supabase/functions/**/*.test.ts` — เขียน unit test ได้เฉพาะโค้ดใน `lib/**` (pure). UI verify ด้วย `npx tsc --noEmit` + preview
- Role type จาก `lib/nav.ts`: `"user" | "approver" | "admin"`
- รันคำสั่งทั้งหมดจาก repo root `C:\Users\Pisit\Documents\meeting-system`

---

### Task 1: Guide content data + role-visibility logic

**Files:**
- Create: `lib/guide/content.ts`
- Test: `lib/guide/content.test.ts`

**Interfaces:**
- Consumes: (ไม่มี)
- Produces:
  - `type GuideModule = "user" | "approver" | "admin"`
  - `type GuideStep = { title: string; description: string; href?: string; linkLabel?: string }`
  - `type GuideSection = { id: string; title: string; steps: GuideStep[] }`
  - `type GuideModuleContent = { module: GuideModule; label: string; sections: GuideSection[]; showApprovalChain: boolean }`
  - `const GUIDE_CONTENT: GuideModuleContent[]`
  - `function modulesForRole(role: string): GuideModule[]`

- [ ] **Step 1: Write the failing test**

สร้าง `lib/guide/content.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { modulesForRole, GUIDE_CONTENT } from "./content";

describe("modulesForRole", () => {
  it("user sees only the user module", () => {
    expect(modulesForRole("user")).toEqual(["user"]);
  });

  it("approver sees user + approver (cumulative)", () => {
    expect(modulesForRole("approver")).toEqual(["user", "approver"]);
  });

  it("admin sees all three modules", () => {
    expect(modulesForRole("admin")).toEqual(["user", "approver", "admin"]);
  });

  it("unknown role falls back to user", () => {
    expect(modulesForRole("bogus")).toEqual(["user"]);
  });
});

describe("GUIDE_CONTENT integrity", () => {
  it("defines exactly the three modules in order", () => {
    expect(GUIDE_CONTENT.map((m) => m.module)).toEqual([
      "user",
      "approver",
      "admin",
    ]);
  });

  it("every module has at least one section with at least one step", () => {
    for (const mod of GUIDE_CONTENT) {
      expect(mod.sections.length).toBeGreaterThan(0);
      for (const section of mod.sections) {
        expect(section.steps.length).toBeGreaterThan(0);
      }
    }
  });

  it("every step href (when present) is an internal path", () => {
    for (const mod of GUIDE_CONTENT) {
      for (const section of mod.sections) {
        for (const step of section.steps) {
          if (step.href !== undefined) {
            expect(step.href.startsWith("/")).toBe(true);
          }
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/guide/content.test.ts`
Expected: FAIL — cannot resolve `./content` (module not found)

- [ ] **Step 3: Write minimal implementation**

สร้าง `lib/guide/content.ts` (ข้อความอ้างอิงจาก PRODUCT.md §1–3):

```ts
export type GuideModule = "user" | "approver" | "admin";

export type GuideStep = {
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
};

export type GuideSection = {
  id: string;
  title: string;
  steps: GuideStep[];
};

export type GuideModuleContent = {
  module: GuideModule;
  label: string;
  sections: GuideSection[];
  showApprovalChain: boolean;
};

// ลำดับสิทธิ์แบบสะสม: role หนึ่งเห็นโมดูลของตนและโมดูลที่มีสิทธิ์ต่ำกว่าทั้งหมด
const MODULE_ORDER: GuideModule[] = ["user", "approver", "admin"];

export function modulesForRole(role: string): GuideModule[] {
  const idx = MODULE_ORDER.indexOf(role as GuideModule);
  if (idx === -1) return ["user"];
  return MODULE_ORDER.slice(0, idx + 1);
}

export const GUIDE_CONTENT: GuideModuleContent[] = [
  {
    module: "user",
    label: "ผู้ใช้ทั่วไป",
    showApprovalChain: true,
    sections: [
      {
        id: "user-booking",
        title: "จองห้องประชุม",
        steps: [
          {
            title: "ค้นหาห้องว่าง",
            description:
              "เลือกวันและช่วงเวลาที่ต้องการ ระบบจะแสดงเฉพาะห้องที่ว่างในช่วงเวลานั้น",
            href: "/booking",
            linkLabel: "ไปหน้าจองห้อง",
          },
          {
            title: "กรอกรายละเอียดและส่งคำขอ",
            description:
              "ระบุหัวข้อการประชุม จำนวนผู้เข้าร่วม และอุปกรณ์ที่ต้องใช้ จากนั้นส่งคำขอจอง",
            href: "/booking",
            linkLabel: "ไปหน้าจองห้อง",
          },
          {
            title: "รอการอนุมัติ",
            description:
              "คำขอจะมีสถานะ “รออนุมัติ” และเข้าสู่สายอนุมัติของระบบ ดูเส้นทางการอนุมัติได้จากแผนภาพด้านล่าง",
          },
        ],
      },
      {
        id: "user-manage",
        title: "ติดตามและจัดการการจอง",
        steps: [
          {
            title: "ดูการจองของฉัน",
            description: "ตรวจสอบสถานะคำขอทั้งหมดของคุณได้ในหน้าการจองของฉัน",
            href: "/profile/bookings",
            linkLabel: "ไปหน้าการจองของฉัน",
          },
          {
            title: "ดูปฏิทินภาพรวม",
            description: "ดูตารางการใช้ห้องประชุมทั้งหมดในรูปแบบปฏิทิน วัน/สัปดาห์/เดือน",
            href: "/calendar",
            linkLabel: "ไปหน้าปฏิทิน",
          },
          {
            title: "ยกเลิกการจองที่รออนุมัติ",
            description:
              "การจองที่ยังเป็น “รออนุมัติ” สามารถยกเลิกได้ทันทีด้วยตนเอง",
            href: "/profile/bookings",
            linkLabel: "ไปหน้าการจองของฉัน",
          },
          {
            title: "ขอยกเลิกการจองที่อนุมัติแล้ว",
            description:
              "หากการจองอนุมัติแล้ว ต้องส่งคำขอยกเลิกพร้อมกรอกเหตุผล แล้วรอผู้ดูแลระบบพิจารณา",
            href: "/profile/bookings",
            linkLabel: "ไปหน้าการจองของฉัน",
          },
        ],
      },
      {
        id: "user-line",
        title: "เชื่อมต่อ LINE (ไม่บังคับ)",
        steps: [
          {
            title: "เชื่อมบัญชี LINE เพื่อรับการแจ้งเตือน",
            description:
              "เพิ่มเพื่อน LINE OA แล้วขอรหัส OTP ในหน้าโปรไฟล์ จากนั้นพิมพ์คำสั่งเชื่อมบัญชีในแชท LINE เพื่อรับการแจ้งเตือน (เป็นช่องทางเสริม ทุกฟีเจอร์ใช้งานบนเว็บได้ครบโดยไม่ต้องเชื่อม LINE)",
            href: "/profile",
            linkLabel: "ไปหน้าโปรไฟล์",
          },
        ],
      },
    ],
  },
  {
    module: "approver",
    label: "ผู้อนุมัติ",
    showApprovalChain: true,
    sections: [
      {
        id: "approver-review",
        title: "พิจารณาคำขอจอง",
        steps: [
          {
            title: "เปิดคิวคำขอรออนุมัติ",
            description:
              "ดูคำขอที่รอการพิจารณาในขั้นตอนของคุณ ระบบจะเน้นคำขอที่รอนานเป็นพิเศษ",
            href: "/approver",
            linkLabel: "ไปหน้ารออนุมัติ",
          },
          {
            title: "อนุมัติหรือปฏิเสธ",
            description:
              "ตรวจสอบรายละเอียดแล้วเลือกอนุมัติเพื่อส่งต่อขั้นถัดไป หรือปฏิเสธเพื่อจบคำขอทันที (การปฏิเสธที่ขั้นใดก็ตามจะจบสายอนุมัติทันที)",
            href: "/approver",
            linkLabel: "ไปหน้ารออนุมัติ",
          },
        ],
      },
      {
        id: "approver-cancel",
        title: "พิจารณาคำขอยกเลิก",
        steps: [
          {
            title: "พิจารณาคำขอยกเลิกจากผู้ใช้",
            description:
              "อนุมัติหรือปฏิเสธคำขอยกเลิกการจองที่ผ่านการอนุมัติแล้ว",
            href: "/approver/cancel-requests",
            linkLabel: "ไปหน้าคำขอยกเลิก",
          },
        ],
      },
      {
        id: "approver-report",
        title: "รายงานและประวัติ",
        steps: [
          {
            title: "ดูรายงานและสถิติ",
            description:
              "ดูสถิติการใช้ห้องและรายงานได้เหมือนผู้ดูแลระบบ (ไม่จำกัดตามหน่วยงาน)",
            href: "/dashboard/reports",
            linkLabel: "ไปหน้ารายงาน",
          },
          {
            title: "ดูประวัติการทำงานของฉัน",
            description: "ตรวจสอบประวัติการอนุมัติและปฏิเสธของตนเอง",
            href: "/approver/history",
            linkLabel: "ไปหน้าประวัติ",
          },
        ],
      },
    ],
  },
  {
    module: "admin",
    label: "ผู้ดูแลระบบ",
    showApprovalChain: false,
    sections: [
      {
        id: "admin-setup",
        title: "การตั้งค่าระบบ",
        steps: [
          {
            title: "จัดการห้องประชุม",
            description: "เพิ่ม แก้ไข หรือลบห้องประชุมและอุปกรณ์ประจำห้อง",
            href: "/dashboard/rooms",
            linkLabel: "ไปหน้าจัดการห้อง",
          },
          {
            title: "จัดการผู้ใช้และสิทธิ์",
            description: "กำหนดบทบาท (role) และหน่วยงานให้ผู้ใช้แต่ละคน",
            href: "/dashboard/users",
            linkLabel: "ไปหน้าจัดการผู้ใช้",
          },
          {
            title: "ตั้งค่าสายอนุมัติ เวลาทำการ และวันหยุด",
            description:
              "กำหนดผู้อนุมัติในแต่ละขั้น เวลาเปิด-ปิดทำการ และวันหยุดของระบบ",
            href: "/dashboard/settings",
            linkLabel: "ไปหน้าตั้งค่า",
          },
        ],
      },
      {
        id: "admin-approval",
        title: "การอนุมัติและการจัดการการจอง",
        steps: [
          {
            title: "เป็นผู้อนุมัติขั้นแรก",
            description:
              "ทุกคำขอจองจะผ่านผู้ดูแลระบบเป็นด่านแรกของสายอนุมัติเสมอ",
            href: "/approver",
            linkLabel: "ไปหน้ารออนุมัติ",
          },
          {
            title: "ยกเลิกการจองใดๆ ได้ทันที",
            description:
              "ผู้ดูแลระบบยกเลิกการจองได้ทุกสถานะโดยไม่ต้องขออนุมัติ แต่ต้องกรอกเหตุผล",
            href: "/dashboard/bookings",
            linkLabel: "ไปหน้าการจองทั้งหมด",
          },
          {
            title: "ดูการจองทั้งหมดในระบบ",
            description: "ตรวจสอบรายการจองทั้งหมดของทุกผู้ใช้",
            href: "/dashboard/bookings",
            linkLabel: "ไปหน้าการจองทั้งหมด",
          },
        ],
      },
      {
        id: "admin-data",
        title: "รายงาน ข้อมูล และการตรวจสอบ",
        steps: [
          {
            title: "ดูภาพรวมระบบ",
            description: "ดูสถิติและภาพรวมการใช้งานทั้งระบบ",
            href: "/dashboard",
            linkLabel: "ไปหน้าภาพรวม",
          },
          {
            title: "Export ข้อมูลและตั้งค่าการเก็บข้อมูล",
            description:
              "ส่งออกข้อมูลเป็น Excel และตั้งค่าระยะเวลาการเก็บ log (retention)",
            href: "/dashboard/data",
            linkLabel: "ไปหน้าจัดการข้อมูล",
          },
          {
            title: "ตรวจสอบสถานะการเชื่อมต่อ",
            description:
              "ดู Integration Health ของ Make.com, LINE และโควตาการใช้งาน",
            href: "/dashboard/integrations",
            linkLabel: "ไปหน้า Integration",
          },
          {
            title: "ดูประวัติการทำงานรวมของทุกคน",
            description: "ตรวจสอบประวัติกิจกรรมของผู้ใช้ทุกคนในระบบ",
            href: "/dashboard/activity",
            linkLabel: "ไปหน้าประวัติรวม",
          },
        ],
      },
    ],
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/guide/content.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/guide/content.ts lib/guide/content.test.ts
git commit -m "feat(guide): add role-tailored guide content data + modulesForRole

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Add `/guide` link to sidebar navigation

**Files:**
- Modify: `lib/nav.ts` (เพิ่ม entry ใน `SIDEBAR_ORDER` ก่อน `/profile`)
- Test: `lib/nav.test.ts` (ปรับ assertion จำนวน/ลำดับ)

**Interfaces:**
- Consumes: `buildSidebar(role)` จาก `lib/nav.ts` (มีอยู่แล้ว)
- Produces: sidebar ที่มีลิงก์ `/guide` label `"คู่มือการใช้งาน"` สำหรับทุก role

การเพิ่มลิงก์ทำให้จำนวน sidebar item เปลี่ยน: user 5→6, approver 7→8, admin 8→9 จึงต้องแก้ทั้ง `nav.ts` และ `nav.test.ts` พร้อมกันในงานนี้

- [ ] **Step 1: Update the test to expect the new item**

แก้ `lib/nav.test.ts` — 3 บล็อกใน `describe("buildSidebar")`:

บล็อก user (แทนที่ทั้ง `it("user sees 5 standalone items", ...)`):

```ts
  it("user sees 6 standalone items incl. guide", () => {
    const items = buildSidebar("user");
    expect(items).toHaveLength(6);
    expect(items.map((i) => i.href)).toEqual([
      "/home",
      "/booking",
      "/calendar",
      "/profile/bookings",
      "/guide",
      "/profile",
    ]);
  });
```

บล็อก approver — แก้ header และ length:

```ts
  it("approver sees 8 items incl. standalone รายงาน, guide, and one group", () => {
    const items = buildSidebar("approver");
    expect(items).toHaveLength(8);
```

(บรรทัดอื่นในบล็อก approver คงเดิม — assertion เรื่อง group `/approver` และ standalone reports ยังถูกต้อง)

บล็อก admin — แก้ length และ label array:

```ts
  it("admin sees 9 items incl. guide and no standalone รายงาน", () => {
    const items = buildSidebar("admin");
    expect(items).toHaveLength(9);
    expect(items.filter((i) => i.href === "/dashboard/reports")).toHaveLength(0);
    expect(items.map((i) => i.label)).toEqual([
      "หน้าหลัก",
      "จองห้อง",
      "ปฏิทิน",
      "การจองของฉัน",
      "งานอนุมัติ",
      "จัดการระบบ",
      "รายงานและข้อมูล",
      "คู่มือการใช้งาน",
      "โปรไฟล์",
    ]);
```

(ส่วนที่เหลือของบล็อก admin — assertion เรื่อง group `จัดการระบบ` — คงเดิม)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/nav.test.ts`
Expected: FAIL — buildSidebar ยังคืน 5/7/8 items ไม่มี `/guide`

- [ ] **Step 3: Add the `/guide` entry in nav.ts**

ใน `lib/nav.ts` `SIDEBAR_ORDER` เพิ่มบรรทัดก่อน entry `/profile` (บรรทัดสุดท้าย):

```ts
  { kind: "link", href: "/guide", label: "คู่มือการใช้งาน", roles: ALL },
  { kind: "link", href: "/profile", label: "โปรไฟล์", roles: ALL },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/nav.test.ts`
Expected: PASS (ทุก test ในไฟล์)

- [ ] **Step 5: Commit**

```bash
git add lib/nav.ts lib/nav.test.ts
git commit -m "feat(guide): add คู่มือการใช้งาน link to sidebar for all roles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Presentational components (WorkflowSteps, ApprovalChainDiagram, StatusLegend)

**Files:**
- Create: `components/guide/WorkflowSteps.tsx`
- Create: `components/guide/ApprovalChainDiagram.tsx`
- Create: `components/guide/StatusLegend.tsx`

**Interfaces:**
- Consumes: `GuideSection`, `GuideStep` จาก `lib/guide/content.ts`; `EditorialCard` จาก `components/ui/EditorialCard`; `SectionTitle` จาก `components/ui/PageHero`; `StatusMarker` จาก `components/ui/StatusMarker`
- Produces:
  - `WorkflowSteps({ section }: { section: GuideSection })` — default export ไม่ใช่ (named)
  - `ApprovalChainDiagram()` — no props
  - `StatusLegend()` — no props

ไม่มี unit test infra สำหรับ component (vitest = node env, ไม่มี jsdom) — verify ด้วย `npx tsc --noEmit` และ preview ใน Task 4

- [ ] **Step 1: Create WorkflowSteps.tsx**

```tsx
import Link from "next/link";
import type { GuideSection } from "@/lib/guide/content";
import { EditorialCard } from "@/components/ui/EditorialCard";
import { SectionTitle } from "@/components/ui/PageHero";

// การ์ด workflow หนึ่ง section: หัวข้อ + step ที่มีหมายเลขลำดับ และลิงก์ไปหน้าจริง
export function WorkflowSteps({ section }: { section: GuideSection }) {
  return (
    <EditorialCard>
      <EditorialCard.Section>
        <SectionTitle>{section.title}</SectionTitle>
      </EditorialCard.Section>
      {section.steps.map((step, i) => (
        <EditorialCard.Section key={i}>
          <div className="flex gap-3">
            <span
              className="bg-grad-brand shadow-brand mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-[2px] font-mono text-sm font-bold text-text-on-primary"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="font-bold text-text-primary">{step.title}</p>
              <p className="mt-0.5 text-sm text-text-secondary">
                {step.description}
              </p>
              {step.href ? (
                <Link
                  href={step.href}
                  className="mt-2 inline-block text-sm font-bold text-brand-primary hover:underline"
                >
                  {step.linkLabel ?? "ไปหน้าที่เกี่ยวข้อง"} →
                </Link>
              ) : null}
            </div>
          </div>
        </EditorialCard.Section>
      ))}
    </EditorialCard>
  );
}
```

- [ ] **Step 2: Create ApprovalChainDiagram.tsx**

แผนภาพสายอนุมัติ (responsive: แนวตั้งบนมือถือ, แนวนอนบน md+) ใช้กล่อง sunken ตาม DESIGN.md §4:

```tsx
import { EditorialCard } from "@/components/ui/EditorialCard";
import { SectionTitle } from "@/components/ui/PageHero";

const STEPS = [
  { label: "ผู้จองส่งคำขอ", sub: "รออนุมัติ" },
  { label: "ผู้ดูแลระบบ", sub: "ขั้นที่ 1" },
  { label: "ผู้อนุมัติ 1", sub: "ขั้นที่ 2" },
  { label: "ผู้อนุมัติ 2", sub: "ขั้นที่ 3" },
  { label: "อนุมัติสำเร็จ", sub: "สร้างในปฏิทิน" },
];

// เส้นทางคำขอผ่านสายอนุมัติ 3 ขั้น (Global chain เดียวทุกห้อง)
export function ApprovalChainDiagram() {
  return (
    <EditorialCard>
      <EditorialCard.Section>
        <SectionTitle>เส้นทางการอนุมัติ</SectionTitle>
      </EditorialCard.Section>
      <EditorialCard.Section>
        <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-2 md:flex-1 md:flex-col md:gap-1"
            >
              <div className="flex-1 rounded-[2px] border border-border-sunken bg-surface-sunken px-3 py-2 text-center md:w-full">
                <p className="text-sm font-bold text-text-primary">{s.label}</p>
                <p className="font-mono text-xs text-text-secondary">{s.sub}</p>
              </div>
              {i < STEPS.length - 1 ? (
                <span
                  className="flex-none font-bold text-brand-primary"
                  aria-hidden="true"
                >
                  →
                </span>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-text-secondary">
          หากถูกปฏิเสธที่ขั้นใดขั้นหนึ่ง สายอนุมัติจะสิ้นสุดทันที
          และคำขอจะมีสถานะ “ถูกปฏิเสธ”
        </p>
      </EditorialCard.Section>
    </EditorialCard>
  );
}
```

หมายเหตุ: `border-border-sunken` และ `bg-surface-sunken` คือ token จาก DESIGN.md §1. หากชื่อ Tailwind utility ไม่ตรง (v4 mapping) ให้ตรวจ `app/globals.css` เพื่อยืนยันชื่อ class ที่ map ไว้ก่อนใช้

- [ ] **Step 3: Create StatusLegend.tsx**

ตารางความหมายสถานะการจองครบทุกสถานะจาก PRODUCT.md §3:

```tsx
import { EditorialCard } from "@/components/ui/EditorialCard";
import { SectionTitle } from "@/components/ui/PageHero";
import { StatusMarker } from "@/components/ui/StatusMarker";

type Tone = "success" | "warning" | "danger" | "neutral";

const STATUSES: { label: string; tone: Tone; meaning: string }[] = [
  { label: "รออนุมัติ", tone: "warning", meaning: "รอผู้ดูแลระบบพิจารณาเป็นขั้นแรก" },
  { label: "อนุมัติแล้ว", tone: "success", meaning: "ผ่านครบทุกขั้นของสายอนุมัติ" },
  { label: "ถูกปฏิเสธ", tone: "danger", meaning: "ถูกปฏิเสธระหว่างสายอนุมัติ" },
  { label: "ยกเลิกแล้ว", tone: "neutral", meaning: "ผู้จองยกเลิกเองขณะยังรออนุมัติ" },
  {
    label: "รอยกเลิก",
    tone: "warning",
    meaning: "ขอยกเลิกหลังอนุมัติแล้ว รอผู้ดูแลระบบพิจารณา",
  },
  {
    label: "ยกเลิกโดยผู้ดูแล",
    tone: "neutral",
    meaning: "ผู้ดูแลระบบหรือผู้อนุมัติยกเลิกโดยตรง",
  },
];

// อภิธานสถานะการจอง — แสดงครั้งเดียวท้ายหน้า
export function StatusLegend() {
  return (
    <EditorialCard>
      <EditorialCard.Section>
        <SectionTitle>ความหมายของสถานะการจอง</SectionTitle>
      </EditorialCard.Section>
      {STATUSES.map((s, i) => (
        <EditorialCard.Section key={i}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <span className="sm:w-44 sm:flex-none">
              <StatusMarker tone={s.tone}>{s.label}</StatusMarker>
            </span>
            <span className="text-sm text-text-secondary">{s.meaning}</span>
          </div>
        </EditorialCard.Section>
      ))}
    </EditorialCard>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใน `components/guide/*` (โปรเจกต์อาจมี error เดิมที่ไม่เกี่ยว — ยืนยันว่าไม่มี error ใหม่จากไฟล์ที่สร้าง)

- [ ] **Step 5: Commit**

```bash
git add components/guide/
git commit -m "feat(guide): add WorkflowSteps, ApprovalChainDiagram, StatusLegend components

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Guide page with role loading + segmented control

**Files:**
- Create: `app/(app)/guide/page.tsx`

**Interfaces:**
- Consumes: `modulesForRole`, `GUIDE_CONTENT`, `GuideModule` จาก `lib/guide/content.ts`; `WorkflowSteps`, `ApprovalChainDiagram`, `StatusLegend` จาก `components/guide/*`; `PageHero` จาก `components/ui/PageHero`; `Skeleton` จาก `components/ui/Skeleton`; `createClient` จาก `lib/supabase/client`
- Produces: หน้า `/guide` (client component) — deliverable สุดท้าย

- [ ] **Step 1: Create the page**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHero } from "@/components/ui/PageHero";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  GUIDE_CONTENT,
  modulesForRole,
  type GuideModule,
} from "@/lib/guide/content";
import { WorkflowSteps } from "@/components/guide/WorkflowSteps";
import { ApprovalChainDiagram } from "@/components/guide/ApprovalChainDiagram";
import { StatusLegend } from "@/components/guide/StatusLegend";

type Segment = "all" | GuideModule;

export default function GuidePage() {
  const [modules, setModules] = useState<GuideModule[] | null>(null);
  const [segment, setSegment] = useState<Segment>("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoadError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();
      setModules(modulesForRole(profile?.role ?? "user"));
    }
    load();
  }, []);

  const visibleModules = useMemo(() => {
    if (!modules) return [];
    return GUIDE_CONTENT.filter(
      (m) =>
        modules.includes(m.module) &&
        (segment === "all" || segment === m.module)
    );
  }, [modules, segment]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-danger-text">{loadError}</p>
      </div>
    );
  }

  if (!modules) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in-up space-y-4 p-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const showSegments = modules.length > 1;
  const segments: Segment[] = ["all", ...modules];
  const segmentLabel: Record<Segment, string> = {
    all: "ทั้งหมด",
    user: "ผู้ใช้ทั่วไป",
    approver: "ผู้อนุมัติ",
    admin: "ผู้ดูแลระบบ",
  };

  return (
    <div className="animate-fade-in-up pb-10">
      <PageHero
        title="คู่มือการใช้งานระบบ"
        subtitle="อธิบายขั้นตอนการทำงานของระบบ ปรับเนื้อหาให้ตรงกับสิทธิ์การใช้งานของคุณ"
        width="max-w-2xl"
      />
      <div className="relative mx-auto -mt-6 max-w-2xl px-6">
        {showSegments ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {segments.map((s) => {
              const active = segment === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSegment(s)}
                  className={`rounded-[2px] border px-3 py-1.5 text-sm font-bold transition-colors ${
                    active
                      ? "bg-grad-brand shadow-brand border-transparent text-text-on-primary"
                      : "border-neutral-300 bg-surface-card text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {segmentLabel[s]}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="space-y-6">
          {visibleModules.map((mod) => (
            <section key={mod.module} className="space-y-3">
              <h2 className="text-xl font-extrabold tracking-tight text-text-primary">
                สำหรับ{mod.label}
              </h2>
              {mod.sections.map((section) => (
                <WorkflowSteps key={section.id} section={section} />
              ))}
              {mod.showApprovalChain ? <ApprovalChainDiagram /> : null}
            </section>
          ))}

          <StatusLegend />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่จาก `app/(app)/guide/page.tsx`

- [ ] **Step 3: Verify in preview (all three roles)**

เริ่ม dev server ผ่าน preview tool แล้วเข้าหน้า `/guide` ตรวจ:
- login เป็น `user@test.local` → เห็นเฉพาะโมดูล “สำหรับผู้ใช้ทั่วไป” + แผนภาพสายอนุมัติ + ตารางสถานะ, **ไม่มี** segmented control
- login เป็น `approver1@test.local` → เห็น segmented control `[ทั้งหมด] [ผู้ใช้ทั่วไป] [ผู้อนุมัติ]`, โหมด “ทั้งหมด” แสดง 2 โมดูล, กดสลับ segment แล้วเนื้อหาเปลี่ยน
- login เป็น `admin@test.local` → segmented control มีครบ 4 ปุ่ม, “ทั้งหมด” แสดง 3 โมดูล
- ตรวจว่าลิงก์ “ไปหน้า…” ในแต่ละ step นำไปยัง route ที่ถูกต้อง (เช่น step จองห้อง → `/booking`)
- ตรวจ responsive (`preview_resize` mobile): แผนภาพสายอนุมัติเรียงแนวตั้ง, การ์ดไม่ล้น

แก้ไขที่ source ถ้าพบปัญหา แล้ว verify ซ้ำ

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/guide/page.tsx"
git commit -m "feat(guide): add /guide page with role-based modules and segmented control

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §2 Route & nav link → Task 4 (page) + Task 2 (nav) ✓
- §3 cumulative visibility + segmented control (client-side, hidden for single-module) → Task 1 (`modulesForRole`) + Task 4 ✓
- §4 UI: PageHero, step cards, ลิงก์ไปหน้าจริง, approval chain diagram, status table → Task 3 + Task 4 ✓
- §5 file structure → Tasks 1,3,4 (หมายเหตุ: spec เขียน content+logic แยกเป็น content.ts/visibility.ts แต่รวมไว้ใน content.ts เดียวเพื่อ locality ของ guide data — logic ยังคงมี test) ✓
- §6 data flow (read-only, no external call) → Task 4 ✓
- §7 loading/error/fallback role → Task 4 ✓
- §8 testing: unit `modulesForRole` + integrity → Task 1; ลิงก์เงื่อนไข href → ครอบด้วย typecheck + preview (component test infra ไม่มี) ✓
- §9 out of scope respected (no search, no URL deep-link, static content, Thai only) ✓

**Placeholder scan:** ไม่มี TODO/TBD; โค้ดครบทุก step ✓

**Type consistency:** `GuideModule`, `GuideStep`, `GuideSection`, `GuideModuleContent`, `modulesForRole`, `GUIDE_CONTENT` ใช้ชื่อตรงกันทุก task; `WorkflowSteps({ section })`, `ApprovalChainDiagram()`, `StatusLegend()` ตรงกับที่ page เรียก ✓
