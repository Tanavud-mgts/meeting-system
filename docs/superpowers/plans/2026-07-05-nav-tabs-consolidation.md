# Navigation Tab Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ยุบ navigation ของ admin จาก 17 เมนูเหลือ 8 โดยรวมหน้าที่เกี่ยวข้องเป็นแท็บ (URL จริง) ในกลุ่มเดียวกัน โดยไม่แตะ route เดิมและไม่แตะหน้าเพจ 12 หน้า

**Architecture:** config กลาง `lib/nav.ts` (pure, ไม่มี React) นิยาม standalone links + groups + tabs พร้อม role; sidebar สร้างจาก `buildSidebar(role)`, แถบแท็บสร้างจาก `findGroupForPath(pathname, role)` ผ่าน client component `PageTabs` ที่ render ใน `layout.tsx` เหนือ page content

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Vitest (มีอยู่แล้ว), `next/navigation` usePathname

## Global Constraints

- **ไม่เปลี่ยน/ย้าย route เดิม** — ทุกหน้าอยู่ path เดิม 100% (backward-compat)
- **ไม่แตะหน้าเพจ 12 หน้า** ใน `app/(app)/dashboard/*` และ `app/(app)/approver/*`
- **ไม่แตะ `/calendar`**
- **ใช้ design token เท่านั้น** (CLAUDE.md ข้อ 10) — active tab ใช้ `brand-primary`, ข้อความใช้ token
- **ข้อความ UI ภาษาไทยทางการ** (CLAUDE.md ข้อ 9)
- **"รายงาน" (`/dashboard/reports`) ปรากฏที่เดียวต่อ role** — approver = standalone, admin = แท็บใน "รายงานและข้อมูล" (admin **ไม่มี** standalone รายงาน)
- **การไฮไลต์ active ใช้ exact match** (`pathname === href`) เท่านั้น — ห้ามใช้ startsWith (เพราะ `/dashboard` เป็น prefix ของทุกหน้า dashboard)

## File Structure

| File | หน้าที่ |
|---|---|
| `lib/nav.ts` | (ใหม่) config + types + `buildSidebar(role)` + `findGroupForPath(pathname, role)` — pure, ไม่มี React |
| `lib/nav.test.ts` | (ใหม่) unit tests ของ 2 ฟังก์ชัน |
| `vitest.config.ts` | (แก้) เพิ่ม `lib/**/*.test.ts` เข้า include |
| `components/ui/Tabs.tsx` | (ใหม่) แถบแท็บ presentational + ไฮไลต์ active |
| `components/ui/PageTabs.tsx` | (ใหม่) เลือก group จาก pathname+role แล้ว render Tabs |
| `app/(app)/AppNav.tsx` | (แก้) รับ `items: SidebarItem[]` + ไฮไลต์ active + group entry |
| `app/(app)/layout.tsx` | (แก้) ใช้ `buildSidebar` + render `PageTabs`, ลบ NAV_BY_ROLE/navForRole |

---

### Task 1: Central nav config `lib/nav.ts` + tests

**Files:**
- Create: `lib/nav.ts`
- Create: `lib/nav.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces:
  - `type Role = "user" | "approver" | "admin"`
  - `type SidebarItem = { href: string; label: string; groupHrefs?: string[] }`
  - `type Tab = { href: string; label: string; roles: Role[] }`
  - `type NavGroup = { label: string; roles: Role[]; tabs: Tab[] }`
  - `buildSidebar(role: Role): SidebarItem[]`
  - `findGroupForPath(pathname: string, role: Role): NavGroup | null`

- [ ] **Step 1: เพิ่ม lib tests เข้า vitest include**

แก้ `vitest.config.ts` — เปลี่ยนบรรทัด include:
```ts
    include: ["supabase/functions/**/*.test.ts"],
```
เป็น:
```ts
    include: ["supabase/functions/**/*.test.ts", "lib/**/*.test.ts"],
