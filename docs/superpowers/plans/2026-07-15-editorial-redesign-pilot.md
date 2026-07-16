# Editorial Redesign Pilot (`/approver`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/approver` page in an Editorial-grid style (Swiss/editorial: visible 1px rules, aligned label/value grids, mono for technical data, gradient demoted to accent) and introduce reusable primitives + the faculty logo, without changing any colors, Thai copy, or approve/reject logic.

**Architecture:** Add four presentational primitives (`StatusMarker`, `FieldTable`, `EditorialCard`, `Brand`) and one editorial page header (`PageHeader`, a *new* component — `PageHero` is left untouched so the other 17 pages can't regress). Rebuild `app/(app)/approver/page.tsx` to compose them. Add `Brand` to the sidebar/drawer and the three public pages. All new structure reads existing design tokens; no token values change.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 (tokens mapped in `app/globals.css`). Sarabun font. No test runner for React components exists in this repo.

## Global Constraints

- **Do not change any color/token value.** Only *add* patterns. `git diff tokens/` and `git diff app/globals.css` must show additions only (new utilities allowed), never edits to existing hex/token values. (CLAUDE.md rule 10)
- **All UI text is formal Thai.** Reuse the exact existing strings when rebuilding. (CLAUDE.md rule 9)
- **Use tokens only** — CSS variable or Tailwind utility mapped from a token. No hardcoded hex/spacing/font in JSX. (CLAUDE.md rule 10)
- **Preserve behavior:** the approve/reject flow calls edge function `approve-booking`; `loadQueue()`, `myStep` derivation from `system_config`, and the `final_status`/`current_step` filters stay functionally identical.
- **No new dependencies.** No `next/image` (unused in repo), no test libraries. Logo renders via plain `<img>`.
- **Verification path:** this repo has no React component tests. Each task is gated by `npx tsc --noEmit` (typecheck) and `npm run lint` (eslint), plus a described visual check via the preview tools. Do **not** add vitest/jsdom/RTL.
- **Spacing scale (STRICT — user decision):** 4px base — only whole steps `1=4 2=8 3=12 4=16 5=20 6=24 8=32`. **Every `.5` spacing step must be floored (drop the `.5`)** in all new/rewritten code: `gap-2.5→gap-2`, `mt-2.5→mt-2`, `mt-3.5→mt-3`, `mb-2.5→mb-2`, `pb-3.5→pb-3`, `mt-1.5→mt-1`, `gap-1.5→gap-1`. **Exceptions (leave as-is):** 1px hairline/micro-padding like `py-px`, and `border-*` widths — these are not spacing rhythm. The code samples in this plan predate this decision and may still contain `.5` steps; apply the floor rule to every spacing utility you write. Where the plan uses `pl-[calc(8px+0.75rem)]` (PageHeader subtitle), replace it with `pl-5` (8px bar + 12px gap = 20px).
- **Hairline conventions (new code):** light divider `border-neutral-150`; default rule `border-neutral-200`; stronger rule/outer border `border-neutral-300`. Editorial cards use `rounded-[2px]` (near-square), never `rounded-lg`.
- **Commit style:** end each commit message with the Co-Authored-By trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

## File Structure

**Create:**
- `components/ui/StatusMarker.tsx` — square swatch + label status indicator for dense lists/tables
- `components/ui/FieldTable.tsx` — aligned label/value rows separated by hairlines
- `components/ui/EditorialCard.tsx` — near-square card, 1px outer border, left accent bar, no shadow
- `components/ui/PageHeader.tsx` — short editorial page header (accent bar + h1 + subtitle + bottom rule, no gradient, no overlap)
- `components/ui/Brand.tsx` — faculty logo + two-line wordmark
- `public/logo-fms.svg` — placeholder logo (user overrides with the real file, same path)

**Modify:**
- `app/(app)/approver/page.tsx` — rebuild in Editorial-B
- `app/(app)/AppNav.tsx` — replace gradient wordmark text with `<Brand>` in sidebar + drawer
- `app/login/page.tsx` — add `<Brand size="lg">` above the card
- `app/setup/page.tsx` — add `<Brand size="lg">` in the header area
- `app/welpru-verify/page.tsx` — add `<Brand size="lg">` above the card
- `docs/DESIGN.md` — add "Editorial patterns" section

---

## Task 1: `StatusMarker` primitive

**Files:**
- Create: `components/ui/StatusMarker.tsx`

**Interfaces:**
- Produces: `StatusMarker({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: ReactNode })` — inline-flex; a 9px square swatch (token color) + label text in the tone color.

- [ ] **Step 1: Create the component**

Create `components/ui/StatusMarker.tsx`:

```tsx
import type { ReactNode } from "react";

type Tone = "success" | "warning" | "danger" | "neutral";

// Editorial status indicator for dense lists/tables: a small SQUARE swatch
// (not a pill) + label. The pill-shaped Badge stays for headings/dialogs.
const SWATCH_CLASS: Record<Tone, string> = {
  success: "bg-success-accent",
  warning: "bg-warning-accent",
  danger: "bg-danger-solid",
  neutral: "bg-neutral-400",
};

const TEXT_CLASS: Record<Tone, string> = {
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-danger-text",
  neutral: "text-text-secondary",
};

export function StatusMarker({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-semibold ${TEXT_CLASS[tone]}`}>
      <span
        className={`inline-block h-[9px] w-[9px] flex-none ${SWATCH_CLASS[tone]}`}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors for `components/ui/StatusMarker.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/ui/StatusMarker.tsx
git commit -m "feat(ui): add StatusMarker editorial status indicator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `FieldTable` primitive

**Files:**
- Create: `components/ui/FieldTable.tsx`

**Interfaces:**
- Produces: `FieldTable({ rows }: { rows: FieldRow[] })` where `type FieldRow = { label: string; value: ReactNode; mono?: boolean }`. Renders a 2-column grid; each row divided by a light hairline (`border-neutral-150`), last row has no divider. `label` uses `text-text-muted`; `value` uses `text-text-primary`; when `mono` is true the value uses `font-mono`.
- Export the `FieldRow` type for consumers.

- [ ] **Step 1: Create the component**

Create `components/ui/FieldTable.tsx`:

```tsx
import type { ReactNode } from "react";

