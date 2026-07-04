# Visual Refresh — Rollout (sub-project B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll out the 5 shared UI components built in sub-project A (`Card`, `Button`, `Badge`, `Modal`, `Skeleton`) to the remaining 12 pages, completing the visual refresh across the whole system.

**Architecture:** Pure presentation-layer refactor — replace hand-rolled `<div>`/`<button>`/inline-modal markup with the shared components, using the exact same component APIs already established and reviewed in sub-project A. No new components, no token changes, no business-logic changes.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4, `components/ui/Card.tsx` / `Button.tsx` / `Badge.tsx` / `Modal.tsx` / `Skeleton.tsx` (all already exist, committed in sub-project A).

## Global Constraints

- **Design tokens only** (CLAUDE.md rule 10) — no hardcoded colors outside tokens; fix any pre-existing violations found in scope as a bonus (mirrors sub-project A's `/home` fix)
- **ข้อความ UI ภาษาไทยทางการ** (CLAUDE.md rule 9) — do not change any visible text
- **Zero business-logic changes** — every `useState`, data-fetching call, Supabase query, and Edge Function call must remain byte-identical in behavior. Only JSX/className/component-usage changes.
- **No new npm dependencies, no new shared components** — this plan only consumes the 5 components already built in sub-project A
- **Button variant convention (established in sub-project A, Task 10 review, do not re-litigate):** a button whose original classes were `border border-neutral-300 text-text-secondary` → `variant="secondary"`. A button whose original classes were `border border-danger-border bg-danger-surface text-danger-text` (surface+border style) → `variant="danger"`. A button whose original classes were `bg-brand-primary ... text-text-on-primary` → `variant="primary"` (no override). A button that was **solid** `bg-danger-solid`/`bg-success-solid` with `text-text-on-primary` (used for final confirm actions in modals) → `variant="primary"` with a `className="bg-danger-solid hover:bg-danger-solid"` or `className="bg-success-solid hover:bg-success-solid"` override, exactly matching the already-approved `/approver` pattern from sub-project A Task 10. Do not add a 4th/5th Button variant for these — YAGNI, already decided.
- **Card padding convention (established in sub-project A):** use the `padding` prop for spacing overrides, never put a padding utility inside `className` (see `components/ui/Card.tsx`'s doc comment).
- **Skeleton loading rule:** add a `Skeleton` loading block ONLY on a page that already declares a `loading` boolean state gating its data list — reuse that existing state, never add a new one. If a page has no existing `loading` state, skip Skeleton for it (introducing new state would be a logic change, out of scope).
- **A container that uses non-default colors** (e.g. a red "Danger Zone" box using `border-danger-border bg-danger-surface` instead of `border-neutral-200 bg-surface-card`) must NOT be wrapped in `Card` (which hardcodes the neutral/card colors) — leave it as a plain `<div>` with `shadow-card transition-shadow duration-150 hover:shadow-raised` added manually, mirroring the sub-project A `/dashboard` warning-Link precedent.
- **A link-styled, chrome-less action** (plain colored text with no border/background, e.g. a small inline "ลบ" delete-holiday link) stays a plain `<button>` — forcing it into `Button`'s bordered/padded chrome would be a visible behavior change beyond "reuse the same styling," which is out of scope for a presentation-only refactor.

## File Structure

| File | Change |
|---|---|
| `app/login/page.tsx` | Card + Button, fix pre-existing hardcoded zinc/red colors |
| `app/setup/page.tsx` | Card ×4 (wizard steps) + Button |
| `app/(app)/dashboard/rooms/page.tsx` | Card (list + 2 modals→Modal) + Button + Skeleton |
| `app/(app)/dashboard/users/page.tsx` | Card (list + modal→Modal) + Button + Skeleton |
| `app/(app)/dashboard/settings/page.tsx` | Card ×3 + Button + Skeleton |
| `app/(app)/dashboard/data/page.tsx` | Card ×2 (export, retention) + Button + Modal |
| `app/(app)/dashboard/integrations/page.tsx` | Card (quota + log cards) + Badge (failed-log service pill) + Button |
| `app/(app)/dashboard/activity/page.tsx` | Card (list) + Button + Skeleton |
| `app/(app)/approver/history/page.tsx` | Card (list) + Skeleton |
| `app/(app)/approver/cancel-requests/page.tsx` | Card (list + modal→Modal) + Button + Skeleton |
| `app/(app)/dashboard/bookings/page.tsx` | Finish: Card (list + modal→Modal) + Button + Skeleton (Badge already done in sub-project A) |
| `app/(app)/profile/bookings/page.tsx` | Finish: Card (list + modal→Modal) + Button + Skeleton (Badge already done in sub-project A) |

---

### Task 1: Apply to `/login`

**Files:**
- Modify: `app/login/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button` from `@/components/ui/*`

- [ ] **Step 1: Replace the whole file**

This is a small file (86 lines) and also has 5 pre-existing hardcoded-color violations (`text-zinc-600`, `text-zinc-900` ×2, `border-zinc-300` ×2, `text-red-600`, `bg-zinc-900`) — fix these as an in-scope bonus, same pattern as sub-project A's `/home` fix. Replace the entire file content with:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const PASSWORD_LOGIN_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "true";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      return;
    }

    router.push("/home");
    router.refresh();
  }

  if (!PASSWORD_LOGIN_ENABLED) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-text-secondary">
          ปิดใช้งานการเข้าสู่ระบบด้วยรหัสผ่านชั่วคราว
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm animate-fade-in-up">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-text-primary">
            เข้าสู่ระบบ (ทดสอบ)
          </h1>
          <input
            type="email"
            required
            placeholder="อีเมล"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 text-text-primary"
          />
          <input
            type="password"
            required
            placeholder="รหัสผ่าน"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 text-text-primary"
          />
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

Note: `Button` internally sets `type="button"` before spreading `{...rest}` in JSX, so passing `type="submit"` here correctly overrides it (later JSX attributes win) — confirmed by reading `components/ui/Button.tsx` before relying on this.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: apply Card and Button components to /login, fix pre-existing hardcoded colors"
```

---

### Task 2: Apply to `/setup`

**Files:**
- Modify: `app/setup/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`

- [ ] **Step 1: Add imports**

Replace:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
```
With:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
```

- [ ] **Step 2: Add fade-in to page wrapper**

Replace:
```tsx
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ตั้งค่าระบบเริ่มต้น
      </h1>