```

- [ ] **Step 2: เขียน test ที่ล้มเหลวก่อน**

สร้าง `lib/nav.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildSidebar, findGroupForPath } from "./nav";

describe("buildSidebar", () => {
  it("user sees 5 standalone items", () => {
    const items = buildSidebar("user");
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.href)).toEqual([
      "/home",
      "/booking",
      "/calendar",
      "/profile/bookings",
      "/profile",
    ]);
  });

  it("approver sees 7 items incl. standalone รายงาน and one group", () => {
    const items = buildSidebar("approver");
    expect(items).toHaveLength(7);
    // standalone reports present exactly once for approver
    expect(items.filter((i) => i.href === "/dashboard/reports")).toHaveLength(1);
    // one group entry (งานอนุมัติ) whose click target is the first tab
    const group = items.find((i) => i.label === "งานอนุมัติ");
    expect(group?.href).toBe("/approver");
    expect(group?.groupHrefs).toEqual([
      "/approver",
      "/approver/cancel-requests",
      "/approver/history",
    ]);
  });

  it("admin sees 8 items and no standalone รายงาน (it lives in a group)", () => {
    const items = buildSidebar("admin");
    expect(items).toHaveLength(8);
    // reports must NOT appear as a standalone sidebar item for admin
    expect(items.filter((i) => i.href === "/dashboard/reports")).toHaveLength(0);
    expect(items.map((i) => i.label)).toEqual([
      "หน้าหลัก",
      "จองห้อง",
      "ปฏิทิน",
      "การจองของฉัน",
      "งานอนุมัติ",
      "จัดการระบบ",
      "รายงานและข้อมูล",
      "โปรไฟล์",
    ]);
    const manage = items.find((i) => i.label === "จัดการระบบ");
    expect(manage?.href).toBe("/dashboard/rooms");
    expect(manage?.groupHrefs).toEqual([
      "/dashboard/rooms",
      "/dashboard/users",
      "/dashboard/settings",
    ]);
  });
});

describe("findGroupForPath", () => {
  it("matches approval routes to งานอนุมัติ", () => {
    expect(findGroupForPath("/approver", "admin")?.label).toBe("งานอนุมัติ");
    expect(findGroupForPath("/approver/history", "approver")?.label).toBe(
      "งานอนุมัติ"
    );
  });

  it("matches management routes to จัดการระบบ (admin only)", () => {
    expect(findGroupForPath("/dashboard/rooms", "admin")?.label).toBe(
      "จัดการระบบ"
    );
  });

  it("matches /dashboard/reports to รายงานและข้อมูล for admin only", () => {
    expect(findGroupForPath("/dashboard/reports", "admin")?.label).toBe(
      "รายงานและข้อมูล"
    );
    // approver is NOT in the group's roles -> no tab bar (they use standalone)
    expect(findGroupForPath("/dashboard/reports", "approver")).toBeNull();
  });

  it("returns null for routes not in any group", () => {
    expect(findGroupForPath("/home", "user")).toBeNull();
    expect(findGroupForPath("/booking", "admin")).toBeNull();
  });
});
```

- [ ] **Step 3: รัน test ให้เห็นว่าล้มเหลว**

Run: `npm run test`
Expected: FAIL (`Cannot find module './nav'` หรือ export ไม่พบ)

- [ ] **Step 4: เขียน `lib/nav.ts`**

```ts
export type Role = "user" | "approver" | "admin";

export type Tab = { href: string; label: string; roles: Role[] };
export type NavGroup = { label: string; roles: Role[]; tabs: Tab[] };
export type SidebarItem = {
  href: string;
  label: string;
  groupHrefs?: string[];
};

const ALL: Role[] = ["user", "approver", "admin"];

