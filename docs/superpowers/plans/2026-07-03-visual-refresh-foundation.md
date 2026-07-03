# Visual Refresh — Foundation (sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** อัปเดต design token ให้สีสดใสขึ้น + สร้าง 5 shared UI component (Card/Button/Badge/Modal/Skeleton) พร้อม shadow-hover และ animation แล้ว apply กับ 4 หน้าหลัก (`/home`, `/booking`, `/dashboard`, `/approver`)

**Architecture:** เปลี่ยนค่า CSS variable ที่มีอยู่แล้วใน `tokens/tokens.css` (ไม่เปลี่ยนชื่อ) + เพิ่ม keyframe/animation ใหม่ใน `app/globals.css` แล้วสร้าง component กลางใน `components/ui/` ให้ 4 หน้าเรียกใช้แทนการเขียน className ซ้ำเอง

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4 (CSS-first `@theme` config), ไม่เพิ่ม animation library ภายนอก

## Global Constraints

- **Design tokens เท่านั้น** (CLAUDE.md กฎข้อ 10) — ห้าม hardcode สี/spacing ใหม่ที่ไม่มาจาก token
- **ข้อความ UI ภาษาไทยทางการ** (CLAUDE.md กฎข้อ 9) — ไม่แก้ข้อความใดๆ ในงานนี้ แค่ visual layer
- **ไม่แตะ business logic, Edge Function, หรือ data fetching ใดๆ เลย** — เฉพาะ className/JSX structure เท่านั้น
- **ไม่เพิ่ม animation library ภายนอก** (เช่น framer-motion) — ใช้ Tailwind utility + CSS `@keyframes` ที่มีอยู่แล้วในโปรเจกต์เท่านั้น
- **ไม่เปลี่ยนชื่อ CSS variable ที่มีอยู่แล้ว** (เช่น `--color-brand-primary`) — เปลี่ยนแค่ค่า เพื่อไม่ให้กระทบ 12 หน้าที่เหลือนอกสโคป (sub-project B)
- **`shadow-card`/`shadow-raised`/`shadow-modal` มีอยู่แล้ว** ห้ามสร้าง shadow token ใหม่ซ้ำซ้อน — ใช้ของเดิม
- **ทุก component ใหม่ต้องอยู่ใน `components/ui/`** ไฟล์ละ 1 component เดียว

## File Structure

| File | หน้าที่ |
|---|---|
| `tokens/tokens.css` | ค่า CSS variable ของสี, shadow, transition (แก้ค่า ไม่แก้ชื่อ) |
| `app/globals.css` | เพิ่ม `@keyframes` + `--animate-*` mapping เข้า Tailwind |
| `docs/DESIGN.md` | อัปเดตตารางค่า token ให้ตรงกับของจริง |
| `components/ui/Card.tsx` | การ์ดกลาง พร้อม shadow + hover elevation |
| `components/ui/Button.tsx` | ปุ่มกลาง 3 variant พร้อม scale animation |
| `components/ui/Badge.tsx` | badge สถานะกลาง (แทน `STATUS_BADGE_CLASS` ที่ hardcode ไว้ใน 2 ไฟล์) |
| `components/ui/Modal.tsx` | dialog wrapper พร้อม scale-fade animation |
| `components/ui/Skeleton.tsx` | loading placeholder |
| `app/(app)/home/page.tsx` | ใช้ Card ใหม่ + แก้สีเก่าที่ตกหล่น (`text-red-600` ฯลฯ) |
| `app/(app)/booking/page.tsx` | ใช้ Card/Button/Skeleton ใหม่ |
| `app/(app)/dashboard/page.tsx` | ใช้ Card ใหม่ |
| `app/(app)/approver/page.tsx` | ใช้ Card/Button/Modal/Skeleton ใหม่ |

---

### Task 1: อัปเดต Design Tokens

**Files:**
- Modify: `tokens/tokens.css:6-8` (สี), `tokens/tokens.css:85-89` (shadow, เพิ่ม transition)
- Modify: `app/globals.css` (เพิ่ม keyframe + animate mapping)
- Modify: `docs/DESIGN.md` (อัปเดตตารางให้ตรงค่าใหม่)

**Interfaces:**
- Produces: CSS variable `--color-brand-primary`/`--color-brand-primary-strong` ค่าใหม่, `--gradient-brand` ใหม่, `--shadow-raised` ค่าใหม่ (เด่นขึ้น), `--transition-base` ใหม่ (เอกสารอ้างอิง), Tailwind utility class `animate-fade-in-up`/`animate-scale-fade-in` ใหม่

- [ ] **Step 1: แก้สีใน `tokens/tokens.css`**

แทนที่บรรทัด 6-8:

```css
  --color-brand-primary:        #15727d;
  --color-brand-primary-strong: #0e5a63;
  --color-brand-accent:         #2a8a86;
```

ด้วย:

```css
  --color-brand-primary:        #0d8a5f;
  --color-brand-primary-strong: #0a6b48;
  --color-brand-accent:         #2a8a86;
  --gradient-brand: linear-gradient(135deg, #0d8a5f, #10b981);
```