```
With:
```tsx
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ตั้งค่าระบบเริ่มต้น
      </h1>
```

- [ ] **Step 3: Convert step 1**

Replace:
```tsx
      {step === 1 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-surface-card p-5">
          <p className="text-text-primary">
            ยินดีต้อนรับสู่ระบบจองห้องประชุม LPRU ก่อนเริ่มใช้งาน
            กรุณาตั้งค่าเริ่มต้น 3 ขั้นตอน ได้แก่ เพิ่มห้องประชุม, กำหนด
            Approval Chain, และเวลาทำการ
          </p>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="mt-4 rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary"
          >
            เริ่มต้น
          </button>
        </div>
      )}
```
With:
```tsx
      {step === 1 && (
        <Card className="mt-6">
          <p className="text-text-primary">
            ยินดีต้อนรับสู่ระบบจองห้องประชุม LPRU ก่อนเริ่มใช้งาน
            กรุณาตั้งค่าเริ่มต้น 3 ขั้นตอน ได้แก่ เพิ่มห้องประชุม, กำหนด
            Approval Chain, และเวลาทำการ
          </p>
          <Button onClick={() => setStep(2)} className="mt-4">
            เริ่มต้น
          </Button>
        </Card>
      )}
```

- [ ] **Step 4: Convert step 2**

Replace:
```tsx
      {step === 2 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-surface-card p-5">
          <p className="font-medium text-text-primary">เพิ่มห้องประชุม</p>

          {roomsLoadError && (
            <p className="mt-2 text-sm text-danger-text">{roomsLoadError}</p>
          )}

          <div className="mt-3 space-y-2">
            {rooms.map((r) => (
              <div key={r.id} className="text-sm text-text-primary">
                {r.name} (จุ {r.capacity} คน)
              </div>
            ))}
            {rooms.length === 0 && (
              <p className="text-sm text-text-secondary">ยังไม่มีห้อง</p>
            )}
          </div>

          <div className="mt-4 flex gap-3">
            <input
              type="text"
              placeholder="ชื่อห้อง"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-1/2 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            <input
              type="number"
              min={1}
              placeholder="จำนวนที่นั่ง"
              value={roomCapacity}
              onChange={(e) => setRoomCapacity(e.target.value)}
              className="w-1/3 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            <button
              type="button"
              onClick={handleAddRoom}
              disabled={addingRoom}
              className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary disabled:opacity-50"
            >
              {addingRoom ? "กำลังเพิ่ม..." : "เพิ่ม"}
            </button>
          </div>
          {roomFormError && (
            <p className="mt-2 text-sm text-danger-text">{roomFormError}</p>
          )}

          <div className="mt-4 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={totalRooms === 0}
              className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}
```
With:
```tsx
      {step === 2 && (
        <Card className="mt-6">
          <p className="font-medium text-text-primary">เพิ่มห้องประชุม</p>

          {roomsLoadError && (
            <p className="mt-2 text-sm text-danger-text">{roomsLoadError}</p>
          )}

          <div className="mt-3 space-y-2">
            {rooms.map((r) => (
              <div key={r.id} className="text-sm text-text-primary">
                {r.name} (จุ {r.capacity} คน)
              </div>
            ))}
            {rooms.length === 0 && (
              <p className="text-sm text-text-secondary">ยังไม่มีห้อง</p>
            )}
          </div>

          <div className="mt-4 flex gap-3">
            <input
              type="text"
              placeholder="ชื่อห้อง"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-1/2 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            <input
              type="number"
              min={1}
              placeholder="จำนวนที่นั่ง"
              value={roomCapacity}
              onChange={(e) => setRoomCapacity(e.target.value)}
              className="w-1/3 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            <Button variant="secondary" onClick={handleAddRoom} disabled={addingRoom}>
              {addingRoom ? "กำลังเพิ่ม..." : "เพิ่ม"}
            </Button>
          </div>
          {roomFormError && (
            <p className="mt-2 text-sm text-danger-text">{roomFormError}</p>
          )}

          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>
              ย้อนกลับ
            </Button>
            <Button onClick={() => setStep(3)} disabled={totalRooms === 0}>
              ถัดไป
            </Button>
          </div>
        </Card>
      )}
```

- [ ] **Step 5: Convert step 3**

Replace:
```tsx
      {step === 3 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-surface-card p-5">
          <p className="font-medium text-text-primary">Approval Chain</p>

          {configLoadError && (
            <p className="mt-2 text-sm text-danger-text">{configLoadError}</p>
          )}
```
With:
```tsx
      {step === 3 && (
        <Card className="mt-6">
          <p className="font-medium text-text-primary">Approval Chain</p>

          {configLoadError && (
            <p className="mt-2 text-sm text-danger-text">{configLoadError}</p>
          )}
```

Replace (the closing part of step 3, note the buttons and closing tag):
```tsx
          <div className="mt-4 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
```
With:
```tsx
          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(2)}>
              ย้อนกลับ
            </Button>
            <Button onClick={() => setStep(4)}>
              ถัดไป
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && (
```

- [ ] **Step 6: Convert step 4**

Replace:
```tsx
        <div className="mt-6 rounded-lg border border-neutral-200 bg-surface-card p-5">
          <p className="font-medium text-text-primary">เวลาทำการ</p>
```
With:
```tsx
        <Card className="mt-6">
          <p className="font-medium text-text-primary">เวลาทำการ</p>
```

Replace:
```tsx
            <input
              type="date"
              value={newHoliday}
              onChange={(e) => setNewHoliday(e.target.value)}
              className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            <button
              type="button"
              onClick={addHoliday}
              className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
            >
              เพิ่ม
            </button>
          </div>
```
With:
```tsx
            <input
              type="date"
              value={newHoliday}
              onChange={(e) => setNewHoliday(e.target.value)}
              className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            <Button variant="secondary" onClick={addHoliday}>
              เพิ่ม
            </Button>
          </div>
```

Note: the small "ลบ" text-link to remove a single holiday (`className="text-sm text-danger-text"`, no border/background) stays a plain `<button>` — it is a chrome-less inline link, not one of Button's 3 bordered/padded variants (per the Global Constraints exception).

Replace (final buttons + closing tag):
```tsx
          <div className="mt-4 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={handleFinish}
              disabled={finishing}
              className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
            >
              {finishing ? "กำลังบันทึก..." : "เสร็จสิ้น"}
            </button>
          </div>
        </div>
      )}
```
With:
```tsx
          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(3)}>
              ย้อนกลับ
            </Button>
            <Button onClick={handleFinish} disabled={finishing}>
              {finishing ? "กำลังบันทึก..." : "เสร็จสิ้น"}
            </Button>
          </div>
        </Card>
      )}