export const GROUPS: NavGroup[] = [
  {
    label: "งานอนุมัติ",
    roles: ["approver", "admin"],
    tabs: [
      { href: "/approver", label: "รออนุมัติ", roles: ["approver", "admin"] },
      {
        href: "/approver/cancel-requests",
        label: "คำขอยกเลิก",
        roles: ["approver", "admin"],
      },
      {
        href: "/approver/history",
        label: "ประวัติ",
        roles: ["approver", "admin"],
      },
    ],
  },
  {
    label: "จัดการระบบ",
    roles: ["admin"],
    tabs: [
      { href: "/dashboard/rooms", label: "ห้อง", roles: ["admin"] },
      { href: "/dashboard/users", label: "ผู้ใช้", roles: ["admin"] },
      { href: "/dashboard/settings", label: "ตั้งค่า", roles: ["admin"] },
    ],
  },
  {
    label: "รายงานและข้อมูล",
    roles: ["admin"],
    tabs: [
      { href: "/dashboard", label: "ภาพรวม", roles: ["admin"] },
      { href: "/dashboard/reports", label: "รายงาน", roles: ["admin"] },
      {
        href: "/dashboard/bookings",
        label: "การจองทั้งหมด",
        roles: ["admin"],
      },
      {
        href: "/dashboard/integrations",
        label: "Integration",
        roles: ["admin"],
      },
      { href: "/dashboard/activity", label: "ประวัติรวม", roles: ["admin"] },
      { href: "/dashboard/data", label: "Export", roles: ["admin"] },
    ],
  },
];

// Ordered master list. Each entry is either a standalone link or a reference to
// a group (by label). buildSidebar filters this by role and expands groups.
type Entry =
  | { kind: "link"; href: string; label: string; roles: Role[] }
  | { kind: "group"; label: string };

const SIDEBAR_ORDER: Entry[] = [
  { kind: "link", href: "/home", label: "หน้าหลัก", roles: ALL },
  { kind: "link", href: "/booking", label: "จองห้อง", roles: ALL },
  { kind: "link", href: "/calendar", label: "ปฏิทิน", roles: ALL },
  { kind: "link", href: "/profile/bookings", label: "การจองของฉัน", roles: ALL },
  { kind: "group", label: "งานอนุมัติ" },
  { kind: "group", label: "จัดการระบบ" },
  { kind: "group", label: "รายงานและข้อมูล" },
  // standalone รายงาน for approver only (admin gets it inside the group above)
  {
    kind: "link",
    href: "/dashboard/reports",
    label: "รายงาน",
    roles: ["approver"],
  },
  { kind: "link", href: "/profile", label: "โปรไฟล์", roles: ALL },
];

export function buildSidebar(role: Role): SidebarItem[] {
  const items: SidebarItem[] = [];

  for (const entry of SIDEBAR_ORDER) {
    if (entry.kind === "link") {
      if (entry.roles.includes(role)) {
        items.push({ href: entry.href, label: entry.label });
      }
      continue;
    }

    const group = GROUPS.find((g) => g.label === entry.label);
    if (!group || !group.roles.includes(role)) continue;

    const accessibleTabs = group.tabs.filter((t) => t.roles.includes(role));
    if (accessibleTabs.length === 0) continue;

    items.push({
      href: accessibleTabs[0].href,
      label: group.label,
      groupHrefs: accessibleTabs.map((t) => t.href),
    });
  }

  return items;
}

export function findGroupForPath(
  pathname: string,
  role: Role
): NavGroup | null {
  for (const group of GROUPS) {
    if (!group.roles.includes(role)) continue;
    const match = group.tabs.some(
      (t) => t.href === pathname && t.roles.includes(role)
    );
    if (match) return group;
  }
  return null;
}
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `npm run test`
Expected: PASS ทุกเคส (รวมของเดิม 20 + ใหม่)

- [ ] **Step 6: Commit**

```bash
git add lib/nav.ts lib/nav.test.ts vitest.config.ts
git commit -m "feat: add central nav config with buildSidebar and findGroupForPath + tests"
```

---

### Task 2: `Tabs` และ `PageTabs` components

**Files:**
- Create: `components/ui/Tabs.tsx`
- Create: `components/ui/PageTabs.tsx`

**Interfaces:**
- Consumes: `findGroupForPath`, `type Role` จาก `@/lib/nav`
- Produces: `Tabs({ tabs })` และ default export `PageTabs({ role })`