export type FieldRow = {
  label: string;
  value: ReactNode;
  mono?: boolean;
};

// Aligned label/value rows for booking metadata. Replaces scattered
// `grid gap-x-4 gap-y-1.5` blocks with one hairline-ruled column grid.
export function FieldTable({ rows }: { rows: FieldRow[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] text-sm">
      {rows.map((row, i) => {
        const last = i === rows.length - 1;
        const divider = last ? "" : "border-b border-neutral-150";
        return (
          <div key={row.label} className="contents">
            <dt
              className={`py-2 pr-4 text-text-muted ${divider}`}
            >
              {row.label}
            </dt>
            <dd
              className={`py-2 text-text-primary ${row.mono ? "font-mono" : ""} ${divider}`}
            >
              {row.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/FieldTable.tsx
git commit -m "feat(ui): add FieldTable aligned label/value grid

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `EditorialCard` primitive

**Files:**
- Create: `components/ui/EditorialCard.tsx`

**Interfaces:**
- Produces:
  - `EditorialCard({ accent?, className?, children })` — `accent?: "brand" | "warning" | "success" | "danger" | "none"` (default `"none"`). Near-square (`rounded-[2px]`), `border border-neutral-300`, **no shadow**. When accent set, a 3px solid left bar in the accent color (`border-l-[3px]` + color). `className` appends.
  - `EditorialCard.Section({ className?, children })` — a padded block (`px-4 py-3`) with a bottom hairline (`border-b border-neutral-200`); use `last:border-b-0` by default so the final section has no rule.
- Keep it a container + one sub-part. YAGNI: no Header/Footer variants — callers compose sections and a footer div directly.

- [ ] **Step 1: Create the component**

Create `components/ui/EditorialCard.tsx`:

```tsx
import type { ReactNode } from "react";

type Accent = "brand" | "warning" | "success" | "danger" | "none";

// Editorial card: structure comes from 1px rules, not shadow/roundness.
const ACCENT_CLASS: Record<Accent, string> = {
  brand: "border-l-[3px] border-l-brand-primary",
  warning: "border-l-[3px] border-l-warning-accent",
  success: "border-l-[3px] border-l-success-solid",
  danger: "border-l-[3px] border-l-danger-solid",
  none: "",
};

function EditorialCard({
  accent = "none",
  className = "",
  children,
}: {
  accent?: Accent;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[2px] border border-neutral-300 bg-surface-card ${ACCENT_CLASS[accent]} ${className}`}
    >
      {children}
    </div>
  );
}

function Section({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`border-b border-neutral-200 px-4 py-3 last:border-b-0 ${className}`}>
      {children}
    </div>
  );
}

EditorialCard.Section = Section;

export { EditorialCard };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/EditorialCard.tsx
git commit -m "feat(ui): add EditorialCard hairline-structured card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `Brand` primitive + placeholder logo

**Files:**
- Create: `public/logo-fms.svg`
- Create: `components/ui/Brand.tsx`

**Interfaces:**
- Produces: `Brand({ size?, showWordmark?, className? })` — `size?: "sm" | "lg"` (default `"sm"`), `showWordmark?: boolean` (default `true`), `className?`. Renders `<img src="/logo-fms.svg">` at 30px (sm) / 64px (lg) plus a two-line wordmark: line 1 `ระบบจองห้องประชุม`, line 2 `คณะวิทยาการจัดการ มหาวิทยาลัยราชภัฏลำปาง`.
- The placeholder SVG lives at the exact path the user will overwrite with the real logo (`public/logo-fms.svg`), so no runtime fallback logic is needed.

- [ ] **Step 1: Create the placeholder logo**

Create `public/logo-fms.svg` (simple ship's-wheel roundel placeholder; the user replaces this file with the official artwork, same name):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="คณะวิทยาการจัดการ">
  <circle cx="32" cy="32" r="30" fill="none" stroke="#7c3aed" stroke-width="3"/>
  <circle cx="32" cy="32" r="9" fill="none" stroke="#0891b2" stroke-width="3"/>
  <circle cx="32" cy="32" r="3" fill="#7c3aed"/>
  <g stroke="#4c1d95" stroke-width="3" stroke-linecap="round">
    <line x1="32" y1="2" x2="32" y2="14"/>
    <line x1="32" y1="50" x2="32" y2="62"/>
    <line x1="2" y1="32" x2="14" y2="32"/>
    <line x1="50" y1="32" x2="62" y2="32"/>
    <line x1="11" y1="11" x2="20" y2="20"/>
    <line x1="44" y1="44" x2="53" y2="53"/>
    <line x1="53" y1="11" x2="44" y2="20"/>
    <line x1="20" y1="44" x2="11" y2="53"/>
  </g>
</svg>
```

- [ ] **Step 2: Create the component**

Create `components/ui/Brand.tsx`:

```tsx
// Faculty logo + wordmark. Logo file is public/logo-fms.svg (placeholder in
// repo; overwrite with official artwork at the same path). Plain <img> — repo
// does not use next/image.
const IMG_SIZE: Record<"sm" | "lg", string> = {
  sm: "h-[30px] w-[30px]",
  lg: "h-16 w-16",
};

export function Brand({
  size = "sm",
  showWordmark = true,
  className = "",
}: {
  size?: "sm" | "lg";
  showWordmark?: boolean;
  className?: string;
}) {
  const stacked = size === "lg";
  return (
    <div
      className={`flex ${stacked ? "flex-col items-center text-center gap-2" : "flex-row items-center gap-2.5"} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-fms.svg"
        alt="ตราคณะวิทยาการจัดการ"
        className={`${IMG_SIZE[size]} flex-none`}
      />
      {showWordmark && (
        <div className={stacked ? "" : "min-w-0"}>
          <p
            className={`font-extrabold leading-snug text-text-primary ${stacked ? "text-lg" : "text-base"}`}
          >
            ระบบจองห้องประชุม
          </p>
          <p className="text-xs text-text-secondary leading-snug">
            คณะวิทยาการจัดการ มหาวิทยาลัยราชภัฏลำปาง
          </p>
        </div>
      )}
    </div>
  );
}
```

Note: the `gap-2.5` here (10px) is a deliberate exception matching the existing sidebar spacing; keep it.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors (the `no-img-element` rule is disabled inline).

- [ ] **Step 5: Commit**

```bash
git add public/logo-fms.svg components/ui/Brand.tsx
git commit -m "feat(ui): add Brand logo+wordmark with placeholder faculty logo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `PageHeader` editorial header

**Files:**
- Create: `components/ui/PageHeader.tsx`

**Interfaces:**
- Produces: `PageHeader({ title, subtitle?, width?, children? })` — same prop shape as `PageHero` (`title: ReactNode`, `subtitle?: ReactNode`, `width?: string` default `"max-w-2xl"`, `children?`). Renders a SHORT header: a vertical gradient accent bar + `h1` (`text-3xl font-extrabold text-text-primary`), optional subtitle below, a `1px` bottom rule (`border-neutral-300`). No gradient background, no `hero-glow`, and callers do NOT overlap content with `-mt-6`.
- This is intentionally a separate component from `PageHero` so the 17 pages still using `PageHero` are untouched.

- [ ] **Step 1: Create the component**

Create `components/ui/PageHeader.tsx`:

```tsx
import type { ReactNode } from "react";

// Editorial page header: short, flat, hairline-ruled. Gradient survives only
// as the vertical accent bar (.section-bar). Unlike PageHero, content below is
// NOT overlapped (no -mt-6) — the grid starts cleanly under the rule.
export function PageHeader({
  title,
  subtitle,
  width = "max-w-2xl",
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  width?: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-neutral-300 bg-surface-card px-6 pb-5 pt-6">
      <div className={`mx-auto ${width}`}>
        <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-text-primary">
          <span className="section-bar h-8" aria-hidden="true" />
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 pl-[calc(8px+0.75rem)] text-md text-text-secondary">
            {subtitle}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
```

Note: `.section-bar` is defined in `app/globals.css` (8px-wide gradient bar); `h-8` overrides its height to match the `text-3xl` line. `pl-[calc(8px+0.75rem)]` aligns the subtitle under the title text (past the bar + gap).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Visual check**

Start the preview server and confirm the header renders (used on `/approver` after Task 6). For now, verify no build break:

Run: `npx tsc --noEmit && npm run lint`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add components/ui/PageHeader.tsx
git commit -m "feat(ui): add PageHeader editorial short header

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Rebuild `/approver` in Editorial-B

**Files:**
- Modify: `app/(app)/approver/page.tsx` (full rewrite of presentation; data/logic unchanged)

**Interfaces:**
- Consumes: `PageHeader` (Task 5), `EditorialCard` (Task 3), `FieldTable` + `FieldRow` (Task 2), `StatusMarker` (Task 1), existing `Button`, `Modal`, `Skeleton`.
- All state, `loadQueue`, `handleConfirm`, edge-function call, and query filters are preserved verbatim.

- [ ] **Step 1: Replace the file contents**

Overwrite `app/(app)/approver/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorialCard } from "@/components/ui/EditorialCard";
import { FieldTable, type FieldRow } from "@/components/ui/FieldTable";
import { StatusMarker } from "@/components/ui/StatusMarker";

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

type ResolvedEntry = {
  id: string;
  action: "approved" | "rejected";
  note: string | null;
  acted_at: string;
  ref_id: string;
  title: string;
  room_name: string;
  requester_name: string;
  start_time: string | null;
  end_time: string | null;
  attendees: number | null;
};

type FilterTab = "pending" | "approved" | "rejected";

const CHAIN_STEPS = ["แอดมิน", "ผู้อนุมัติ 1", "ผู้อนุมัติ 2"];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ลำดับการอนุมัติ 3 ขั้น: done → current → wait — ปรับให้เข้ากับเส้น hairline */
function ApprovalChain({ doneCount }: { doneCount: number }) {
  return (
    <div className="border-t border-neutral-200 bg-surface-sunken px-4 py-3">
      <p className="mb-2.5 text-xs font-bold tracking-wider text-text-muted">
        ลำดับการอนุมัติ
      </p>
      <div className="flex items-center">
        {CHAIN_STEPS.map((name, i) => {
          const state =
            i < doneCount ? "done" : i === doneCount ? "current" : "wait";
          const last = i === CHAIN_STEPS.length - 1;
          return (
            <div
              key={name}
              className={`flex min-w-0 items-center ${last ? "flex-none" : "flex-1"}`}
            >
              <div className="flex flex-none items-center gap-2">
                <span
                  className={`flex h-6 w-6 flex-none items-center justify-center text-xs font-bold ${
                    state === "done"
                      ? "bg-grad-brand text-text-on-primary"
                      : state === "current"
                        ? "border-[1.5px] border-warning-accent bg-warning-surface text-warning-text"
                        : "border-[1.5px] border-neutral-300 bg-surface-card text-neutral-400"
                  }`}
                >
                  {state === "done" ? "✓" : state === "current" ? "•" : i + 1}
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span
                    className={`whitespace-nowrap text-sm font-semibold ${
                      state === "done"
                        ? "text-neutral-700"
                        : state === "current"
                          ? "text-warning-text"
                          : "text-neutral-400"
                    }`}
                  >
                    {name}
                  </span>
                  <span
                    className={`whitespace-nowrap text-xs ${
                      state === "done"
                        ? "text-text-muted"
                        : state === "current"
                          ? "text-warning-accent"
                          : "text-neutral-400"
                    }`}
                  >
                    {state === "done"
                      ? "อนุมัติแล้ว"
                      : state === "current"
                        ? "รอดำเนินการ"
                        : "รอลำดับก่อนหน้า"}
                  </span>
                </span>
              </div>
              {!last && (
                <span
                  className={`mx-2 h-0.5 min-w-3 flex-1 ${
                    i < doneCount ? "bg-brand-primary" : "bg-neutral-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* chip กรอง — active = ขอบ/underline ม่วงหนา (เลิก gradient เต็ม) */
function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 cursor-pointer items-center gap-2 rounded-[2px] border px-4 text-sm font-bold transition-colors ${
        active
          ? "border-brand-primary bg-neutral-50 text-brand-primary-strong"
          : "border-neutral-300 bg-surface-card text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {label}
      <span
        className={`rounded-[2px] px-2 py-px text-xs font-bold ${
          active
            ? "bg-brand-primary text-text-on-primary"
            : "bg-neutral-150 text-brand-primary-strong"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export default function ApproverPage() {
  const [myStep, setMyStep] = useState<number | null>(null);
  const [bookings, setBookings] = useState<PendingBooking[]>([]);
  const [resolved, setResolved] = useState<ResolvedEntry[]>([]);
  const [filter, setFilter] = useState<FilterTab>("pending");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    booking: PendingBooking;
    action: "approved" | "rejected";
  } | null>(null);
  const [detailTarget, setDetailTarget] = useState<PendingBooking | null>(null);
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
      setResolved([]);
      setLoading(false);
      return;
    }

    const [queueRes, logsRes] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          "id, ref_id, title, activity, attendees, start_time, end_time, created_at, rooms(name), users(full_name)"
        )
        .eq("final_status", "pending")
        .eq("current_step", step - 1)
        .order("created_at", { ascending: true }),
      supabase
        .from("approval_logs")
        .select(
          "id, action, note, acted_at, bookings(ref_id, title, start_time, end_time, attendees, rooms(name), users(full_name))"
        )
        .eq("approver_id", user.id)
        .order("acted_at", { ascending: false })
        .limit(50),
    ]);

    if (queueRes.error) {
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
      ((queueRes.data ?? []) as unknown as Row[]).map((b) => ({
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

    type LogRow = {
      id: string;
      action: "approved" | "rejected";
      note: string | null;
      acted_at: string;
      bookings: {
        ref_id: string;
        title: string;
        start_time: string | null;
        end_time: string | null;
        attendees: number | null;
        rooms: { name: string } | null;
        users: { full_name: string } | null;
      } | null;
    };

    setResolved(
      ((logsRes.data ?? []) as unknown as LogRow[]).map((r) => ({
        id: r.id,
        action: r.action,
        note: r.note,
        acted_at: r.acted_at,
        ref_id: r.bookings?.ref_id ?? "",
        title: r.bookings?.title ?? "",
        room_name: r.bookings?.rooms?.name ?? "",
        requester_name: r.bookings?.users?.full_name ?? "",
        start_time: r.bookings?.start_time ?? null,
        end_time: r.bookings?.end_time ?? null,
        attendees: r.bookings?.attendees ?? null,
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

  const approvedEntries = resolved.filter((e) => e.action === "approved");
  const rejectedEntries = resolved.filter((e) => e.action === "rejected");
  const resolvedShown = filter === "approved" ? approvedEntries : rejectedEntries;

  return (
    <div className="animate-fade-in-up pb-10">
      <PageHeader
        title="คำขออนุมัติ"
        subtitle={
          !loading && myStep !== null && bookings.length > 0 ? (
            <>
              มี{" "}
              <strong className="font-extrabold text-brand-primary-strong">
                {bookings.length}
              </strong>{" "}
              รายการรอการอนุมัติของคุณ
            </>
          ) : (
            "ตรวจสอบและอนุมัติคำขอจองห้องประชุม"
          )
        }
        width="max-w-2xl"
      />
      <div className="relative mx-auto mt-6 max-w-2xl px-6">
        {loadError && (
          <p className="mb-4 text-sm text-danger-text">{loadError}</p>
        )}
        {actionError && (
          <p className="mb-4 text-sm text-danger-text">{actionError}</p>
        )}

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {!loading && myStep === null && !loadError && (
          <div className="rounded-[2px] border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
            ท่านไม่ได้อยู่ใน Approval Chain
          </div>
        )}

        {!loading && myStep !== null && (
          <>
            <div className="mb-5 flex flex-wrap gap-2.5">
              <FilterChip
                active={filter === "pending"}
                label="รอการอนุมัติ"
                count={bookings.length}
                onClick={() => setFilter("pending")}
              />
              <FilterChip
                active={filter === "approved"}
                label="อนุมัติแล้ว"
                count={approvedEntries.length}
                onClick={() => setFilter("approved")}
              />
              <FilterChip
                active={filter === "rejected"}
                label="ปฏิเสธแล้ว"
                count={rejectedEntries.length}
                onClick={() => setFilter("rejected")}
              />
            </div>

            {filter === "pending" && (
              <div className="space-y-4">
                {bookings.length === 0 && (
                  <div className="rounded-[2px] border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
                    ไม่มีคำขอรออนุมัติในขณะนี้
                  </div>
                )}
                {bookings.map((b) => {
                  const waited = waitingMinutes(b.created_at);
                  const urgent = waited > 120;
                  const waitText =
                    waited >= 60
                      ? `รอมาแล้ว ${
                          Number.isInteger(waited / 60)
                            ? waited / 60
                            : (waited / 60).toFixed(1)
                        } ชม.`
                      : `รอมาแล้ว ${waited} นาที`;
                  const rows: FieldRow[] = [
                    { label: "ผู้จอง", value: b.requester_name },
                    { label: "วันที่", value: fmtDate(b.start_time) },
                    {
                      label: "เวลา",
                      value: `${fmtTime(b.start_time)}–${fmtTime(b.end_time)} น.`,
                      mono: true,
                    },
                    { label: "ผู้เข้าร่วม", value: `${b.attendees} คน` },
                  ];
                  return (
                    <EditorialCard key={b.id} accent={urgent ? "warning" : "brand"}>
                      <EditorialCard.Section>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <p className="text-lg font-bold text-text-primary">
                              {b.room_name}
                            </p>
                            <StatusMarker tone="warning">รออนุมัติ</StatusMarker>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs text-text-muted">
                              {b.ref_id}
                            </span>
                            <span
                              className={`text-sm font-semibold ${
                                urgent ? "text-danger-text" : "text-text-muted"
                              }`}
                            >
                              {waitText}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-md font-bold text-text-primary">
                          {b.title}
                        </p>
                      </EditorialCard.Section>

                      <EditorialCard.Section className="!py-0">
                        <FieldTable rows={rows} />
                      </EditorialCard.Section>

                      <ApprovalChain doneCount={(myStep ?? 1) - 1} />

                      <div className="flex border-t border-neutral-300">
                        <button
                          type="button"
                          onClick={() => setDetailTarget(b)}
                          className="flex-1 cursor-pointer border-r border-neutral-200 py-3 text-sm font-bold text-text-secondary transition-colors hover:bg-neutral-50"
                        >
                          รายละเอียด
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmTarget({ booking: b, action: "rejected" })
                          }
                          className="flex-1 cursor-pointer border-r border-neutral-200 py-3 text-sm font-bold text-warning-text transition-colors hover:bg-warning-surface"
                        >
                          ปฏิเสธ
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmTarget({ booking: b, action: "approved" })
                          }
                          className="bg-grad-success flex-1 cursor-pointer py-3 text-sm font-bold text-text-on-primary transition-transform hover:scale-[1.01]"
                        >
                          อนุมัติ
                        </button>
                      </div>
                    </EditorialCard>
                  );
                })}
              </div>
            )}

            {filter !== "pending" && (
              <div className="space-y-4">
                {resolvedShown.length === 0 && (
                  <div className="rounded-[2px] border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
                    ไม่มีรายการในหมวดนี้
                  </div>
                )}
                {resolvedShown.map((e) => {
                  const rows: FieldRow[] = [
                    { label: "ผู้จอง", value: e.requester_name || "-" },
                    ...(e.start_time && e.end_time
                      ? [
                          {
                            label: "วันที่",
                            value: fmtDate(e.start_time),
                          },
                          {
                            label: "เวลา",
                            value: `${fmtTime(e.start_time)}–${fmtTime(e.end_time)} น.`,
                            mono: true,
                          },
                        ]
                      : []),
                    ...(e.attendees !== null
                      ? [{ label: "ผู้เข้าร่วม", value: `${e.attendees} คน` }]
                      : []),
                    { label: "รหัสอ้างอิง", value: e.ref_id, mono: true },
                  ];
                  return (
                    <EditorialCard
                      key={e.id}
                      accent={e.action === "approved" ? "success" : "danger"}
                    >
                      <EditorialCard.Section>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <p className="text-lg font-bold text-text-primary">
                            {e.room_name || e.title}
                          </p>
                          <StatusMarker
                            tone={e.action === "approved" ? "success" : "danger"}
                          >
                            {e.action === "approved" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว"}
                          </StatusMarker>
                        </div>
                        <p className="mt-2 text-md font-bold text-text-primary">
                          {e.title}
                        </p>
                      </EditorialCard.Section>

                      <EditorialCard.Section className="!py-0">
                        <FieldTable rows={rows} />
                      </EditorialCard.Section>

                      {e.note && (
                        <EditorialCard.Section>
                          <p className="text-sm text-text-primary">
                            เหตุผล: {e.note}
                          </p>
                        </EditorialCard.Section>
                      )}

                      <EditorialCard.Section>
                        <p className="text-sm italic text-text-muted">
                          {e.action === "approved"
                            ? "อนุมัติแล้ว — ไม่ต้องดำเนินการเพิ่ม"
                            : "ปฏิเสธแล้ว"}{" "}
                          · {new Date(e.acted_at).toLocaleString("th-TH")}
                        </p>
                      </EditorialCard.Section>
                    </EditorialCard>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* dialog รายละเอียด */}
        <Modal open={detailTarget !== null} onClose={() => setDetailTarget(null)}>
          {detailTarget && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <StatusMarker tone="warning">รออนุมัติ</StatusMarker>
                  <h2 className="mt-2.5 text-xl font-bold leading-snug text-text-primary">
                    {detailTarget.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailTarget(null)}
                  aria-label="ปิด"
                  className="h-8 w-8 flex-none cursor-pointer rounded-[2px] bg-neutral-100 text-md text-text-secondary hover:bg-neutral-150"
                >
                  ✕
                </button>
              </div>
              <div className="mt-3.5 border-t border-neutral-200 pt-2">
                <FieldTable
                  rows={[
                    { label: "ห้อง", value: detailTarget.room_name },
                    { label: "ผู้จอง", value: detailTarget.requester_name },
                    {
                      label: "วันเวลา",
                      value: `${fmtDate(detailTarget.start_time)} · ${fmtTime(
                        detailTarget.start_time
                      )}–${fmtTime(detailTarget.end_time)} น.`,
                      mono: true,
                    },
                    {
                      label: "ผู้เข้าร่วม",
                      value: `${detailTarget.attendees} คน`,
                    },
                    { label: "รหัสอ้างอิง", value: detailTarget.ref_id, mono: true },
                    ...(detailTarget.activity
                      ? [{ label: "กิจกรรม", value: detailTarget.activity }]
                      : []),
                  ]}
                />
              </div>
            </>
          )}
        </Modal>

        {/* dialog ยืนยัน */}
        <Modal open={confirmTarget !== null} onClose={() => setConfirmTarget(null)}>
          {confirmTarget && (
            <div className="text-center">
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl font-extrabold text-text-on-primary ${
                  confirmTarget.action === "approved"
                    ? "bg-grad-success shadow-success"
                    : "bg-grad-danger"
                }`}
              >
                {confirmTarget.action === "approved" ? "✓" : "✕"}
              </div>
              <p className="mt-4 text-xl font-extrabold text-text-primary">
                ยืนยันการ{confirmTarget.action === "approved" ? "อนุมัติ" : "ปฏิเสธ"}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                {confirmTarget.booking.title}
                <br />
                <span className="font-mono text-text-muted">
                  {confirmTarget.booking.ref_id}
                </span>
              </p>
              <div className="mt-5 flex gap-2.5">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setConfirmTarget(null)}
                >
                  ยกเลิก
                </Button>
                <Button
                  variant={
                    confirmTarget.action === "approved" ? "success" : "dangerSolid"
                  }
                  className="flex-1"
                  onClick={handleConfirm}
                  disabled={submitting}
                >
                  {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Visual verification via preview**

Start the dev server (`preview_start` with the project's launch config, or `npm run dev`), sign in as an approver (`approver1@test.local` / `test1234` if password login is enabled), and open `/approver`. Confirm:
- Header is a short flat bar with a purple accent bar + title, a bottom rule, and content does NOT overlap it.
- Pending cards are near-square, hairline-divided, `ref_id` + time render in mono, status shows as a small square swatch + text.
- Footer buttons form one segmented row divided by 1px rules; only "อนุมัติ" carries a gradient fill.
- Clicking รายละเอียด / ปฏิเสธ / อนุมัติ opens the correct dialog; confirming approve/reject still calls the edge function and refreshes the queue.
Use `preview_console_logs` (level error) to confirm no runtime errors, then `preview_screenshot` for a visual record.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/approver/page.tsx"
git commit -m "feat(approver): rebuild queue page in Editorial-B style

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Add `Brand` to the sidebar and mobile drawer

**Files:**
- Modify: `app/(app)/AppNav.tsx` (sidebar header block + drawer header block)

**Interfaces:**
- Consumes: `Brand` (Task 4).

- [ ] **Step 1: Import `Brand`**

In `app/(app)/AppNav.tsx`, add after the existing imports (below `import type { SidebarItem } from "@/lib/nav";`):

```tsx
import { Brand } from "@/components/ui/Brand";
```

- [ ] **Step 2: Replace the desktop sidebar header**

Replace this block (the `<div className="mb-3 border-b ...">` header inside the `<aside>`):

```tsx
        <div className="mb-3 border-b border-neutral-100 px-2 pb-3.5">
          <p className="bg-grad-brand bg-clip-text text-lg font-extrabold leading-snug text-transparent">
            ระบบจองห้องประชุม
          </p>
          <p className="mt-0.5 text-sm text-text-secondary">
            มหาวิทยาลัยราชภัฏลำปาง
          </p>
        </div>
```

with:

```tsx
        <div className="mb-3 border-b border-neutral-200 px-2 pb-3.5">
          <Brand size="sm" />
        </div>
```

- [ ] **Step 3: Replace the mobile drawer header text**

In the drawer, replace this inner block (inside the `<div className="mb-4 flex items-center justify-between">`):

```tsx
              <div>
                <p className="bg-grad-brand bg-clip-text text-base font-extrabold leading-snug text-transparent">
                  ระบบจองห้องประชุม
                </p>
                <p className="text-xs text-text-secondary">
                  มหาวิทยาลัยราชภัฏลำปาง
                </p>
              </div>
```

with:

```tsx
              <Brand size="sm" />
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both pass.

- [ ] **Step 5: Visual check**

In the preview, confirm the logo + two-line wordmark ("ระบบจองห้องประชุม" / "คณะวิทยาการจัดการ มหาวิทยาลัยราชภัฏลำปาง") appears in the desktop sidebar and mobile drawer (resize to mobile, open the drawer).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/AppNav.tsx"
git commit -m "feat(nav): show faculty logo + wordmark in sidebar and drawer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Add `Brand` to the three public pages

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/setup/page.tsx`
- Modify: `app/welpru-verify/page.tsx`

**Interfaces:**
- Consumes: `Brand` (Task 4).

- [ ] **Step 1: Login page**

In `app/login/page.tsx`, add the import after the existing component imports:

```tsx
import { Brand } from "@/components/ui/Brand";
```

Then, inside the `<Card ...>` (which contains `<div className="flex flex-col gap-4">`), add `<Brand>` as the first child of that flex column, immediately before the `<div>` that holds the `<h1>`:

```tsx
        <div className="flex flex-col gap-4">
          <Brand size="lg" showWordmark={false} className="mb-1" />
          <div>
            <h1 className="text-xl font-extrabold text-text-primary">
```

(The card already states the system name in text; `showWordmark={false}` avoids duplicating it. The 64px mark sits above the heading.)

- [ ] **Step 2: welpru-verify page**

In `app/welpru-verify/page.tsx`, add the import:

```tsx
import { Brand } from "@/components/ui/Brand";
```

Then add `<Brand>` as the first child inside the `<Card ...>`, before the `{status === "loading" && ...}` block:

```tsx
      <Card className="relative w-full max-w-md animate-fade-in-up">
        <Brand size="lg" className="mb-4" />
        {status === "loading" && (
```

- [ ] **Step 3: Setup page**

In `app/setup/page.tsx`, add the import:

```tsx
import { Brand } from "@/components/ui/Brand";
```

The setup page uses `PageHero`. Add the logo above the hero by inserting it as the first child of the outermost wrapper `<div className="bg-page-wash min-h-screen animate-fade-in-up pb-10">`, before `<PageHero ...>`:

```tsx
    <div className="bg-page-wash min-h-screen animate-fade-in-up pb-10">
      <div className="flex justify-center pt-8">
        <Brand size="lg" />
      </div>
      <PageHero
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both pass.

- [ ] **Step 5: Visual check**

In the preview, load `/login`, `/setup`, and `/welpru-verify?token=test`. Confirm the 64px logo renders centered above/within each card without breaking layout, and the placeholder SVG shows a purple/teal wheel.

- [ ] **Step 6: Commit**

```bash
git add app/login/page.tsx app/setup/page.tsx app/welpru-verify/page.tsx
git commit -m "feat(public): add faculty logo to login, setup, welpru-verify

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Document the Editorial patterns in `docs/DESIGN.md`

**Files:**
- Modify: `docs/DESIGN.md` (append a new section)

- [ ] **Step 1: Append the Editorial patterns section**

Add this section at the end of `docs/DESIGN.md`:

```markdown
---

## 8. Editorial Patterns (นำร่องหน้า /approver — 2026-07-15)

ทิศทางใหม่: **Editorial grid** — โครงสร้างมาจากเส้น hairline 1px และกริดที่ align กัน ไม่ใช่การ์ดโค้ง+เงา; gradient เหลือบทบาท accent (แถบ + ปุ่ม primary เดียว/หน้า + icon dialog). ค่าสี token เดิมไม่เปลี่ยน — เปลี่ยนแค่ *วิธีใช้*.

### Primitives ใหม่ (`components/ui/`)
| Component | ใช้ทำอะไร |
|---|---|
| `EditorialCard` (+ `.Section`) | การ์ดมุมเกือบเหลี่ยม (`rounded-[2px]`) ขอบ `border-neutral-300` ไม่มีเงา แบ่ง section ด้วย hairline; `accent` = แถบซ้าย 3px |
| `FieldTable` | ตาราง label/value 2 คอลัมน์ align กัน คั่น `border-neutral-150`; `mono` สำหรับ ref/เวลา |
| `StatusMarker` | swatch สี่เหลี่ยม 9px + ข้อความ (แทน pill ในบริบทตาราง); `Badge` pill ยังใช้ที่หัวข้อ/dialog |
| `PageHeader` | หัวหน้าเตี้ย: accent bar ม่วง + `h1` + เส้นล่าง ไม่มี gradient bg ไม่ overlap (`PageHero` เดิมยังใช้กับหน้าอื่น) |
| `Brand` | โลโก้คณะ (`public/logo-fms.svg`) + wordmark 2 ระดับ; `size="sm"` sidebar / `"lg"` หน้า public |

### นโยบายสี (Editorial)
- **ม่วง** = accent bar หัวข้อ + ปุ่ม primary เดียว/หน้า + เส้น chain done
- **สถานะ** = `StatusMarker` swatch เล็ก (ไม่ระบายพื้นใหญ่)
- **Filter chip active** = ขอบม่วง + พื้น `neutral-50` (เลิก `bg-grad-brand` เต็ม)
- **ที่เหลือ** = ขาว/lavender + hairline เทา

### Hairline conventions
- แบ่งแถวในตาราง: `border-neutral-150`
- เส้นแบ่ง section / rule ปกติ: `border-neutral-200`
- ขอบนอกการ์ด / rule เข้ม: `border-neutral-300`

### Typography — 3 roles
`h1` (`text-3xl font-extrabold`) · `SectionTitle`/หัว section (`text-lg font-extrabold` + accent bar) · body (`text-base`). **mono** (`font-mono`) เฉพาะ ref ID, วันเวลา, timestamp.

> สถานะ: นำร่องที่ `/approver` เท่านั้น — หน้าอื่นยังใช้ `PageHero`/`Card` เดิมจนกว่าจะยกเครื่องทีละหน้า
```

- [ ] **Step 2: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs(design): document Editorial patterns from approver pilot

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Full typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass (build compiles `/approver` and public pages).

- [ ] **Token diff guard**

Run: `git diff <base> -- tokens/ app/globals.css`
Expected: no *edits* to existing token/hex values (additions only, if any). If any existing value changed, revert it — the constraint is colors stay identical.

- [ ] **Visual walkthrough**

In preview: `/approver` (pending + approved + rejected tabs, both dialogs), sidebar + mobile drawer logo, `/login`, `/setup`, `/welpru-verify`. Capture screenshots. Confirm the four AI-slop signals are gone from `/approver`: no full gradient hero, no uniform rounded+shadow cards, no gradient pills, and the faculty identity is present.

---

## Self-Review Notes (author)

- **Spec coverage:** All 10 deliverables in the spec map to tasks — primitives (T1–T4), PageHeader (T5), approver rebuild (T6), sidebar logo (T7), public-page logos (T8), DESIGN.md (T9). Success criteria covered by Final verification.
- **Deviation from spec (justified):** Spec said "ปรับ PageHero — เพิ่ม variant". Plan instead adds a *separate* `PageHeader` component. Rationale: zero regression risk to the 17 pages still using `PageHero`; better satisfies the "ไม่ทำหน้าอื่นพัง" constraint. `PageHero` is left untouched.
- **Testing deviation (justified):** Spec/skill imply TDD, but the repo has no React component test infra (vitest targets `supabase/functions` + `lib` only; no jsdom/RTL) and adding it violates the no-new-deps constraint. Verification is `tsc --noEmit` + `eslint` + preview visual checks per task.
- **Type consistency:** `FieldRow` defined in T2, consumed in T6. `StatusMarker` tone union matches `Badge` tones. `EditorialCard.Section` used exactly as defined. `Brand` props (`size`, `showWordmark`, `className`) consistent across T4/T7/T8.
```