- [ ] **Step 2: แก้ shadow + เพิ่ม transition ใน `tokens/tokens.css`**

แทนที่บรรทัด 85-89 (ท้ายไฟล์):

```css
  /* ---- Shadow ---- */
  --shadow-card:   0 3px 14px rgba(20, 60, 64, 0.05);
  --shadow-raised: 0 4px 18px rgba(20, 60, 64, 0.06);
  --shadow-modal:  0 20px 50px rgba(0, 0, 0, 0.25);
}
```

ด้วย:

```css
  /* ---- Shadow ---- */
  --shadow-card:   0 3px 14px rgba(20, 60, 64, 0.05);
  --shadow-raised: 0 8px 24px rgba(13, 138, 95, 0.16);
  --shadow-modal:  0 20px 50px rgba(0, 0, 0, 0.25);

  /* ---- Transition ---- */
  --transition-base: 150ms;
}
```

(ค่า `--transition-base` เป็นเอกสารอ้างอิงหลัก — component จริงใช้ Tailwind utility `duration-150` ที่มีอยู่แล้วในตัว เพราะตรงกับ 150ms เป๊ะ ไม่ต้อง map เข้า Tailwind theme เพิ่มให้เสี่ยง syntax ผิด)

- [ ] **Step 3: เพิ่ม keyframe animation ใน `app/globals.css`**

หาบรรทัด `@theme inline {` แล้วเพิ่ม 2 บรรทัดนี้ต่อท้ายก่อนปิด `}` ของ `@theme inline` (ต่อจากบรรทัด `--text-2xl: var(--font-size-2xl);`):

```css
  /* Animation */
  --animate-fade-in-up: fade-in-up 0.3s ease-out;
  --animate-scale-fade-in: scale-fade-in 0.15s ease-out;
```

แล้วเพิ่ม `@keyframes` ต่อท้ายไฟล์ทั้งหมด (หลัง `body { ... }` block สุดท้าย):

```css
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scale-fade-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

- [ ] **Step 4: อัปเดต `docs/DESIGN.md` ให้ตรงค่าใหม่**

แก้บรรทัดตาราง Brand (หา `| brand.primary |` และ `| brand.primary-strong |`):

```markdown
| brand.primary | `--color-brand-primary` | `#0d8a5f` | ปุ่มหลัก · แถบ active · ไฮไลต์ |
| brand.primary-strong | `--color-brand-primary-strong` | `#0a6b48` | พื้นหลังเข้ม · แถบสรุปห้องที่เลือก |
| brand.accent | `--color-brand-accent` | `#2a8a86` | eyebrow · ลิงก์ · ข้อความเน้น |
| brand.gradient | `--gradient-brand` | `linear-gradient(135deg, #0d8a5f, #10b981)` | ปุ่ม/ไฮไลต์พิเศษ |
```

แก้บรรทัดตาราง Shadow (หา `| shadow.raised |`):

```markdown
| shadow.raised | `--shadow-raised` | `0 8px 24px rgba(13,138,95,.16)` |
```

- [ ] **Step 5: ตรวจว่า build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่ (การเปลี่ยน CSS variable ไม่กระทบ TypeScript)

- [ ] **Step 6: Commit**

```bash
git add tokens/tokens.css app/globals.css docs/DESIGN.md
git commit -m "feat: update brand colors to vibrant green-teal, boost hover shadow, add fade/scale animation keyframes"
```

---

### Task 2: `Card` Component

**Files:**
- Create: `components/ui/Card.tsx`

**Interfaces:**
- Consumes: token `shadow-card`/`shadow-raised` (มีอยู่แล้ว), Tailwind `duration-150` (built-in)
- Produces: `Card({ children, className?, padding? })` — export จาก `@/components/ui/Card`

- [ ] **Step 1: สร้างไฟล์**

```tsx
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  padding = "p-5",
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-neutral-200 bg-surface-card ${padding} shadow-card transition-shadow duration-150 hover:shadow-raised ${className}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: ตรวจว่า type-check ผ่าน**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/ui/Card.tsx
git commit -m "feat: add shared Card component with shadow hover elevation"
```

---

### Task 3: `Button` Component

**Files:**
- Create: `components/ui/Button.tsx`

**Interfaces:**
- Consumes: token `brand-primary`/`brand-primary-strong`/`danger-*`/`neutral-*` (มีอยู่แล้ว)
- Produces: `Button({ variant?, className?, children, ...rest })` — export จาก `@/components/ui/Button`, `variant: "primary" | "secondary" | "danger"` (default `"primary"`), รับ `ButtonHTMLAttributes<HTMLButtonElement>` ทั้งหมด (เช่น `onClick`, `disabled`, `type`)

- [ ] **Step 1: สร้างไฟล์**

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-primary text-text-on-primary hover:bg-brand-primary-strong",
  secondary:
    "border border-neutral-300 text-text-secondary hover:bg-neutral-100",
  danger:
    "border border-danger-border bg-danger-surface text-danger-text hover:bg-danger-solid hover:text-text-on-primary",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rounded-sm px-4 py-2 text-sm font-medium transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: ตรวจว่า type-check ผ่าน**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/ui/Button.tsx
git commit -m "feat: add shared Button component with 3 variants and scale animation"
```

