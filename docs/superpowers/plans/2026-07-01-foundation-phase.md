# Foundation Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างโมดูลกลางสำหรับ Edge Functions และ Layout/Middleware ที่ใช้ร่วมกัน เพื่อให้ 4 track ฟีเจอร์ (จองห้อง, อนุมัติ, ยกเลิก, admin CRUD) เริ่มพัฒนาแบบขนานกันได้โดยไม่ชนกัน

**Architecture:** `_shared/` modules เป็น plain TypeScript ที่ไม่มี Deno-specific API เลย (ดู Global Constraints) จึง type-check ผ่าน `tsc` ของโปรเจกต์ปกติได้ทันที ฝั่ง frontend เชื่อม design token เข้ากับ Tailwind v4 แบบ CSS-first แล้วสร้าง route group `app/(app)/` ที่มี Navigation ร่วม พร้อมขยาย middleware เดิม (จาก feature password-login) ให้เช็ค role ด้วย

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4 (CSS-first `@theme`), TypeScript, Deno (runtime เป้าหมายของ `_shared/` แต่เขียนแบบ portable ไม่พึ่ง Deno API)

## Global Constraints

- `_shared/` ทั้ง 4 ไฟล์ต้องไม่ใช้ Deno-specific API ใดๆ เลย (ห้าม `Deno.serve`, `Deno.env.get`, ห้าม import ด้วย `npm:` หรือ `https://` specifier) — ออกแบบให้เป็น plain portable TypeScript ทั้งหมด เพื่อให้ project tsconfig เดิม (`**/*.ts` glob) type-check ผ่านได้โดยไม่ต้องแก้ config ใดๆ เพิ่ม (import ระหว่างไฟล์ใน `_shared/` ให้ใส่ extension `.ts` เสมอ เพราะ Deno บังคับ และ `moduleResolution: "bundler"` ของโปรเจกต์รองรับอยู่แล้ว)
- Role-based middleware check เป็นชั้น UX เท่านั้น ไม่ใช่ชั้นความปลอดภัยจริง — RLS policies และ Edge Functions ที่ใช้ service_role ยังคงเป็น hard boundary ตามที่ CLAUDE.md ออกแบบไว้
- ห้ามสร้าง `tailwind.config.ts` — โปรเจกต์ใช้ Tailwind v4 CSS-first ผ่าน `@theme` ใน `app/globals.css` เท่านั้น
- ข้อความ UI ทั้งหมดเป็นภาษาไทยทางการ ตาม CLAUDE.md กฎข้อ 9
- ห้ามแตะเนื้อหาของ 4 track (จองห้อง, อนุมัติ, ยกเลิก, admin CRUD) — อยู่นอกขอบเขต plan นี้
- Path matching ใน middleware ใช้ `startsWith` เหมือน `PROTECTED_PATHS` เดิม ไม่ใช้ exact match

---

## File Structure

| ไฟล์ | สถานะ | หน้าที่ |
|---|---|---|
| `supabase/functions/_shared/errors.ts` | สร้างใหม่ | `AppError` + subclasses |
| `supabase/functions/_shared/handler.ts` | สร้างใหม่ | `withErrorHandling()` wrapper |
| `supabase/functions/_shared/retry.ts` | สร้างใหม่ | `withRetry()` exponential backoff |
| `supabase/functions/_shared/integrationLog.ts` | สร้างใหม่ | `logIntegration()` เขียนลง `integration_health` |
| `app/globals.css` | แก้ไข | เชื่อม design token เข้า Tailwind v4 |
| `app/layout.tsx` | แก้ไข | Sarabun font + `lang="th"` |
| `app/(app)/layout.tsx` | สร้างใหม่ | Navigation ร่วม (Sidebar/Bottom Nav) |
| `app/(app)/home/page.tsx` | ย้ายจาก `app/home/page.tsx` | ไม่แก้เนื้อหา แค่ย้ายตำแหน่ง |
| `app/page.tsx` | แก้ไข | redirect ไป `/home` |
| `lib/supabase/middleware.ts` | แก้ไข | เพิ่ม `ROUTE_ROLES` role check |