- [ ] **Step 1: สร้าง `components/ui/Tabs.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string };

export function Tabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();

  return (
    <div className="overflow-x-auto border-b border-neutral-200 bg-surface-card px-4 md:px-6">
      <nav className="flex gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors ${
                active
                  ? "border-brand-primary font-medium text-brand-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: สร้าง `components/ui/PageTabs.tsx`**

```tsx
"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";
import { findGroupForPath, type Role } from "@/lib/nav";

export default function PageTabs({ role }: { role: Role }) {
  const pathname = usePathname();
  const group = findGroupForPath(pathname, role);

  if (!group) return null;

  const tabs = group.tabs
    .filter((t) => t.roles.includes(role))
    .map(({ href, label }) => ({ href, label }));

  if (tabs.length < 2) return null;

  return <Tabs tabs={tabs} />;
}
```

- [ ] **Step 3: ตรวจ type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add components/ui/Tabs.tsx components/ui/PageTabs.tsx
git commit -m "feat: add Tabs and PageTabs components for grouped navigation"
```

---

### Task 3: สลับ `layout.tsx` + `AppNav.tsx` มาใช้ config ใหม่

**Files:**
- Modify: `app/(app)/layout.tsx` (แทนทั้งไฟล์)
- Modify: `app/(app)/AppNav.tsx` (แทนทั้งไฟล์)

**Interfaces:**
- Consumes: `buildSidebar`, `type Role`, `type SidebarItem` จาก `@/lib/nav`; `PageTabs` จาก `@/components/ui/PageTabs`

**หมายเหตุ:** 2 ไฟล์นี้ต้องเปลี่ยนพร้อมกัน (layout ส่ง shape ใหม่ให้ AppNav) จึงเป็น task เดียว

- [ ] **Step 1: แทนทั้งไฟล์ `app/(app)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "./AppNav";
import PageTabs from "@/components/ui/PageTabs";
import { buildSidebar, type Role } from "@/lib/nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "user") as Role;
  const sidebarItems = buildSidebar(role);

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <AppNav items={sidebarItems} />
      <main className="flex-1 bg-surface-page pt-14 pb-20 md:pt-0 md:pb-0">
        <PageTabs role={role} />
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: แทนทั้งไฟล์ `app/(app)/AppNav.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SidebarItem } from "@/lib/nav";

function isActive(item: SidebarItem, pathname: string): boolean {
  if (item.groupHrefs) return item.groupHrefs.includes(pathname);
  return pathname === item.href;
}

function linkClass(active: boolean): string {
  return `rounded-sm px-3 py-2 text-sm ${
    active
      ? "bg-neutral-100 font-medium text-text-primary"
      : "text-text-secondary hover:bg-neutral-100"
  }`;
}