---

### Task 4: `Badge` Component + Refactor 2 หน้าที่มี `STATUS_BADGE_CLASS` อยู่แล้ว

**Files:**
- Create: `components/ui/Badge.tsx`
- Modify: `app/(app)/dashboard/bookings/page.tsx`
- Modify: `app/(app)/profile/bookings/page.tsx`

**Interfaces:**
- Produces: `Badge({ tone, children })` — export จาก `@/components/ui/Badge`, `tone: "success" | "warning" | "danger" | "neutral"`

- [ ] **Step 1: สร้างไฟล์ `components/ui/Badge.tsx`**

```tsx
import type { ReactNode } from "react";

type BadgeTone = "success" | "warning" | "danger" | "neutral";

const TONE_CLASS: Record<BadgeTone, string> = {
  success: "bg-success-surface text-success-text",
  warning: "bg-warning-surface text-warning-text",
  danger: "bg-danger-surface text-danger-text",
  neutral: "bg-neutral-150 text-text-secondary",
};

export function Badge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-pill px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Refactor `app/(app)/dashboard/bookings/page.tsx`**

แทนที่บล็อกนี้ (ที่มี `STATUS_BADGE_CLASS` และ `import` เดิม):

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
```

ด้วย:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/Badge";
```

แทนที่บล็อกนี้:

```tsx
const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "bg-warning-surface text-warning-text",
  approved: "bg-success-surface text-success-text",
  cancel_requested: "bg-warning-surface text-warning-text",
  rejected: "bg-danger-surface text-danger-text",
  cancelled: "bg-neutral-150 text-text-secondary",
  cancelled_by_admin: "bg-neutral-150 text-text-secondary",
};
```

ด้วย:

```tsx
const STATUS_TONE: Record<
  string,
  "success" | "warning" | "danger" | "neutral"
> = {
  pending: "warning",
  approved: "success",
  cancel_requested: "warning",
  rejected: "danger",
  cancelled: "neutral",
  cancelled_by_admin: "neutral",
};
```

แทนที่บล็อกนี้:

```tsx
            <span
              className={`mt-1 inline-block rounded-pill px-2.5 py-0.5 text-xs font-semibold ${
                STATUS_BADGE_CLASS[b.final_status] ??
                "bg-neutral-150 text-text-secondary"
              }`}
            >
              {STATUS_LABEL[b.final_status] ?? b.final_status}
            </span>
```

ด้วย:

```tsx
            <div className="mt-1">
              <Badge tone={STATUS_TONE[b.final_status] ?? "neutral"}>
                {STATUS_LABEL[b.final_status] ?? b.final_status}
              </Badge>
            </div>
```

- [ ] **Step 3: Refactor `app/(app)/profile/bookings/page.tsx`**

แทนที่บล็อกนี้:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
```

ด้วย:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/Badge";
```

แทนที่บล็อกนี้:

```tsx
const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "bg-warning-surface text-warning-text",
  approved: "bg-success-surface text-success-text",
  cancel_requested: "bg-warning-surface text-warning-text",
  rejected: "bg-danger-surface text-danger-text",
  cancelled: "bg-neutral-150 text-text-secondary",
  cancelled_by_admin: "bg-neutral-150 text-text-secondary",
};
```

ด้วย:

```tsx
const STATUS_TONE: Record<
  string,
  "success" | "warning" | "danger" | "neutral"
> = {
  pending: "warning",
  approved: "success",
  cancel_requested: "warning",
  rejected: "danger",
  cancelled: "neutral",
  cancelled_by_admin: "neutral",
};
```

แทนที่บล็อกนี้:

```tsx
            <span
              className={`mt-1 inline-block rounded-pill px-2.5 py-0.5 text-xs font-semibold ${
                STATUS_BADGE_CLASS[b.final_status] ??
                "bg-neutral-150 text-text-secondary"
              }`}
            >
              {STATUS_LABEL[b.final_status] ?? b.final_status}
            </span>
```

ด้วย:

```tsx
            <div className="mt-1">
              <Badge tone={STATUS_TONE[b.final_status] ?? "neutral"}>
                {STATUS_LABEL[b.final_status] ?? b.final_status}
              </Badge>
            </div>
```

- [ ] **Step 4: ตรวจว่า build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่

- [ ] **Step 5: Commit**

```bash
git add components/ui/Badge.tsx "app/(app)/dashboard/bookings/page.tsx" "app/(app)/profile/bookings/page.tsx"
git commit -m "feat: add shared Badge component, refactor dashboard/bookings and profile/bookings to use it"
```

---

### Task 5: `Modal` Component

**Files:**
- Create: `components/ui/Modal.tsx`

**Interfaces:**
- Consumes: token `shadow-modal` (มีอยู่แล้ว), keyframe `scale-fade-in` (จาก Task 1)
- Produces: `Modal({ open, onClose, children })` — export จาก `@/components/ui/Modal`

- [ ] **Step 1: สร้างไฟล์**

```tsx
"use client";