---

### Task 1: `_shared/errors.ts` + `_shared/handler.ts`

**Files:**
- Create: `supabase/functions/_shared/errors.ts`
- Create: `supabase/functions/_shared/handler.ts`

**Interfaces:**
- Produces: `AppError` (base class, `statusCode: number`, `code: string`), `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409) — ทุกคลาสรับ `message: string` ตัวเดียวใน constructor
- Produces: `withErrorHandling(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response>`
- Consumes: `AppError` จาก `errors.ts` (relative import พร้อม `.ts` extension)

- [ ] **Step 1: สร้าง `errors.ts`**

```typescript
export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super("UNAUTHORIZED", message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super("NOT_FOUND", message, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
    this.name = "ConflictError";
  }
}
```

- [ ] **Step 2: สร้าง `handler.ts`**

```typescript
import { AppError } from "./errors.ts";

type Handler = (req: Request) => Promise<Response>;

export function withErrorHandling(handler: Handler): Handler {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof AppError) {
        return new Response(
          JSON.stringify({ error: err.code, message: err.message }),
          {
            status: err.statusCode,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      console.error("Unhandled error in edge function:", err);

      return new Response(
        JSON.stringify({
          error: "INTERNAL_ERROR",
          message: "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (ไม่มี Deno CLI ในเครื่องนี้ แต่ทั้งสองไฟล์เขียนแบบ portable TypeScript ล้วนๆ — ไม่มี `Deno.*` หรือ `npm:`/`https://` specifier เลย จึง type-check ผ่าน project tsconfig เดิมได้ตรงๆ โดยไม่ต้องแก้ include/exclude)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/errors.ts supabase/functions/_shared/handler.ts
git commit -m "feat: add AppError hierarchy and withErrorHandling wrapper"
```

---

### Task 2: `_shared/retry.ts` + `_shared/integrationLog.ts`

**Files:**
- Create: `supabase/functions/_shared/retry.ts`
- Create: `supabase/functions/_shared/integrationLog.ts`

**Interfaces:**
- Produces: `withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>` โดย `RetryOptions = { maxAttempts?: number; initialDelayMs?: number }`
- Produces: `logIntegration(client: InsertableClient, entry: IntegrationLogEntry): Promise<void>` โดย `IntegrationLogEntry = { service: IntegrationService; status: IntegrationStatus; payload?: Record<string, unknown>; error_detail?: string }`
- Consumes: ไม่มี — ทั้งสองไฟล์ independent จาก Task 1 (ไม่ import errors.ts/handler.ts)

**หมายเหตุการออกแบบ:** `logIntegration()` รับ `client` เป็น parameter (dependency injection) แทนที่จะสร้าง Supabase client เอง และใช้ minimal structural interface (`InsertableClient`) แทนการ import type จาก `@supabase/supabase-js` ตรงๆ — เพื่อให้ไฟล์นี้ไม่มี external dependency เลย ทั้ง Deno และ Node เรียกใช้ได้เหมือนกัน อนาคต track ที่ต้องใช้จริง (อนุมัติ, ยกเลิก) จะส่ง Supabase client ของตัวเอง (ที่สร้างด้วย `npm:@supabase/supabase-js` ใน edge function จริง) เข้ามาเป็น argument

- [ ] **Step 1: สร้าง `retry.ts`**

```typescript
export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
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

      const delay = initialDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

- [ ] **Step 2: สร้าง `integrationLog.ts`**

```typescript
export type IntegrationService =
  | "make_com"
  | "line"
  | "google_calendar"
  | "vercel"
  | "internal";

export type IntegrationStatus = "success" | "failed";

export interface IntegrationLogEntry {
  service: IntegrationService;
  status: IntegrationStatus;
  payload?: Record<string, unknown>;
  error_detail?: string;
}

interface InsertableClient {
  from(table: string): {
    insert(
      row: Record<string, unknown>
    ): Promise<{ error: { message: string } | null }>;
  };
}

export async function logIntegration(
  client: InsertableClient,
  entry: IntegrationLogEntry
): Promise<void> {
  const { error } = await client.from("integration_health").insert({
    service: entry.service,
    status: entry.status,
    payload: entry.payload ?? null,
    error_detail: entry.error_detail ?? null,
  });

  if (error) {
    console.error(
      "logIntegration: failed to write integration_health row:",
      error.message
    );
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/retry.ts supabase/functions/_shared/integrationLog.ts
git commit -m "feat: add withRetry and logIntegration shared utilities"
```

---

### Task 3: เชื่อม Design Tokens เข้ากับ Tailwind v4 + แก้ Root Layout

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `tokens/tokens.css` (มีอยู่แล้ว ไม่แก้ไข — แค่ `@import` เข้ามาใช้)
- Produces: CSS utility classes ใหม่ที่ทุก track ต่อไปจะใช้ เช่น `bg-brand-primary`, `text-danger-text`, `rounded-pill`, `shadow-card`, `text-lg` (ค่า 17px ตาม DESIGN.md ไม่ใช่ default ของ Tailwind)

**หมายเหตุ:** ไม่ต้องแก้ token ด้าน spacing (`space.1`-`space.8`) เพราะค่าตรงกับ Tailwind default spacing scale อยู่แล้วเป๊ะ (เช่น `space.4 = 16px` ตรงกับ `p-4` ของ Tailwind พอดี) และไม่ต้องแก้ font-weight เพราะค่าตัวเลขก็ตรงกับ default เช่นกัน (แค่ใช้ชื่อ utility ของ Tailwind เอง เช่น `font-medium`, `font-semibold` แทน token name)

- [ ] **Step 1: เขียน `app/globals.css` ใหม่ทั้งไฟล์**

```css
@import "tailwindcss";
@import "../tokens/tokens.css";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-family-base);
  --font-mono: var(--font-family-mono);

  /* Brand */
  --color-brand-primary:        var(--color-brand-primary);
  --color-brand-primary-strong: var(--color-brand-primary-strong);
  --color-brand-accent:         var(--color-brand-accent);

  /* Neutral scale — ทับ default ของ Tailwind บางขั้นโดยตั้งใจ
     ให้ bg-neutral-500 ฯลฯ ใช้โทนเทา-เขียวของ DESIGN.md แทน default */
  --color-neutral-0:   var(--color-neutral-0);
  --color-neutral-50:  var(--color-neutral-50);
  --color-neutral-100: var(--color-neutral-100);
  --color-neutral-150: var(--color-neutral-150);
  --color-neutral-200: var(--color-neutral-200);
  --color-neutral-300: var(--color-neutral-300);
  --color-neutral-400: var(--color-neutral-400);
  --color-neutral-500: var(--color-neutral-500);
  --color-neutral-600: var(--color-neutral-600);
  --color-neutral-700: var(--color-neutral-700);
  --color-neutral-900: var(--color-neutral-900);

  /* Surface */
  --color-surface-page:   var(--color-surface-page);
  --color-surface-card:   var(--color-surface-card);
  --color-surface-sunken: var(--color-surface-sunken);
  --color-surface-field:  var(--color-surface-field);

  /* Text */
  --color-text-primary:    var(--color-text-primary);
  --color-text-secondary:  var(--color-text-secondary);
  --color-text-muted:      var(--color-text-muted);
  --color-text-on-primary: var(--color-text-on-primary);

  /* Status: success */
  --color-success-solid:   var(--color-success-solid);
  --color-success-accent:  var(--color-success-accent);
  --color-success-surface: var(--color-success-surface);
  --color-success-text:    var(--color-success-text);

  /* Status: warning */
  --color-warning-accent:  var(--color-warning-accent);
  --color-warning-surface: var(--color-warning-surface);
  --color-warning-text:    var(--color-warning-text);
  --color-warning-border:  var(--color-warning-border);

  /* Status: danger */
  --color-danger-solid:   var(--color-danger-solid);
  --color-danger-surface: var(--color-danger-surface);
  --color-danger-text:    var(--color-danger-text);
  --color-danger-border:  var(--color-danger-border);

  /* Radius — ทับ default ของ Tailwind ให้ตรงกับ DESIGN.md */
  --radius-sm:   var(--radius-sm);
  --radius-md:   var(--radius-md);
  --radius-lg:   var(--radius-lg);
  --radius-xl:   var(--radius-xl);
  --radius-pill: var(--radius-pill);

  /* Shadow — เพิ่ม key ใหม่ ไม่ทับ default */
  --shadow-card:   var(--shadow-card);
  --shadow-raised: var(--shadow-raised);
  --shadow-modal:  var(--shadow-modal);

  /* Font size — ทับ default ของ Tailwind ให้ตรงกับ DESIGN.md (หน่วย px ตรงตัว) */
  --text-xs:   var(--font-size-xs);
  --text-sm:   var(--font-size-sm);
  --text-base: var(--font-size-base);
  --text-md:   var(--font-size-md);
  --text-lg:   var(--font-size-lg);
  --text-xl:   var(--font-size-xl);
  --text-2xl:  var(--font-size-2xl);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
}
```

- [ ] **Step 2: แก้ `app/layout.tsx` — เปลี่ยนฟอนต์และ lang**

```tsx
import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import "./globals.css";

const sarabun = Sarabun({
  variable: "--font-family-base",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ระบบจองห้องประชุม LPRU",
  description: "ระบบจองห้องประชุมออนไลน์ มหาวิทยาลัยราชภัฏลำปาง",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${sarabun.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

หมายเหตุ: `sarabun.variable` ตั้งชื่อ CSS variable เป็น `--font-family-base` ตรงๆ (ทับค่า hardcode `'Sarabun', system-ui, sans-serif` ใน `tokens/tokens.css` ด้วยค่าที่ Next.js font optimizer สร้างให้ ซึ่งจะเป็น Sarabun เหมือนกันแต่มี fallback stack ที่ถูกต้องและ preload ให้อัตโนมัติ)

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build สำเร็จ ไม่มี error เกี่ยวกับ CSS import หรือ font

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: wire design tokens into Tailwind v4 theme, switch to Sarabun font"
```

---

### Task 4: Layout ร่วมสำหรับหน้าที่ Login แล้ว + ย้าย Home Page

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/home/page.tsx` (ย้ายเนื้อหาจาก `app/home/page.tsx`)
- Delete: `app/home/page.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `lib/supabase/server.ts` (มีอยู่แล้วจาก feature password-login)
- Produces: Navigation component ที่ใช้ token ใหม่จาก Task 3 (`bg-brand-primary`, `bg-surface-card` ฯลฯ)

- [ ] **Step 1: สร้าง `app/(app)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type NavItem = { href: string; label: string };

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  user: [
    { href: "/home", label: "หน้าหลัก" },
    { href: "/booking", label: "จองห้อง" },
    { href: "/calendar", label: "ปฏิทิน" },
    { href: "/profile/bookings", label: "การจองของฉัน" },
    { href: "/profile", label: "โปรไฟล์" },
  ],
  approver: [
    { href: "/approver", label: "คำขออนุมัติ" },
    { href: "/approver/cancel-requests", label: "คำขอยกเลิก" },
    { href: "/approver/history", label: "ประวัติการทำงาน" },
    { href: "/dashboard/reports", label: "รายงาน" },
  ],
  admin: [
    { href: "/dashboard", label: "ภาพรวมระบบ" },
    { href: "/dashboard/rooms", label: "จัดการห้อง" },
    { href: "/dashboard/users", label: "จัดการผู้ใช้" },
    { href: "/dashboard/bookings", label: "การจองทั้งหมด" },
    { href: "/dashboard/settings", label: "ตั้งค่า" },
    { href: "/dashboard/data", label: "ข้อมูล/Export" },
    { href: "/dashboard/integrations", label: "Integration Health" },
    { href: "/dashboard/activity", label: "ประวัติรวม" },
  ],
};

function navForRole(role: string): NavItem[] {
  const items = [...NAV_BY_ROLE.user];
  if (role === "approver" || role === "admin") {
    items.push(...NAV_BY_ROLE.approver);
  }
  if (role === "admin") {
    items.push(...NAV_BY_ROLE.admin);
  }
  return items;
}

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

  const role = profile?.role ?? "user";
  const navItems = navForRole(role);

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="hidden w-[200px] shrink-0 border-r border-neutral-200 bg-surface-card p-4 md:block">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-sm px-3 py-2 text-sm text-text-secondary hover:bg-neutral-100"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      <main className="flex-1 bg-surface-page">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 flex h-16 items-center justify-around border-t border-neutral-200 bg-surface-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {navItems.slice(0, 4).map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="text-xs text-text-secondary"
          >
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: ย้าย home page**

Create `app/(app)/home/page.tsx` ด้วยเนื้อหาเดิมทุกตัวอักษรจาก `app/home/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("users")
    .select("full_name, email, role")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-600">
          ไม่พบข้อมูลผู้ใช้งาน กรุณาลองเข้าสู่ระบบใหม่
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">
          ยินดีต้อนรับ {profile.full_name}
        </h1>
        <p className="mt-2 text-zinc-600">
          {profile.email} — บทบาท: {profile.role}
        </p>
      </div>
    </div>
  );
}
```

จากนั้นลบไฟล์เดิม `app/home/page.tsx` ทิ้ง (`git rm app/home/page.tsx` — ดูขั้นตอน commit ด้านล่าง)

- [ ] **Step 3: แก้ `app/page.tsx` ให้ redirect ไป `/home`**

```tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/home");
}
```

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: build สำเร็จ, route list แสดง `/home` (จาก `app/(app)/home`) และ `/` ทั้งคู่ ไม่มี route ซ้ำกัน

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/layout.tsx" "app/(app)/home/page.tsx" app/page.tsx
git rm app/home/page.tsx
git commit -m "feat: add shared authenticated layout with role-based nav, move home page into it"
```

---

### Task 5: ขยาย Middleware ให้เช็ค Role

**Files:**
- Modify: `lib/supabase/middleware.ts`

**Interfaces:**
- Consumes: `public.users.role` column (query ใหม่ที่เพิ่มเข้ามาใน `updateSession()`)
- Produces: `updateSession(request: NextRequest): Promise<NextResponse>` — signature เดิมไม่เปลี่ยน แค่ logic ข้างในเพิ่มการเช็ค role

- [ ] **Step 1: แก้ `lib/supabase/middleware.ts` ทั้งไฟล์**

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ROUTE_ROLES: Record<string, string[]> = {
  "/setup": ["admin"],
  "/dashboard": ["admin"],
  "/approver": ["approver", "admin"],
  "/home": ["user", "approver", "admin"],
  "/booking": ["user", "approver", "admin"],
  "/calendar": ["user", "approver", "admin"],
  "/profile": ["user", "approver", "admin"],
};

function matchRoute(pathname: string): string[] | null {
  for (const [prefix, roles] of Object.entries(ROUTE_ROLES)) {
    if (pathname.startsWith(prefix)) {
      return roles;
    }
  }
  return null;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const requiredRoles = matchRoute(request.nextUrl.pathname);

  if (requiredRoles) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !requiredRoles.includes(profile.role)) {
      return NextResponse.redirect(new URL("/home", request.url));
    }
  }

  return response;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual verification — redirect ทันทีด้วย curl (ไม่ต้องมี session)**

Run: `npm run dev` แล้วรันคำสั่งนี้ในเทอร์มินัลที่สอง:
```bash
curl -sI http://localhost:3000/dashboard
```
Expected: header มี `location: /login` และ status `307` (ไม่มี user เลย ตกไปกฎข้อ 1)

หยุด dev server หลังเช็คเสร็จ (Ctrl+C)

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/middleware.ts
git commit -m "feat: add role-based route protection to middleware"
```

---

### Task 6: Manual E2E Verification (มี credential จริงแล้ว — ทำได้เต็มรูปแบบ)

ต่างจาก feature password-login รอบก่อน ตอนนี้ `.env.local` มี credential จริงของ Supabase Cloud อยู่แล้ว และมี test users 4 บัญชีพร้อม seed data ครบ — ทำการตรวจสอบเต็มรูปแบบได้เลยไม่ต้องส่งต่อให้ user

**Files:** ไม่มี (verification เท่านั้น)

- [ ] **Step 1: Build และ type-check รวม**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่ ไม่มี error

- [ ] **Step 2: ทดสอบ role-based nav ด้วย browser preview — login เป็น `user@test.local`**

เปิด dev server, login ด้วย `user@test.local` / `test1234`, ตรวจสอบ:
- อยู่ที่ `/home` เห็นเมนู 5 อัน (หน้าหลัก, จองห้อง, ปฏิทิน, การจองของฉัน, โปรไฟล์) — ไม่เห็นเมนู "คำขออนุมัติ" หรือ "จัดการห้อง"
- สีพื้นหลัง sidebar/nav ใช้ token ใหม่ (ตรวจด้วย inspect ว่า `background-color` ตรงกับ `#ffffff` ของ `--color-surface-card`)

- [ ] **Step 3: ทดสอบ role-based nav — login เป็น `approver1@test.local`**

ตรวจสอบเห็นเมนู 9 อัน (5 ของ user + 4 ของ approver: คำขออนุมัติ, คำขอยกเลิก, ประวัติการทำงาน, รายงาน) — ไม่เห็นเมนู admin (จัดการห้อง, จัดการผู้ใช้ ฯลฯ)

- [ ] **Step 4: ทดสอบ role-based nav — login เป็น `admin@test.local`**

ตรวจสอบเห็นเมนูครบทั้ง 17 อัน (5+4+8)

- [ ] **Step 5: ทดสอบ role guard บังคับ — login เป็น `user@test.local` แล้วพยายามเข้า `/dashboard` ตรงๆ**

Expected: ถูก redirect กลับ `/home` ทันที (ไม่ใช่ error, ไม่ใช่หน้า dashboard)

- [ ] **Step 6: ทดสอบ responsive — ย่อหน้าจอต่ำกว่า 768px**

Expected: Sidebar หายไป เห็น Bottom Navigation แทน (4 เมนูแรก)

- [ ] **Step 7: ทดสอบ `/` root redirect**

เข้า `http://localhost:3000/` ตรงๆ (ตอน login แล้ว) → ถูก redirect ไป `/home` ทันที

---

## Self-Review Notes

- **Spec coverage:** F1 (4 ไฟล์) → Task 1-2, F2.1 (token+font) → Task 3, F2.2 (layout+nav+ย้ายไฟล์) → Task 4, F2.3 (middleware role) → Task 5, Success Criteria ทั้ง 6 ข้อในสเปค → Task 6 ครบทุกข้อ
- **Placeholder scan:** ไม่มี TBD/TODO ทุก step มีโค้ดเต็มหรือคำสั่งที่รันได้จริง
- **Type consistency:** `updateSession(request: NextRequest): Promise<NextResponse>` signature เดิมไม่เปลี่ยนระหว่าง Task 5 กับของเดิม (Task 3 ของ feature password-login) — ตรวจแล้วว่า `root middleware.ts` (ไฟล์ entrypoint ที่เรียก `updateSession`) ไม่ต้องแก้อะไรเพิ่มเพราะ signature เหมือนเดิมทุกประการ
- **Deno portability:** ยืนยันแล้วว่าทั้ง 4 ไฟล์ใน `_shared/` (Task 1-2) ไม่มี `Deno.*`, `npm:`, หรือ `https://` import เลย — เป็น plain TypeScript ล้วนที่ type-check ผ่าน project tsconfig เดิมได้ทันทีโดยไม่ต้องแก้ `include`/`exclude`