```

- [ ] **Step 7: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass

- [ ] **Step 8: Commit**

```bash
git add app/setup/page.tsx
git commit -m "feat: apply Card and Button components to /setup wizard"
```

---

### Task 3: Apply to `/dashboard/rooms`

**Files:**
- Modify: `app/(app)/dashboard/rooms/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `Modal`, `Skeleton`

- [ ] **Step 1: Add imports**

Replace:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
```
With:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
```

- [ ] **Step 2: Fade-in wrapper + header button**

Replace:
```tsx
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">
          จัดการห้องประชุม
        </h1>
        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary"
        >
          เพิ่มห้องใหม่
        </button>
      </div>
```
With:
```tsx
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">
          จัดการห้องประชุม
        </h1>
        <Button onClick={openCreateForm}>เพิ่มห้องใหม่</Button>
      </div>
```

- [ ] **Step 3: Add Skeleton for loading, convert list to Card**

Replace:
```tsx
      {!loading && rooms.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">ยังไม่มีห้องประชุม</p>
      )}

      <div className="mt-4 space-y-3">
        {rooms.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">{r.name}</p>
            <p className="text-sm text-text-secondary">
              ความจุ {r.capacity} คน — สถานะ: {STATUS_LABEL[r.status] ?? r.status}
            </p>
            {r.equipment.length > 0 && (
              <p className="text-sm text-text-secondary">
                อุปกรณ์: {r.equipment.join(", ")}
              </p>
            )}
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => openEditForm(r)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                แก้ไข
              </button>
              <button
                type="button"
                onClick={() => handleDeleteClick(r)}
                className="rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ลบ
              </button>
            </div>
          </div>
        ))}
      </div>
```
With:
```tsx
      {!loading && rooms.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">ยังไม่มีห้องประชุม</p>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && (
        <div className="mt-4 space-y-3">
          {rooms.map((r) => (
            <Card key={r.id}>
              <p className="font-medium text-text-primary">{r.name}</p>
              <p className="text-sm text-text-secondary">
                ความจุ {r.capacity} คน — สถานะ:{" "}
                {STATUS_LABEL[r.status] ?? r.status}
              </p>
              {r.equipment.length > 0 && (
                <p className="text-sm text-text-secondary">
                  อุปกรณ์: {r.equipment.join(", ")}
                </p>
              )}
              <div className="mt-3 flex gap-3">
                <Button variant="secondary" onClick={() => openEditForm(r)}>
                  แก้ไข
                </Button>
                <Button variant="danger" onClick={() => handleDeleteClick(r)}>
                  ลบ
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Convert the create/edit form dialog to Modal**

Replace:
```tsx
      {showForm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              {editing ? "แก้ไขห้องประชุม" : "เพิ่มห้องใหม่"}
            </p>
            <div className="mt-3 space-y-3">
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="ชื่อห้อง"
                className="w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
              <input
                type="number"
                value={formCapacity}
                onChange={(e) => setFormCapacity(e.target.value)}
                placeholder="จำนวนที่นั่ง"
                className="w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
              <select
                value={formStatus}
                onChange={(e) =>
                  setFormStatus(
                    e.target.value as "available" | "busy" | "maintenance"
                  )
                }
                className="w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              >
                <option value="available">ว่าง</option>
                <option value="busy">ไม่ว่าง</option>
                <option value="maintenance">ปิดปรับปรุง</option>
              </select>
              <input
                type="text"
                value={formEquipment}
                onChange={(e) => setFormEquipment(e.target.value)}
                placeholder="อุปกรณ์ (คั่นด้วยจุลภาค เช่น projector, whiteboard)"
                className="w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
            </div>
            {formError && (
              <p className="mt-2 text-sm text-danger-text">{formError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSubmitForm}
                disabled={submitting}
                className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
              >
                {submitting ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการลบห้อง
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {deleteTarget.name}
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={submitting}
                className="rounded-sm bg-danger-solid px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
              >
                {submitting ? "กำลังลบ..." : "ยืนยันลบ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```
With:
```tsx
      <Modal open={showForm} onClose={() => setShowForm(false)}>
        <p className="text-lg font-semibold text-text-primary">
          {editing ? "แก้ไขห้องประชุม" : "เพิ่มห้องใหม่"}
        </p>
        <div className="mt-3 space-y-3">
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="ชื่อห้อง"
            className="w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
          />
          <input
            type="number"
            value={formCapacity}
            onChange={(e) => setFormCapacity(e.target.value)}
            placeholder="จำนวนที่นั่ง"
            className="w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
          />
          <select
            value={formStatus}
            onChange={(e) =>
              setFormStatus(
                e.target.value as "available" | "busy" | "maintenance"
              )
            }
            className="w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
          >
            <option value="available">ว่าง</option>
            <option value="busy">ไม่ว่าง</option>
            <option value="maintenance">ปิดปรับปรุง</option>
          </select>
          <input
            type="text"
            value={formEquipment}
            onChange={(e) => setFormEquipment(e.target.value)}
            placeholder="อุปกรณ์ (คั่นด้วยจุลภาค เช่น projector, whiteboard)"
            className="w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
          />
        </div>
        {formError && (
          <p className="mt-2 text-sm text-danger-text">{formError}</p>
        )}
        <div className="mt-4 flex gap-3">
          <Button variant="secondary" onClick={() => setShowForm(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSubmitForm} disabled={submitting}>
            {submitting ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </Modal>

      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        {deleteTarget && (
          <>
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการลบห้อง
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {deleteTarget.name}
            </p>
            <div className="mt-4 flex gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                className="bg-danger-solid hover:bg-danger-solid"
                onClick={handleConfirmDelete}
                disabled={submitting}
              >
                {submitting ? "กำลังลบ..." : "ยืนยันลบ"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/rooms/page.tsx"
git commit -m "feat: apply Card, Button, Modal, and Skeleton components to /dashboard/rooms"
```

---

### Task 4: Apply to `/dashboard/users`

**Files:**
- Modify: `app/(app)/dashboard/users/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `Modal`, `Skeleton`

- [ ] **Step 1: Add imports**

Replace:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
```
With:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
```

- [ ] **Step 2: Fade-in wrapper + list conversion**

Replace:
```tsx
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        จัดการผู้ใช้
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      <div className="mt-4 space-y-3">
        {users.map((u) => (
          <div
            key={u.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">{u.full_name}</p>
            <p className="text-sm text-text-secondary">{u.email}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <select
                value={u.role}
                disabled={savingId === u.id}
                onChange={(e) =>
                  handleRoleChange(
                    u,
                    e.target.value as "user" | "approver" | "admin"
                  )
                }
                className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
              >
                <option value="user">{ROLE_LABEL.user}</option>
                <option value="approver">{ROLE_LABEL.approver}</option>
                <option value="admin">{ROLE_LABEL.admin}</option>
              </select>
              <input
                type="text"
                defaultValue={u.department ?? ""}
                disabled={savingId === u.id}
                onBlur={(e) => handleDepartmentBlur(u, e.target.value)}
                placeholder="หน่วยงาน"
                className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
              />
              <button
                type="button"
                onClick={() => setAnonymizeTarget(u)}
                className="rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ลบข้อมูลส่วนตัว (PDPA)
              </button>
            </div>
          </div>
        ))}
      </div>
```
With:
```tsx
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        จัดการผู้ใช้
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && (
        <div className="mt-4 space-y-3">
          {users.map((u) => (
            <Card key={u.id}>
              <p className="font-medium text-text-primary">{u.full_name}</p>
              <p className="text-sm text-text-secondary">{u.email}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <select
                  value={u.role}
                  disabled={savingId === u.id}
                  onChange={(e) =>
                    handleRoleChange(
                      u,
                      e.target.value as "user" | "approver" | "admin"
                    )
                  }
                  className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
                >
                  <option value="user">{ROLE_LABEL.user}</option>
                  <option value="approver">{ROLE_LABEL.approver}</option>
                  <option value="admin">{ROLE_LABEL.admin}</option>
                </select>
                <input
                  type="text"
                  defaultValue={u.department ?? ""}
                  disabled={savingId === u.id}
                  onBlur={(e) => handleDepartmentBlur(u, e.target.value)}
                  placeholder="หน่วยงาน"
                  className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
                />
                <Button variant="danger" onClick={() => setAnonymizeTarget(u)}>
                  ลบข้อมูลส่วนตัว (PDPA)
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
```

- [ ] **Step 3: Convert anonymize confirm dialog to Modal**

Replace:
```tsx
      {anonymizeTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการลบข้อมูลส่วนตัว
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {anonymizeTarget.full_name} ({anonymizeTarget.email})
            </p>
            <p className="mt-2 text-sm text-danger-text">
              การกระทำนี้จะลบชื่อ อีเมล และ LINE ID ของผู้ใช้นี้ถาวร
              กู้คืนไม่ได้ (ประวัติการจองและการอนุมัติยังคงอยู่)
            </p>
            {chainIds.has(anonymizeTarget.id) && (
              <p className="mt-2 text-sm text-warning-text">
                ผู้ใช้นี้เป็นสมาชิกของ Approval Chain ปัจจุบัน
                การลบข้อมูลจะทำให้ขั้นตอนอนุมัตินั้นดำเนินการต่อไม่ได้
                จนกว่าจะเปลี่ยนสมาชิก Chain
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setAnonymizeTarget(null)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmAnonymize}
                disabled={submitting}
                className="rounded-sm bg-danger-solid px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
              >
                {submitting ? "กำลังลบ..." : "ยืนยันลบข้อมูล"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```
With:
```tsx
      <Modal
        open={anonymizeTarget !== null}
        onClose={() => setAnonymizeTarget(null)}
      >
        {anonymizeTarget && (
          <>
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการลบข้อมูลส่วนตัว
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {anonymizeTarget.full_name} ({anonymizeTarget.email})
            </p>
            <p className="mt-2 text-sm text-danger-text">
              การกระทำนี้จะลบชื่อ อีเมล และ LINE ID ของผู้ใช้นี้ถาวร
              กู้คืนไม่ได้ (ประวัติการจองและการอนุมัติยังคงอยู่)
            </p>
            {chainIds.has(anonymizeTarget.id) && (
              <p className="mt-2 text-sm text-warning-text">
                ผู้ใช้นี้เป็นสมาชิกของ Approval Chain ปัจจุบัน
                การลบข้อมูลจะทำให้ขั้นตอนอนุมัตินั้นดำเนินการต่อไม่ได้
                จนกว่าจะเปลี่ยนสมาชิก Chain
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setAnonymizeTarget(null)}
              >
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                className="bg-danger-solid hover:bg-danger-solid"
                onClick={handleConfirmAnonymize}
                disabled={submitting}
              >
                {submitting ? "กำลังลบ..." : "ยืนยันลบข้อมูล"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/dashboard/users/page.tsx"
git commit -m "feat: apply Card, Button, Modal, and Skeleton components to /dashboard/users"
```

---

### Task 5: Apply to `/dashboard/settings`

**Files:**
- Modify: `app/(app)/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `Skeleton`

- [ ] **Step 1: Add imports**

Replace:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
```
With:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
```

- [ ] **Step 2: Fade-in wrapper + Skeleton for loading**

Replace:
```tsx
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ตั้งค่าระบบ
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {formError && (
        <p className="mt-4 text-sm text-danger-text">{formError}</p>
      )}
      {successMessage && (
        <p className="mt-4 text-sm text-success-text">{successMessage}</p>
      )}

      {!loading && !loadError && (
        <div className="mt-4 space-y-6">
          <div className="rounded-lg border border-neutral-200 bg-surface-card p-5">
            <p className="font-medium text-text-primary">Approval Chain</p>
```
With:
```tsx
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ตั้งค่าระบบ
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {formError && (
        <p className="mt-4 text-sm text-danger-text">{formError}</p>
      )}
      {successMessage && (
        <p className="mt-4 text-sm text-success-text">{successMessage}</p>
      )}

      {loading && (
        <div className="mt-4 space-y-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {!loading && !loadError && (
        <div className="mt-4 space-y-6">
          <Card>
            <p className="font-medium text-text-primary">Approval Chain</p>
```

- [ ] **Step 3: Convert remaining 2 section wrappers to Card**

Replace:
```tsx
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-surface-card p-5">
            <p className="font-medium text-text-primary">เวลาทำการ</p>
```
With:
```tsx
            </div>
          </Card>

          <Card>
            <p className="font-medium text-text-primary">เวลาทำการ</p>
```

Replace:
```tsx
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-surface-card p-5">
            <p className="font-medium text-text-primary">วันหยุด</p>
```
With:
```tsx
            </div>
          </Card>

          <Card>
            <p className="font-medium text-text-primary">วันหยุด</p>
```

- [ ] **Step 4: Convert add-holiday and submit buttons, close final Card**

Replace:
```tsx
              <input
                type="date"
                value={newHoliday}
                onChange={(e) => setNewHoliday(e.target.value)}
                className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
              <button
                type="button"
                onClick={addHoliday}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                เพิ่ม
              </button>
            </div>
```
With:
```tsx
              <input
                type="date"
                value={newHoliday}
                onChange={(e) => setNewHoliday(e.target.value)}
                className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
              <Button variant="secondary" onClick={addHoliday}>
                เพิ่ม
              </Button>
            </div>
```

Note: the inline "ลบ" text-link per holiday row (`className="text-sm text-danger-text"`) stays a plain `<button>` — same chrome-less-link exception as `/setup`.

Replace (closing the third Card + the submit button):
```tsx
              {holidays.length === 0 && (
                <p className="text-sm text-text-secondary">ยังไม่มีวันหยุด</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
          >
            {submitting ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </button>
        </div>
      )}
    </div>
  );
}
```
With:
```tsx
              {holidays.length === 0 && (
                <p className="text-sm text-text-secondary">ยังไม่มีวันหยุด</p>
              )}
            </div>
          </Card>

          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/settings/page.tsx"
git commit -m "feat: apply Card, Button, and Skeleton components to /dashboard/settings"
```

---

### Task 6: Apply to `/dashboard/data`

**Files:**
- Modify: `app/(app)/dashboard/data/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `Modal`

**Note:** the "Danger Zone" box uses `border-danger-border bg-danger-surface` (not the default neutral/card colors `Card` hardcodes) — per Global Constraints, leave it as a plain `<div>` with manual `shadow-card transition-shadow duration-150 hover:shadow-raised` added, do not wrap in `Card`. No `loading` state exists in this file — skip Skeleton (Global Constraints rule).

- [ ] **Step 1: Add imports**

Replace:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
```
With:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
```

- [ ] **Step 2: Fade-in wrapper + export section**

Replace:
```tsx
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
```
With:
```tsx
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        จัดการข้อมูล
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}

      <Card className="mt-6">
        <p className="font-medium text-text-primary">Export ข้อมูล</p>
        {exportError && (
          <p className="mt-2 text-sm text-danger-text">{exportError}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-3">
          {(["bookings", "approval_history", "users"] as Dataset[]).map(
            (dataset) => (
              <Button
                key={dataset}
                variant="secondary"
                onClick={() => handleExport(dataset)}
                disabled={exportingDataset === dataset}
              >
                {exportingDataset === dataset
                  ? "กำลังสร้างไฟล์..."
                  : `Export ${DATASET_LABEL[dataset]} (CSV)`}
              </Button>
            )
          )}
        </div>
      </Card>
```

- [ ] **Step 3: Convert retention section**

Replace:
```tsx
      <div className="mt-6 rounded-lg border border-neutral-200 bg-surface-card p-5">
        <p className="font-medium text-text-primary">Retention Settings</p>
```
With:
```tsx
      <Card className="mt-6">
        <p className="font-medium text-text-primary">Retention Settings</p>
```

Replace:
```tsx
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
```
With:
```tsx
        {retentionSuccess && (
          <p className="mt-2 text-sm text-success-text">
            {retentionSuccess}
          </p>
        )}
        <Button
          onClick={handleRetentionSubmit}
          disabled={retentionSubmitting}
          className="mt-3"
        >
          {retentionSubmitting ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </Button>
      </Card>

      <div className="mt-6 rounded-lg border border-danger-border bg-danger-surface p-5 shadow-card transition-shadow duration-150 hover:shadow-raised">
```

- [ ] **Step 4: Convert danger-zone button + confirm dialog to Modal**

Replace:
```tsx
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
With:
```tsx
        <Button
          variant="primary"
          className="mt-3 bg-danger-solid hover:bg-danger-solid"
          onClick={() => setCleanupConfirmOpen(true)}
        >
          ล้าง log เก่าทันที
        </Button>
      </div>

      <Modal
        open={cleanupConfirmOpen}
        onClose={() => setCleanupConfirmOpen(false)}
      >
        <p className="text-lg font-semibold text-text-primary">
          ยืนยันการล้าง log เก่า
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          การกระทำนี้จะลบ Activity Log และ Integration Log
          ที่เก่าเกินระยะเวลาที่ตั้งไว้ถาวร กู้คืนไม่ได้
          (ไม่กระทบประวัติการอนุมัติและการยกเลิก ซึ่งเก็บถาวรเสมอ)
        </p>
        <div className="mt-4 flex gap-3">
          <Button
            variant="secondary"
            onClick={() => setCleanupConfirmOpen(false)}
          >
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            className="bg-danger-solid hover:bg-danger-solid"
            onClick={handleConfirmCleanup}
            disabled={cleanupSubmitting}
          >
            {cleanupSubmitting ? "กำลังลบ..." : "ยืนยันลบ"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/data/page.tsx"
git commit -m "feat: apply Card, Button, and Modal components to /dashboard/data"
```

---

### Task 7: Apply to `/dashboard/integrations`

**Files:**
- Modify: `app/(app)/dashboard/integrations/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Badge`, `Button`

**Note:** no `loading` state exists in this file (only `quotaError`/`logsError`) — skip Skeleton per Global Constraints (would require adding new state).

- [ ] **Step 1: Add imports**

Replace:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
```
With:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
```

- [ ] **Step 2: Fade-in wrapper + quota cards**

Replace:
```tsx
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
```
With:
```tsx
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
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
            <Card key={service}>
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
            </Card>
          );
        })}
      </div>
```

- [ ] **Step 3: Convert failed-log cards + service Badge + pagination buttons**

Replace:
```tsx
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
With:
```tsx
      <div className="mt-4 space-y-3">
        {failedLogs.map((log) => (
          <Card key={log.id}>
            <Badge tone="danger">{SERVICE_LABEL[log.service]}</Badge>
            {log.error_detail && (
              <p className="mt-2 text-sm text-text-secondary">
                {log.error_detail}
              </p>
            )}
            <p className="mt-1 text-sm text-text-secondary">
              {new Date(log.created_at).toLocaleString("th-TH")}
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          ก่อนหน้า
        </Button>
        <span className="text-sm text-text-secondary">
          หน้า {page + 1} / {totalPages}
        </span>
        <Button
          variant="secondary"
          onClick={() => setPage((p) => p + 1)}
          disabled={page + 1 >= totalPages}
        >
          ถัดไป
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/dashboard/integrations/page.tsx"
git commit -m "feat: apply Card, Badge, and Button components to /dashboard/integrations"
```

---

### Task 8: Apply to `/dashboard/activity`

**Files:**
- Modify: `app/(app)/dashboard/activity/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `Skeleton`

- [ ] **Step 1: Add imports**

Replace:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
```
With:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
```

- [ ] **Step 2: Fade-in wrapper + Skeleton + Card list + pagination Buttons**

Replace:
```tsx
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ประวัติการทำงานรวม
      </h1>
```
With:
```tsx
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ประวัติการทำงานรวม
      </h1>
```

Replace:
```tsx
      {!loading && entries.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ไม่พบประวัติการทำงาน
        </p>
      )}

      <div className="mt-4 space-y-3">
        {entries.map((e) => (
          <div
            key={e.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">
              {getEventLabel(e.event_type, e.sub_type)}
            </p>
            <p className="text-sm text-text-secondary">
              โดย {e.actor_name}
              {e.related_ref && ` — ${e.related_ref}`}
            </p>
            {e.detail && (
              <p className="text-sm text-text-secondary">{e.detail}</p>
            )}
            <p className="mt-1 text-sm text-text-secondary">
              {new Date(e.occurred_at).toLocaleString("th-TH")}
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
With:
```tsx
      {!loading && entries.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ไม่พบประวัติการทำงาน
        </p>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!loading && (
        <div className="mt-4 space-y-3">
          {entries.map((e) => (
            <Card key={e.id}>
              <p className="font-medium text-text-primary">
                {getEventLabel(e.event_type, e.sub_type)}
              </p>
              <p className="text-sm text-text-secondary">
                โดย {e.actor_name}
                {e.related_ref && ` — ${e.related_ref}`}
              </p>
              {e.detail && (
                <p className="text-sm text-text-secondary">{e.detail}</p>
              )}
              <p className="mt-1 text-sm text-text-secondary">
                {new Date(e.occurred_at).toLocaleString("th-TH")}
              </p>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          ก่อนหน้า
        </Button>
        <span className="text-sm text-text-secondary">
          หน้า {page + 1} / {totalPages}
        </span>
        <Button
          variant="secondary"
          onClick={() => setPage((p) => p + 1)}
          disabled={page + 1 >= totalPages}
        >
          ถัดไป
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/activity/page.tsx"
git commit -m "feat: apply Card, Button, and Skeleton components to /dashboard/activity"
```

---

### Task 9: Apply to `/approver/history`

**Files:**
- Modify: `app/(app)/approver/history/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Skeleton`

**Note:** this page has no buttons at all (read-only list) — no `Button` needed.

- [ ] **Step 1: Add imports**

Replace:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
```
With:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
```

- [ ] **Step 2: Fade-in wrapper + Skeleton + Card list**

Replace:
```tsx
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ประวัติการทำงาน
      </h1>

      {loadError && <p className="mt-4 text-sm text-danger-text">{loadError}</p>}

      {!loading && entries.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ยังไม่มีประวัติการทำงาน
        </p>
      )}

      <div className="mt-4 space-y-3">
        {entries.map((e) => (
          <div
            key={e.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">
              {e.booking_title} ({e.booking_ref_id})
            </p>
            <p className="text-sm text-text-secondary">
              ขั้นที่ {e.step} —{" "}
              {e.action === "approved" ? "อนุมัติ" : "ปฏิเสธ"} —{" "}
              {new Date(e.acted_at).toLocaleString("th-TH")}
            </p>
            {e.note && (
              <p className="mt-1 text-sm text-text-secondary">{e.note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```
With:
```tsx
  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ประวัติการทำงาน
      </h1>

      {loadError && <p className="mt-4 text-sm text-danger-text">{loadError}</p>}

      {!loading && entries.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ยังไม่มีประวัติการทำงาน
        </p>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!loading && (
        <div className="mt-4 space-y-3">
          {entries.map((e) => (
            <Card key={e.id}>
              <p className="font-medium text-text-primary">
                {e.booking_title} ({e.booking_ref_id})
              </p>
              <p className="text-sm text-text-secondary">
                ขั้นที่ {e.step} —{" "}
                {e.action === "approved" ? "อนุมัติ" : "ปฏิเสธ"} —{" "}
                {new Date(e.acted_at).toLocaleString("th-TH")}
              </p>
              {e.note && (
                <p className="mt-1 text-sm text-text-secondary">{e.note}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/approver/history/page.tsx"
git commit -m "feat: apply Card and Skeleton components to /approver/history"
```

---

### Task 10: Apply to `/approver/cancel-requests`

**Files:**
- Modify: `app/(app)/approver/cancel-requests/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `Modal`, `Skeleton`

- [ ] **Step 1: Add imports**

Replace:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
```
With:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
```

- [ ] **Step 2: Fade-in wrapper + Skeleton + Card list + Buttons**

Replace:
```tsx
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        คำขอยกเลิกการจอง
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {!loading && requests.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ไม่มีคำขอยกเลิกในขณะนี้
        </p>
      )}

      <div className="mt-4 space-y-3">
        {requests.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">{r.title}</p>
            <p className="text-sm text-text-secondary">
              {r.ref_id} — ห้อง {r.room_name} — ผู้จอง {r.requester_name}
            </p>
            <p className="mt-2 text-sm text-text-primary">
              เหตุผล: {r.cancellation_reason ?? "-"}
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setConfirmTarget({ booking: r, decision: "approve" })
                }
                className="rounded-sm bg-success-solid px-4 py-2 text-sm font-medium text-text-on-primary"
              >
                อนุมัติการยกเลิก
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfirmTarget({ booking: r, decision: "reject" })
                }
                className="rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ปฏิเสธคำขอ
              </button>
            </div>
          </div>
        ))}
      </div>
```
With:
```tsx
  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        คำขอยกเลิกการจอง
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {!loading && requests.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ไม่มีคำขอยกเลิกในขณะนี้
        </p>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && (
        <div className="mt-4 space-y-3">
          {requests.map((r) => (
            <Card key={r.id}>
              <p className="font-medium text-text-primary">{r.title}</p>
              <p className="text-sm text-text-secondary">
                {r.ref_id} — ห้อง {r.room_name} — ผู้จอง {r.requester_name}
              </p>
              <p className="mt-2 text-sm text-text-primary">
                เหตุผล: {r.cancellation_reason ?? "-"}
              </p>
              <div className="mt-3 flex gap-3">
                <Button
                  variant="primary"
                  className="bg-success-solid hover:bg-success-solid"
                  onClick={() =>
                    setConfirmTarget({ booking: r, decision: "approve" })
                  }
                >
                  อนุมัติการยกเลิก
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    setConfirmTarget({ booking: r, decision: "reject" })
                  }
                >
                  ปฏิเสธคำขอ
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
```

- [ ] **Step 3: Convert confirm dialog to Modal**

Replace:
```tsx
      {confirmTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการ
              {confirmTarget.decision === "approve"
                ? "อนุมัติการยกเลิก"
                : "ปฏิเสธคำขอ"}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {confirmTarget.booking.title} ({confirmTarget.booking.ref_id})
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
              >
                {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```
With:
```tsx
      <Modal open={confirmTarget !== null} onClose={() => setConfirmTarget(null)}>
        {confirmTarget && (
          <>
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการ
              {confirmTarget.decision === "approve"
                ? "อนุมัติการยกเลิก"
                : "ปฏิเสธคำขอ"}
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

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/approver/cancel-requests/page.tsx"
git commit -m "feat: apply Card, Button, Modal, and Skeleton components to /approver/cancel-requests"
```

---

### Task 11: Finish applying to `/dashboard/bookings`

**Files:**
- Modify: `app/(app)/dashboard/bookings/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `Modal`, `Skeleton` (`Badge` already applied in sub-project A — do not touch the `Badge`/`STATUS_TONE` code)

- [ ] **Step 1: Add imports**

Replace:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/Badge";
```
With:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
```

- [ ] **Step 2: Fade-in wrapper + Skeleton + Card list + Button**

Replace:
```tsx
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        การจองทั้งหมด
      </h1>
```
With:
```tsx
  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        การจองทั้งหมด
      </h1>
```

Replace:
```tsx
      {!loading && bookings.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">ไม่พบรายการจอง</p>
      )}

      <div className="mt-4 space-y-3">
        {bookings.map((b) => (
          <div
            key={b.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">{b.title}</p>
            <p className="text-sm text-text-secondary">
              {b.ref_id} — ห้อง {b.room_name} — ผู้จอง {b.requester_name}
            </p>
            <div className="mt-1">
              <Badge tone={STATUS_TONE[b.final_status] ?? "neutral"}>
                {STATUS_LABEL[b.final_status] ?? b.final_status}
              </Badge>
            </div>
            {!TERMINAL_STATUSES.includes(b.final_status) && (
              <button
                type="button"
                onClick={() => openCancelDialog(b)}
                className="mt-3 rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ยกเลิกโดย Admin
              </button>
            )}
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
```
With:
```tsx
      {!loading && bookings.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">ไม่พบรายการจอง</p>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && (
        <div className="mt-4 space-y-3">
          {bookings.map((b) => (
            <Card key={b.id}>
              <p className="font-medium text-text-primary">{b.title}</p>
              <p className="text-sm text-text-secondary">
                {b.ref_id} — ห้อง {b.room_name} — ผู้จอง {b.requester_name}
              </p>
              <div className="mt-1">
                <Badge tone={STATUS_TONE[b.final_status] ?? "neutral"}>
                  {STATUS_LABEL[b.final_status] ?? b.final_status}
                </Badge>
              </div>
              {!TERMINAL_STATUSES.includes(b.final_status) && (
                <Button
                  variant="danger"
                  onClick={() => openCancelDialog(b)}
                  className="mt-3"
                >
                  ยกเลิกโดย Admin
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          ก่อนหน้า
        </Button>
        <span className="text-sm text-text-secondary">
          หน้า {page + 1} / {totalPages}
        </span>
        <Button
          variant="secondary"
          onClick={() => setPage((p) => p + 1)}
          disabled={page + 1 >= totalPages}
        >
          ถัดไป
        </Button>
      </div>
```

- [ ] **Step 3: Convert cancel-confirm dialog to Modal**

Replace:
```tsx
      {cancelTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการยกเลิกโดย Admin
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {cancelTarget.title} ({cancelTarget.ref_id})
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="กรุณาระบุเหตุผลการยกเลิก"
              rows={3}
              className="mt-3 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            {reasonError && (
              <p className="mt-1 text-sm text-danger-text">{reasonError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={submitting}
                className="rounded-sm bg-danger-solid px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
              >
                {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```
With:
```tsx
      <Modal open={cancelTarget !== null} onClose={() => setCancelTarget(null)}>
        {cancelTarget && (
          <>
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการยกเลิกโดย Admin
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {cancelTarget.title} ({cancelTarget.ref_id})
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="กรุณาระบุเหตุผลการยกเลิก"
              rows={3}
              className="mt-3 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            {reasonError && (
              <p className="mt-1 text-sm text-danger-text">{reasonError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <Button variant="secondary" onClick={() => setCancelTarget(null)}>
                ปิด
              </Button>
              <Button
                variant="primary"
                className="bg-danger-solid hover:bg-danger-solid"
                onClick={handleConfirmCancel}
                disabled={submitting}
              >
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

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/dashboard/bookings/page.tsx"
git commit -m "feat: apply Card, Button, Modal, and Skeleton components to /dashboard/bookings"
```

---

### Task 12: Finish applying to `/profile/bookings`

**Files:**
- Modify: `app/(app)/profile/bookings/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `Modal`, `Skeleton` (`Badge` already applied in sub-project A — do not touch the `Badge`/`STATUS_TONE` code)

- [ ] **Step 1: Add imports**

Replace:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/Badge";
```
With:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
```

- [ ] **Step 2: Fade-in wrapper + Skeleton + Card list + Buttons**

Replace:
```tsx
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ประวัติการจองของฉัน
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {!loading && bookings.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ยังไม่มีประวัติการจอง
        </p>
      )}

      <div className="mt-4 space-y-3">
        {bookings.map((b) => (
          <div
            key={b.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">{b.title}</p>
            <p className="text-sm text-text-secondary">
              {b.ref_id} — ห้อง {b.room_name}
            </p>
            <div className="mt-1">
              <Badge tone={STATUS_TONE[b.final_status] ?? "neutral"}>
                {STATUS_LABEL[b.final_status] ?? b.final_status}
              </Badge>
            </div>
            {b.final_status === "pending" && (
              <button
                type="button"
                onClick={() => openCancelDialog(b)}
                className="mt-3 rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ยกเลิกการจอง
              </button>
            )}
            {b.final_status === "approved" && (
              <button
                type="button"
                onClick={() => openCancelDialog(b)}
                className="mt-3 rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ขอยกเลิกการจอง
              </button>
            )}
          </div>
        ))}
      </div>
```
With:
```tsx
  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ประวัติการจองของฉัน
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {!loading && bookings.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ยังไม่มีประวัติการจอง
        </p>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && (
        <div className="mt-4 space-y-3">
          {bookings.map((b) => (
            <Card key={b.id}>
              <p className="font-medium text-text-primary">{b.title}</p>
              <p className="text-sm text-text-secondary">
                {b.ref_id} — ห้อง {b.room_name}
              </p>
              <div className="mt-1">
                <Badge tone={STATUS_TONE[b.final_status] ?? "neutral"}>
                  {STATUS_LABEL[b.final_status] ?? b.final_status}
                </Badge>
              </div>
              {b.final_status === "pending" && (
                <Button
                  variant="danger"
                  onClick={() => openCancelDialog(b)}
                  className="mt-3"
                >
                  ยกเลิกการจอง
                </Button>
              )}
              {b.final_status === "approved" && (
                <Button
                  variant="danger"
                  onClick={() => openCancelDialog(b)}
                  className="mt-3"
                >
                  ขอยกเลิกการจอง
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
```

- [ ] **Step 3: Convert cancel-confirm dialog to Modal**

Replace:
```tsx
      {cancelTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              {cancelTarget.final_status === "pending"
                ? "ยืนยันการยกเลิกการจอง"
                : "ยืนยันการส่งคำขอยกเลิก"}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {cancelTarget.title} ({cancelTarget.ref_id})
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="กรุณาระบุเหตุผลการยกเลิก"
              rows={3}
              className="mt-3 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            {reasonError && (
              <p className="mt-1 text-sm text-danger-text">{reasonError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={submitting}
                className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
              >
                {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```
With:
```tsx
      <Modal open={cancelTarget !== null} onClose={() => setCancelTarget(null)}>
        {cancelTarget && (
          <>
            <p className="text-lg font-semibold text-text-primary">
              {cancelTarget.final_status === "pending"
                ? "ยืนยันการยกเลิกการจอง"
                : "ยืนยันการส่งคำขอยกเลิก"}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {cancelTarget.title} ({cancelTarget.ref_id})
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="กรุณาระบุเหตุผลการยกเลิก"
              rows={3}
              className="mt-3 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            {reasonError && (
              <p className="mt-1 text-sm text-danger-text">{reasonError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <Button variant="secondary" onClick={() => setCancelTarget(null)}>
                ปิด
              </Button>
              <Button onClick={handleConfirmCancel} disabled={submitting}>
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

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/profile/bookings/page.tsx"
git commit -m "feat: apply Card, Button, Modal, and Skeleton components to /profile/bookings"
```

---

### Task 13: Manual Verification

**Files:** none (verification only)

- [ ] **Step 1: Build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass, all 17 routes generated (16 pages + not-found)

- [ ] **Step 2: Spot-check via browser — admin flows**

Login as `admin@test.local` / `test1234`. Visit `/dashboard/rooms`, `/dashboard/users`, `/dashboard/settings`, `/dashboard/data`, `/dashboard/integrations`, `/dashboard/activity`, `/dashboard/bookings`.
Expected: all list items render as shadowed Cards with hover elevation; all buttons show the correct variant color and hover-scale; opening any modal (edit room, delete room, anonymize user, cleanup logs, admin-cancel booking) shows the scale-fade-in animation and `shadow-modal`; closing via Cancel does not submit; while data is loading, Skeleton placeholders appear briefly (where applicable) before the real list renders.

- [ ] **Step 3: Spot-check via browser — approver flows**

Login as `approver1@test.local` (or whichever role reaches the approval chain). Visit `/approver/history`, `/approver/cancel-requests`.
Expected: history list renders as Cards; cancel-requests approve/reject buttons show correct colors, confirm Modal works.

- [ ] **Step 4: Spot-check via browser — user flows**

Visit `/login` (if `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true` in this environment) and `/profile/bookings`.
Expected: login form renders inside a Card with fade-in; profile/bookings list renders as Cards with Badge + Button + Modal working as in `/dashboard/bookings`.

- [ ] **Step 5: Regression check — `/setup`**

Visit `/setup` (only reachable pre-completion, or directly by URL) and step through all 4 wizard steps.
Expected: each step renders inside a Card, buttons show correct variant styling, no change in the actual wizard logic (room add, chain selection, hours/holidays, finish still call the same Edge Functions).

- [ ] **Step 6: Full-system regression — the 4 sub-project A pages**

Re-visit `/home`, `/booking`, `/dashboard`, `/approver` briefly.
Expected: unaffected by this plan's changes (this plan touches different files), still working as verified in sub-project A.

---

## Self-Review Notes

- **Spec coverage:** all 12 pages listed in the original design spec's "sub-project B" scope are covered — Tasks 1-12. Manual verification (Task 13) covers all 3 roles (admin/approver/user) plus the pre-auth `/login` and `/setup` pages.
- **Placeholder scan:** no TBD/TODO; every step has copy-paste-ready before/after code, no "same as Task N" hand-waving.
- **Type consistency:** `Button` variant names (`primary`/`secondary`/`danger`), `Card`'s `padding`/`className` props, `Modal`'s `open`/`onClose`, `Badge`'s `tone` — used identically to their established signatures from sub-project A, verified against the actual `components/ui/*.tsx` source in this plan's task briefs.
- **YAGNI check:** no new Button variant added for solid success/danger confirm actions — reused the already-approved `variant="primary"` + className-override pattern from sub-project A's `/approver`. No Skeleton added to pages without an existing `loading` state (`/dashboard/data`, `/dashboard/integrations`) — avoids introducing new state for a presentation-only refactor. The Danger Zone box in `/dashboard/data` and both chrome-less inline "ลบ" links (`/setup`, `/dashboard/settings`) are deliberately left un-converted, matching precedents already established and reviewed in sub-project A.
- **Bonus fix carried over from sub-project A's pattern:** `/login`'s 5 pre-existing hardcoded zinc/red color classes fixed in Task 1, mirroring the `/home` fix from sub-project A.