import type { ReactNode } from "react";

export function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-sm animate-scale-fade-in rounded-xl bg-surface-card p-6 shadow-modal">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: ตรวจว่า type-check ผ่าน**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/ui/Modal.tsx
git commit -m "feat: add shared Modal component with scale-fade animation"
```

---

### Task 6: `Skeleton` Component

**Files:**
- Create: `components/ui/Skeleton.tsx`

**Interfaces:**
- Produces: `Skeleton({ className? })` — export จาก `@/components/ui/Skeleton`

- [ ] **Step 1: สร้างไฟล์**

```tsx
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-neutral-150 ${className}`} />
  );
}
```

- [ ] **Step 2: ตรวจว่า type-check ผ่าน**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/ui/Skeleton.tsx
git commit -m "feat: add shared Skeleton loading placeholder component"
```

---

### Task 7: Apply กับ `/home`

**Files:**
- Modify: `app/(app)/home/page.tsx`

**Interfaces:**
- Consumes: `Card` จาก Task 2

**คำเตือน:** ไฟล์นี้เป็น Server Component (`async function`, ไม่มี `"use client"`) — Card component ไม่มี interactivity ใดๆ จึงใช้ได้ปกติใน Server Component

- [ ] **Step 1: แทนที่ทั้งไฟล์**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";

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
        <p className="text-danger-text">
          ไม่พบข้อมูลผู้ใช้งาน กรุณาลองเข้าสู่ระบบใหม่
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="animate-fade-in-up text-center">
        <h1 className="text-2xl font-semibold text-text-primary">
          ยินดีต้อนรับ {profile.full_name}
        </h1>
        <p className="mt-2 text-text-secondary">
          {profile.email} — บทบาท: {profile.role}
        </p>
      </Card>
    </div>
  );
}
```

(สังเกต: แก้ `text-red-600`/`text-zinc-900`/`text-zinc-600` เดิมที่ตกหล่นให้ใช้ token `text-danger-text`/`text-text-primary`/`text-text-secondary` แทนไปในตัว — เป็นการแก้ pre-existing violation ของ CLAUDE.md กฎข้อ 10 ที่ตรงกับงานนี้พอดี)

- [ ] **Step 2: ตรวจว่า build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/home/page.tsx"
git commit -m "feat: apply Card component and fade-in animation to /home, fix pre-existing hardcoded colors"
```

---

### Task 8: Apply กับ `/booking`

**Files:**
- Modify: `app/(app)/booking/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `Skeleton` จาก Task 2/3/6

- [ ] **Step 1: แทนที่ทั้งไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

type BookingConfig = {
  office_start_hour: number;
  office_end_hour: number;
  holidays: string[];
};

type Room = {
  id: string;
  name: string;
  capacity: number;
  equipment: string[];
};