export default function AppNav({ items }: { items: SidebarItem[] }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <>
      <aside className="hidden w-[200px] shrink-0 border-r border-neutral-200 bg-surface-card p-4 md:block">
        <nav className="flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(isActive(item, pathname))}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="เปิดเมนู"
        className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-sm border border-neutral-200 bg-surface-card md:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-text-primary"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={() => setDrawerOpen(false)}
          />
          <nav className="absolute inset-y-0 left-0 w-64 max-w-[80vw] overflow-y-auto bg-surface-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">เมนู</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="ปิดเมนู"
                className="flex h-8 w-8 items-center justify-center rounded-sm text-lg text-text-secondary"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  className={linkClass(isActive(item, pathname))}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-neutral-200 bg-surface-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.slice(0, 4).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`text-xs ${
              isActive(item, pathname)
                ? "font-medium text-text-primary"
                : "text-text-secondary"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
```

- [ ] **Step 3: ตรวจ build**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่, ยังมี route เดิมครบ (ไม่มี route หาย)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/layout.tsx" "app/(app)/AppNav.tsx"
git commit -m "feat: switch nav to grouped sidebar (17->8 for admin) with per-group tab bars"
```

---

### Task 4: Manual verification

**Files:** ไม่มี (verification เท่านั้น)

- [ ] **Step 1: Build + tests รวม**

Run: `npm run test && npx tsc --noEmit && npm run build`
Expected: tests ผ่านหมด (เดิม 20 + nav ใหม่), build ผ่าน, route ครบเท่าเดิม

- [ ] **Step 2: ทดสอบ admin (บน local dev, login `admin@test.local` / `test1234`)**

- sidebar เห็น **8 เมนู**: หน้าหลัก · จองห้อง · ปฏิทิน · การจองของฉัน · งานอนุมัติ · จัดการระบบ · รายงานและข้อมูล · โปรไฟล์
- กด "จัดการระบบ" → เข้า `/dashboard/rooms`, เห็นแถบแท็บ [ห้อง | ผู้ใช้ | ตั้งค่า], active=ห้อง
- กดแท็บ "ผู้ใช้" → URL เป็น `/dashboard/users`, หน้าเปลี่ยน, active ย้าย, sidebar "จัดการระบบ" ยังไฮไลต์
- refresh ที่ `/dashboard/users` → แท็บ active ยังถูก (ผูก URL); ปุ่ม back → กลับ `/dashboard/rooms`
- กด "รายงานและข้อมูล" → เห็นแท็บ 6 อัน สลับได้ครบ (ภาพรวม/รายงาน/การจองทั้งหมด/Integration/ประวัติรวม/Export)

- [ ] **Step 3: ทดสอบ approver (login `approver1@test.local`)**

- sidebar เห็น 7 เมนู: มี "งานอนุมัติ" (กลุ่ม 3 แท็บ) + "รายงาน" (standalone) ไม่เห็นกลุ่ม admin
- กด "งานอนุมัติ" → เห็นแท็บ [รออนุมัติ | คำขอยกเลิก | ประวัติ]
- กด "รายงาน" → เข้า `/dashboard/reports` **ไม่มีแถบแท็บ** (ถูกต้อง — approver ใช้ standalone)

- [ ] **Step 4: ทดสอบ user (login `user@test.local`)**

- เห็น 5 เมนูเท่าเดิม ไม่มีแถบแท็บโผล่ในหน้าใด

- [ ] **Step 5: ทดสอบ mobile + backward-compat**

- ย่อจอ/`preview_resize mobile`: เปิด drawer เห็นเมนูกลุ่ม, แถบแท็บเลื่อนแนวนอนได้, bottom-nav 4 รายการทำงาน
- พิมพ์ URL เดิมตรงๆ เช่น `/dashboard/settings` → เข้าได้ + เห็นแถบแท็บ "จัดการระบบ" active=ตั้งค่า (backward-compat)

---

## Self-Review Notes

- **Spec coverage:** Tabs component → Task 2; NAV_GROUPS config → Task 1; sidebar 8/7/5 → Task 1 (buildSidebar) + Task 3 (AppNav render); PageTabs auto จาก layout → Task 2+3; ROUTE_ROLES ไม่แตะ → ยืนยันใน Task 3 build; เคสพิเศษ รายงาน dual-placement → Task 1 (SIDEBAR_ORDER approver-only + group admin) + test ครอบ; success criteria ครบใน Task 4
- **Placeholder scan:** ไม่มี TBD/TODO; ทุก step มีโค้ดครบ
- **Type consistency:** `SidebarItem { href, label, groupHrefs? }` นิยามใน Task 1 ใช้ตรงกันใน AppNav (Task 3); `Role`/`findGroupForPath`/`buildSidebar` signature ตรงกันทุก consumer; `PageTabs({ role })` และ `Tabs({ tabs })` ตรงกับที่ layout/PageTabs เรียก
- **การไฮไลต์ exact match** ยึดตาม Global Constraints ทุกจุด (Tabs, AppNav group via groupHrefs.includes ซึ่งเป็น exact เช่นกัน) — กันปัญหา `/dashboard` เป็น prefix