export default function BookingPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [config, setConfig] = useState<BookingConfig | null>(null);
  const [configError, setConfigError] = useState(false);

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [rooms, setRooms] = useState<Room[]>([]);
  const [unavailableRoomIds, setUnavailableRoomIds] = useState<Set<string>>(
    new Set()
  );
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [title, setTitle] = useState("");
  const [activity, setActivity] = useState("");
  const [attendees, setAttendees] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refId, setRefId] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-booking-config`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }
        );

        if (res.ok) {
          setConfig(await res.json());
        } else {
          setConfigError(true);
        }
      } catch {
        setConfigError(true);
      }
    }
    loadConfig();
  }, []);

  const minTime = config
    ? `${String(config.office_start_hour).padStart(2, "0")}:00`
    : undefined;
  const maxTime = config
    ? `${String(config.office_end_hour).padStart(2, "0")}:00`
    : undefined;
  const isHoliday = config ? config.holidays.includes(date) : false;

  async function handleSearch() {
    setSearching(true);
    setSearchError(null);
    setHasSearched(false);

    const supabase = createClient();
    const startISO = `${date}T${startTime}:00+07:00`;
    const endISO = `${date}T${endTime}:00+07:00`;

    const { data: roomsData, error: roomsError } = await supabase
      .from("rooms")
      .select("id, name, capacity, equipment")
      .neq("status", "maintenance")
      .order("capacity", { ascending: true });

    if (roomsError) {
      setSearchError("ไม่สามารถโหลดรายชื่อห้องได้ กรุณาลองใหม่อีกครั้ง");
      setSearching(false);
      return;
    }

    const { data: slots, error: slotsError } = await supabase
      .from("booking_slots")
      .select("room_id")
      .lt("start_time", endISO)
      .gt("end_time", startISO);

    if (slotsError) {
      setSearchError("ไม่สามารถตรวจสอบห้องว่างได้ กรุณาลองใหม่อีกครั้ง");
      setSearching(false);
      return;
    }

    setRooms(roomsData ?? []);
    setUnavailableRoomIds(
      new Set((slots ?? []).map((s: { room_id: string }) => s.room_id))
    );
    setHasSearched(true);
    setSearching(false);
  }

  function handleSelectRoom(room: Room) {
    setSelectedRoom(room);
    setStep(2);
  }

  const attendeesExceedsCapacity =
    selectedRoom !== null &&
    attendees !== "" &&
    Number(attendees) > selectedRoom.capacity;

  async function handleSubmit() {
    if (!selectedRoom) return;
    if (attendeesExceedsCapacity) return;

    setSubmitting(true);
    setSubmitError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setSubmitError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setSubmitting(false);
      return;
    }

    const startISO = `${date}T${startTime}:00+07:00`;
    const endISO = `${date}T${endTime}:00+07:00`;

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-booking`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room_id: selectedRoom.id,
          title,
          activity,
          attendees: Number(attendees),
          start_time: startISO,
          end_time: endISO,
        }),
      }
    );

    const result = await res.json();

    if (!res.ok) {
      setSubmitError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      setSubmitting(false);
      return;
    }

    setRefId(result.ref_id);
    setSubmitting(false);
  }

  function handleBackToSearch() {
    setStep(1);
    setSelectedRoom(null);
    setSubmitError(null);
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">จองห้องประชุม</h1>

      {step === 1 && (
        <div className="mt-6 space-y-4">
          {configError && (
            <p className="text-sm text-warning-text">
              ไม่สามารถโหลดเวลาทำการได้ กรุณาตรวจสอบเวลาทำการก่อนจอง
            </p>
          )}

          <Card>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                วันที่
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-sm border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                เวลาเริ่ม
                <input
                  type="time"
                  value={startTime}
                  min={minTime}
                  max={maxTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="rounded-sm border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                เวลาจบ
                <input
                  type="time"
                  value={endTime}
                  min={minTime}
                  max={maxTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="rounded-sm border border-neutral-300 px-3 py-2"
                />
              </label>
            </div>

            {isHoliday && (
              <p className="mt-3 text-sm text-danger-text">
                วันที่เลือกเป็นวันหยุด ไม่สามารถจองห้องได้
              </p>
            )}

            <Button
              onClick={handleSearch}
              disabled={!date || !startTime || !endTime || isHoliday || searching}
              className="mt-4"
            >
              {searching ? "กำลังค้นหา..." : "ค้นหาห้องว่าง"}
            </Button>

            {searchError && (
              <p className="mt-3 text-sm text-danger-text">{searchError}</p>
            )}
          </Card>

          {searching && (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {!searching && hasSearched && (
            <div className="space-y-2">
              {rooms.map((room) => {
                const unavailable = unavailableRoomIds.has(room.id);
                return (
                  <button
                    key={room.id}
                    type="button"
                    disabled={unavailable}
                    onClick={() => handleSelectRoom(room)}
                    className={`w-full rounded-lg border border-neutral-200 bg-surface-card p-4 text-left shadow-card transition-shadow duration-150 ${
                      unavailable
                        ? "opacity-40"
                        : "hover:bg-neutral-50 hover:shadow-raised"
                    }`}
                  >
                    <p className="font-medium text-text-primary">{room.name}</p>
                    <p className="text-sm text-text-secondary">
                      ความจุ {room.capacity} คน
                      {unavailable && " — ไม่ว่างในช่วงเวลานี้"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step === 2 && selectedRoom && !refId && (
        <Card className="mt-6 space-y-4">
          <p className="text-sm text-text-secondary">
            ห้อง: {selectedRoom.name} (ความจุ {selectedRoom.capacity} คน)
          </p>

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            ชื่อการประชุม
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-sm border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            รายละเอียดกิจกรรม
            <textarea
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="rounded-sm border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            จำนวนผู้เข้าร่วม
            <input
              type="number"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              className="rounded-sm border border-neutral-300 px-3 py-2"
            />
          </label>

          {attendeesExceedsCapacity && (
            <p className="text-sm text-danger-text">
              จำนวนผู้เข้าร่วมเกินความจุห้อง
            </p>
          )}

          {submitError && (
            <p className="text-sm text-danger-text">{submitError}</p>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleBackToSearch}>
              กลับไปเลือกห้องใหม่
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !title || !activity || !attendees || attendeesExceedsCapacity || submitting
              }
            >
              {submitting ? "กำลังบันทึก..." : "ยืนยันการจอง"}
            </Button>
          </div>
        </Card>
      )}

      {refId && (
        <div className="mt-6 rounded-lg border border-success-accent bg-success-surface p-5 shadow-card">
          <p className="font-medium text-success-text">จองห้องสำเร็จ</p>
          <p className="mt-1 text-sm text-success-text">
            หมายเลขอ้างอิง: {refId}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: ตรวจว่า build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/booking/page.tsx"
git commit -m "feat: apply Card, Button, and Skeleton components to /booking"
```

---

### Task 9: Apply กับ `/dashboard`

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `Card` จาก Task 2 (พร้อม `padding="p-4"` สำหรับ stat tile)

- [ ] **Step 1: แทนที่ทั้งไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";

type Stats = {
  bookingPending: number;
  bookingApproved: number;
  bookingCancelRequested: number;
  bookingRejected: number;
  bookingCancelled: number;
  roomAvailable: number;
  roomBusy: number;
  roomMaintenance: number;
  userCount: number;
  approverCount: number;
  adminCount: number;
  pendingAdminApproval: number;
  pendingCancelDecision: number;
};

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      setLoadError(null);

      const supabase = createClient();

      async function countBookings(
        finalStatus: string,
        currentStep?: number
      ): Promise<number> {
        let query = supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("final_status", finalStatus);
        if (currentStep !== undefined) {
          query = query.eq("current_step", currentStep);
        }
        const { count, error } = await query;
        if (error) throw error;
        return count ?? 0;
      }

      async function countRooms(status: string): Promise<number> {
        const { count, error } = await supabase
          .from("rooms")
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        if (error) throw error;
        return count ?? 0;
      }

      async function countUsers(role: string): Promise<number> {
        const { count, error } = await supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("role", role);
        if (error) throw error;
        return count ?? 0;
      }

      try {
        const [
          bookingPending,
          bookingApproved,
          bookingCancelRequested,
          bookingRejected,
          bookingCancelled,
          bookingCancelledByAdmin,
          roomAvailable,
          roomBusy,
          roomMaintenance,
          userCount,
          approverCount,
          adminCount,
          pendingAdminApproval,
        ] = await Promise.all([
          countBookings("pending"),
          countBookings("approved"),
          countBookings("cancel_requested"),
          countBookings("rejected"),
          countBookings("cancelled"),
          countBookings("cancelled_by_admin"),
          countRooms("available"),
          countRooms("busy"),
          countRooms("maintenance"),
          countUsers("user"),
          countUsers("approver"),
          countUsers("admin"),
          countBookings("pending", 0),
        ]);

        setStats({
          bookingPending,
          bookingApproved,
          bookingCancelRequested,
          bookingRejected,
          bookingCancelled: bookingCancelled + bookingCancelledByAdmin,
          roomAvailable,
          roomBusy,
          roomMaintenance,
          userCount,
          approverCount,
          adminCount,
          pendingAdminApproval,
          pendingCancelDecision: bookingCancelRequested,
        });
      } catch {
        setLoadError("ไม่สามารถโหลดข้อมูลภาพรวมได้");
      }
    }

    loadStats();
  }, []);

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ภาพรวมระบบ
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}

      {stats && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/approver"
              className="rounded-lg border border-warning-border bg-warning-surface p-5 shadow-card transition-shadow duration-150 hover:shadow-raised"
            >
              <p className="text-sm text-text-secondary">รอ Admin อนุมัติ</p>
              <p className="text-2xl font-semibold text-warning-text">
                {stats.pendingAdminApproval}
              </p>
            </Link>
            <Link
              href="/approver/cancel-requests"
              className="rounded-lg border border-warning-border bg-warning-surface p-5 shadow-card transition-shadow duration-150 hover:shadow-raised"
            >
              <p className="text-sm text-text-secondary">
                รอพิจารณาคำขอยกเลิก
              </p>
              <p className="text-2xl font-semibold text-warning-text">
                {stats.pendingCancelDecision}
              </p>
            </Link>
          </div>

          <div className="mt-6">
            <p className="font-medium text-text-primary">การจอง</p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Card padding="p-4">
                <p className="text-sm text-text-secondary">รออนุมัติ</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingPending}
                </p>
              </Card>
              <Card padding="p-4">
                <p className="text-sm text-text-secondary">อนุมัติแล้ว</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingApproved}
                </p>
              </Card>
              <Card padding="p-4">
                <p className="text-sm text-text-secondary">
                  รอพิจารณายกเลิก
                </p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingCancelRequested}
                </p>
              </Card>
              <Card padding="p-4">
                <p className="text-sm text-text-secondary">ถูกปฏิเสธ</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingRejected}
                </p>
              </Card>
              <Card padding="p-4">
                <p className="text-sm text-text-secondary">ยกเลิกแล้ว</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingCancelled}
                </p>
              </Card>
            </div>
          </div>

          <div className="mt-6">
            <p className="font-medium text-text-primary">ห้องประชุม</p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <Card padding="p-4">
                <p className="text-sm text-text-secondary">ว่าง</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.roomAvailable}
                </p>
              </Card>
              <Card padding="p-4">
                <p className="text-sm text-text-secondary">ไม่ว่าง</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.roomBusy}
                </p>
              </Card>
              <Card padding="p-4">
                <p className="text-sm text-text-secondary">ปิดปรับปรุง</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.roomMaintenance}
                </p>
              </Card>
            </div>
          </div>

          <div className="mt-6">
            <p className="font-medium text-text-primary">ผู้ใช้งาน</p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <Card padding="p-4">
                <p className="text-sm text-text-secondary">ผู้ใช้ทั่วไป</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.userCount}
                </p>
              </Card>
              <Card padding="p-4">
                <p className="text-sm text-text-secondary">ผู้อนุมัติ</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.approverCount}
                </p>
              </Card>
              <Card padding="p-4">
                <p className="text-sm text-text-secondary">ผู้ดูแลระบบ</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.adminCount}
                </p>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: ตรวจว่า build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "feat: apply Card component and fade-in animation to /dashboard overview"
```

---

### Task 10: Apply กับ `/approver`

**Files:**
- Modify: `app/(app)/approver/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `Modal`, `Skeleton` จาก Task 2/3/5/6

- [ ] **Step 1: แทนที่ทั้งไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";

type PendingBooking = {
  id: string;
  ref_id: string;
  title: string;
  activity: string;
  attendees: number;
  start_time: string;
  end_time: string;
  created_at: string;
  room_name: string;
  requester_name: string;
};

export default function ApproverPage() {
  const [myStep, setMyStep] = useState<number | null>(null);
  const [bookings, setBookings] = useState<PendingBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    booking: PendingBooking;
    action: "approved" | "rejected";
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadQueue() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoadError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setLoading(false);
      return;
    }

    const { data: config, error: configError } = await supabase
      .from("system_config")
      .select("admin_id, approver1_id, approver2_id")
      .single();

    if (configError || !config) {
      setLoadError("ไม่สามารถโหลดข้อมูล Approval Chain ได้");
      setLoading(false);
      return;
    }

    let step: number | null = null;
    if (config.admin_id === user.id) step = 1;
    else if (config.approver1_id === user.id) step = 2;
    else if (config.approver2_id === user.id) step = 3;

    setMyStep(step);

    if (step === null) {
      setBookings([]);
      setLoading(false);
      return;
    }

    const { data, error: bookingsError } = await supabase
      .from("bookings")
      .select(
        "id, ref_id, title, activity, attendees, start_time, end_time, created_at, rooms(name), users(full_name)"
      )
      .eq("final_status", "pending")
      .eq("current_step", step - 1)
      .order("created_at", { ascending: true });

    if (bookingsError) {
      setLoadError("ไม่สามารถโหลดรายการคำขอได้");
      setLoading(false);
      return;
    }

    type Row = {
      id: string;
      ref_id: string;
      title: string;
      activity: string;
      attendees: number;
      start_time: string;
      end_time: string;
      created_at: string;
      rooms: { name: string } | null;
      users: { full_name: string } | null;
    };

    setBookings(
      ((data ?? []) as unknown as Row[]).map((b) => ({
        id: b.id,
        ref_id: b.ref_id,
        title: b.title,
        activity: b.activity,
        attendees: b.attendees,
        start_time: b.start_time,
        end_time: b.end_time,
        created_at: b.created_at,
        room_name: b.rooms?.name ?? "",
        requester_name: b.users?.full_name ?? "",
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    loadQueue();
  }, []);

  function waitingMinutes(createdAt: string): number {
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  }

  async function handleConfirm() {
    if (!confirmTarget) return;

    setSubmitting(true);
    setActionError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setActionError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setSubmitting(false);
      return;
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/approve-booking`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_id: confirmTarget.booking.id,
          action: confirmTarget.action,
        }),
      }
    );

    const result = await res.json();

    setSubmitting(false);
    setConfirmTarget(null);

    if (!res.ok) {
      setActionError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadQueue();
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        คำขออนุมัติ
      </h1>

      {loadError && <p className="mt-4 text-sm text-danger-text">{loadError}</p>}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && myStep === null && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ท่านไม่ได้อยู่ใน Approval Chain
        </p>
      )}

      {!loading && myStep !== null && bookings.length === 0 && (
        <p className="mt-4 text-sm text-text-secondary">
          ไม่มีคำขอรออนุมัติในขณะนี้
        </p>
      )}

      <div className="mt-4 space-y-3">
        {!loading &&
          bookings.map((b) => {
            const urgent = waitingMinutes(b.created_at) > 120;
            return (
              <Card
                key={b.id}
                className={urgent ? "border-warning-border border-[1.5px]" : ""}
              >
                <p className="font-medium text-text-primary">{b.title}</p>
                <p className="text-sm text-text-secondary">
                  {b.ref_id} — ห้อง {b.room_name} — ผู้จอง {b.requester_name}
                </p>
                <p className="text-sm text-text-secondary">
                  ผู้เข้าร่วม {b.attendees} คน
                </p>
                <div className="mt-3 flex gap-3">
                  <Button
                    variant="primary"
                    className="bg-success-solid hover:bg-success-solid"
                    onClick={() =>
                      setConfirmTarget({ booking: b, action: "approved" })
                    }
                  >
                    อนุมัติ
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      setConfirmTarget({ booking: b, action: "rejected" })
                    }
                  >
                    ปฏิเสธ
                  </Button>
                </div>
              </Card>
            );
          })}
      </div>

      <Modal open={confirmTarget !== null} onClose={() => setConfirmTarget(null)}>
        {confirmTarget && (
          <>
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการ{confirmTarget.action === "approved" ? "อนุมัติ" : "ปฏิเสธ"}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {confirmTarget.booking.title} ({confirmTarget.booking.ref_id})
            </p>
            <div className="mt-4 flex gap-3">
              <Button variant="secondary" onClick={() => setConfirmTarget(null)}>
                ยกเลิก
              </Button>
              <Button onClick={handleConfirm} disabled={submitting}>
                {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
```

**หมายเหตุสำคัญ:** ปุ่ม "อนุมัติ" เดิมใช้สี `bg-success-solid` เฉพาะตัว (ไม่ใช่ 1 ใน 3 variant ของ `Button`) จึงใช้ `variant="primary"` เป็นฐาน (มี hover:scale animation) แล้ว override สีด้วย `className="bg-success-solid hover:bg-success-solid"` ทับ (คง hover scale ไว้ แต่ไม่ให้กลายเป็นสี brand-primary) — เป็นการยอมรับ minor duplication ของสีเพื่อไม่ต้องเพิ่ม variant ที่ 4 ให้ `Button` component ทั้งที่ใช้จุดเดียวในระบบตอนนี้ (YAGNI)

- [ ] **Step 2: ตรวจว่า build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/approver/page.tsx"
git commit -m "feat: apply Card, Button, Modal, and Skeleton components to /approver"
```

---

### Task 11: Manual Verification

**Files:** ไม่มี (verification เท่านั้น)

- [ ] **Step 1: Build รวม**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่

- [ ] **Step 2: ทดสอบ `/home`**

Login เป็น user ใดก็ได้ เข้า `/home`
Expected: เห็นการ์ดกลางจอมี shadow นุ่มนวล, hover แล้ว shadow เด่นขึ้น, มี fade-in ตอนโหลดหน้า, สี text ไม่ใช่สีแดง/เทาเดิม (`text-red-600`/`text-zinc-*`) แล้ว

- [ ] **Step 3: ทดสอบ `/booking`**

เข้า `/booking` ค้นหาห้องว่าง (ต้องรอ Edge Function deploy ถึงจะเห็นรายชื่อห้องจริง — ถ้ายังไม่ deploy ให้ตรวจแค่ปุ่ม "ค้นหาห้องว่าง" มี hover scale animation, การ์ดฟอร์มมี shadow เด่นขึ้นตอน hover)

- [ ] **Step 4: ทดสอบ `/dashboard`**

Login เป็น admin เข้า `/dashboard`
Expected: การ์ด highlight (สีเหลือง) และ stat tile ทั้งหมดมี shadow นุ่มนวล เด่นขึ้นตอน hover, สีเขียวใหม่ (ถ้ามี element ที่ใช้ brand-primary ในหน้านี้)

- [ ] **Step 5: ทดสอบ `/approver`**

Login เป็น admin/approver1/approver2 เข้า `/approver`
Expected: ระหว่างโหลดเห็น Skeleton (แถบเทาสั่นๆ) ก่อนข้อมูลจริงมา, การ์ดคำขอมี shadow เด่นตอน hover, กดปุ่มอนุมัติ/ปฏิเสธเห็น Modal เด้งเข้าแบบ scale+fade (ไม่ใช่ appear ทันทีเหมือนเดิม)

- [ ] **Step 6: ทดสอบ regression บน `/dashboard/bookings` และ `/profile/bookings`**

เข้าทั้ง 2 หน้า (ที่ refactor ไปใช้ `Badge` component ใน Task 4)
Expected: badge สียังถูกต้องเหมือนเดิมทุกสถานะ (เหลือง/เขียว/แดง/เทา) ไม่มี regression จากการ refactor

- [ ] **Step 7: ทดสอบว่า 12 หน้านอกสโคปไม่พัง**

สุ่มเข้า 2-3 หน้าที่ยังไม่ migrate (เช่น `/dashboard/rooms`, `/dashboard/settings`)
Expected: แสดงผลได้ปกติเหมือนเดิม สีอาจดูสดขึ้นเล็กน้อยจาก token ใหม่ (เพราะ `bg-brand-primary` เปลี่ยนค่า) แต่ไม่มีอะไรพังหรือ layout เพี้ยน

---

## Self-Review Notes

- **Spec coverage:** Design Tokens (สี+shadow+transition) → Task 1, 5 shared component → Task 2-6, apply 4 หน้าหลัก → Task 7-10, testing ครบตาม success criteria ในสเปค → Task 11 ครอบคลุมทุกข้อ
- **Placeholder scan:** ไม่มี TBD/TODO ที่ไม่มีเนื้อหา
- **Type consistency:** `Card`/`Button`/`Badge`/`Modal`/`Skeleton` prop signature ใช้ตรงกันทุกจุดที่เรียกใช้ใน Task 7-10 — `Badge`'s `tone` prop type ตรงกับ `STATUS_TONE` mapping ที่นิยามใน Task 4
- **YAGNI check:** ไม่เพิ่ม variant/prop ที่ไม่มีใครใช้ (เช่น ไม่เพิ่ม `Button` variant ที่ 4 สำหรับปุ่มอนุมัติสีเขียวเฉพาะจุดเดียวใน `/approver` — ใช้ className override แทนตามที่ระบุไว้ใน Task 10)
- **บทเรียนจาก sub-project ก่อนหน้าถูกนำมาใช้ล่วงหน้า:** เพิ่ม `padding` prop ให้ `Card` ตั้งแต่ต้นเพื่อรองรับ stat tile ขนาดเล็ก (`p-4`) โดยไม่ต้องพึ่ง Tailwind class-order-fighting กับ `p-5` default
