# Track D (sub-project 1) — จัดการห้อง/ผู้ใช้/ตั้งค่าระบบ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างหน้า Admin CRUD 3 หน้าแรก (`/dashboard/rooms`, `/dashboard/users`, `/dashboard/settings`) ให้ Admin จัดการห้องประชุม, role/department ของผู้ใช้, และ Approval Chain/เวลาทำการ/วันหยุด ได้จริง

**Architecture:** `/dashboard/rooms` และ `/dashboard/users` ใช้ direct client CRUD (RLS อนุญาต Admin เขียนตรงอยู่แล้ว ไม่อยู่ในรายการที่ต้องผ่าน Edge Function ของ `docs/SCHEMA.md`) — `/dashboard/settings` ต้องผ่าน Edge Function ใหม่ `update-approval-chain` ตามที่ `docs/SCHEMA.md` ระบุไว้ชัดเจน เพื่อเพิ่ม validation ที่ RLS ทำไม่ได้ (role ของสมาชิก chain, ความสัมพันธ์ของเวลาทำการ)

**Tech Stack:** Next.js 16 App Router (client component), Supabase Edge Function (Deno), `@supabase/supabase-js@2`

## Global Constraints

- **Design tokens เท่านั้น** (CLAUDE.md กฎข้อ 10) — ใช้ class จาก `docs/DESIGN.md` เท่านั้น (`bg-surface-card`, `bg-surface-field`, `text-text-primary`, `text-text-secondary`, `bg-danger-surface`, `border-danger-border`, `text-danger-text`, `bg-danger-solid`, `bg-success-text`(อ่าน: `text-success-text`), `text-warning-text`, `bg-brand-primary`, `border-neutral-*`, `shadow-modal` ฯลฯ) ห้าม hardcode สี/spacing/font
- **ข้อความ UI ภาษาไทยทางการ** (CLAUDE.md กฎข้อ 9)
- **`update-approval-chain` Edge Function ห่อด้วย `withErrorHandling()`** จาก `_shared/handler.ts`, throw `AppError` subclass จาก `_shared/errors.ts` เท่านั้น (CLAUDE.md กฎข้อ 1)
- **`/dashboard/rooms` และ `/dashboard/users` ใช้ direct client CRUD** ไม่ต้องมี Edge Function — เพราะ RLS (`013_rls_policies.sql`) อนุญาต Admin เขียนตรงอยู่แล้ว (`rooms: admin write/update/delete`, `users: admin update all`) และไม่อยู่ในรายการ "ต้อง Query ผ่าน Edge Function เท่านั้น" ของ `docs/SCHEMA.md`
- **`update-approval-chain` ใช้ `SupabaseClient` type จริงจาก `npm:@supabase/supabase-js@2`** (เหมือน Track B/C — เพราะ `supabase/functions` ถูก exclude จาก root tsc อยู่แล้วหลัง Task 1)
- **Route group directory ต้องเป็น `app/(app)` เป๊ะ** (วงเล็บเปิด-ปิดชิดกัน ไม่มี `/` แทรก) — Track B เคยมีบั๊กที่ implementer สร้างไดเรกทอรีผิดเป็น `app/(app/)` ทำให้ route ใช้งานไม่ได้ ตรวจสอบด้วย `ls "app/"` หลังสร้างไฟล์ทุกครั้งว่ามีแค่ไดเรกทอรี `(app)` เดียว
- **`verify_jwt=true` ต้องประกาศใน `supabase/config.toml` แบบ declarative** สำหรับ `update-approval-chain` (`[functions.update-approval-chain]`)
- **ไม่ต้องแก้ `lib/supabase/middleware.ts`** — prefix `/dashboard` → `["admin"]` ที่มีอยู่แล้วครอบคลุม `/dashboard/rooms`, `/dashboard/users`, `/dashboard/settings` ผ่าน longest-prefix matching (ไม่ชนกับ entry เฉพาะ `/dashboard/reports` ที่มีอยู่แล้วเพราะเป็นคนละ path)
- **ไม่มี Deno CLI / Supabase CLI / Supabase MCP ในเซสชันนี้** — Edge Function `.ts` verify ด้วย manual code review + `npx tsc --noEmit`/`npm run build` (เฉพาะไฟล์ frontend) เท่านั้น ไม่สามารถรัน/deploy Edge Function หรือรัน migration จริงได้ในเซสชันนี้ — migration 018 จะถูกสร้างเป็นไฟล์เท่านั้น ผู้ใช้ต้องรันเองผ่าน Supabase Dashboard SQL Editor หรือ MCP (เหมือน migration 015-017 ที่ผ่านมา)
- **`equipment` เป็น `jsonb` array ของ string** — ฝั่ง UI ใช้ text input คั่นด้วยจุลภาคแล้ว parse เป็น array ตอน submit เท่านั้น ไม่สร้าง component ใหม่

## File Structure

| File | หน้าที่ |
|---|---|
| `tsconfig.json` | เพิ่ม `"supabase/functions"` เข้า exclude |
| `supabase/migrations/018_harden_anonymize_execute_grant.sql` | Revoke PUBLIC EXECUTE จาก `anonymize_user_on_delete_request` |
| `supabase/functions/update-approval-chain/index.ts` | Edge Function แก้ไข `system_config` พร้อม validation |
| `supabase/config.toml` | เพิ่ม `[functions.update-approval-chain]` พร้อม `verify_jwt=true` |
| `app/(app)/dashboard/rooms/page.tsx` | CRUD ห้องประชุม |
| `app/(app)/dashboard/users/page.tsx` | แก้ role/department + PDPA anonymize |
| `app/(app)/dashboard/settings/page.tsx` | Approval Chain, เวลาทำการ, วันหยุด |

---

### Task 1: Exclude `supabase/functions` จาก root tsc

**Files:**
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: ไม่มี
- Produces: `npx tsc --noEmit` ที่ root ไม่พยายาม type-check ไฟล์ Deno ใน `supabase/functions/` อีกต่อไป

- [ ] **Step 1: แก้ tsconfig.json**

เปิด `tsconfig.json` หา key `"exclude"` (ปัจจุบันคือ `"exclude": ["node_modules"]`) แก้เป็น:

```json
"exclude": ["node_modules", "supabase/functions"]
```

- [ ] **Step 2: ตรวจว่า type-check ผ่าน**

Run: `npx tsc --noEmit`
Expected: exit code 0 ไม่มี error จากไฟล์ใน `supabase/functions/`

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: exclude supabase/functions from root tsc (Deno syntax incompatible with Node tsconfig)"
```

---

### Task 2: Migration — ปิดช่องโหว่ `anonymize_user_on_delete_request` EXECUTE grant

**Files:**
- Create: `supabase/migrations/018_harden_anonymize_execute_grant.sql`

**Interfaces:**
- Consumes: ฟังก์ชัน `anonymize_user_on_delete_request(uuid)` ที่มีอยู่แล้วจาก migration 011
- Produces: ไม่มี (migration file เท่านั้น — ยังไม่ถูกรันจริงในเซสชันนี้)

- [ ] **Step 1: สร้างไฟล์ migration**

```sql
-- ============================================================
-- 018_harden_anonymize_execute_grant.sql
-- Fix: anonymize_user_on_delete_request() (011) ไม่เคยถูกรวมใน
-- การ harden EXECUTE grant ของ 017 เพราะตอนนั้นยังไม่มีหน้า UI
-- เรียกใช้จริง — Track D เปิดใช้งานผ่าน /dashboard/users เป็น
-- จุดแรก จึงต้องปิดช่องโหว่ PUBLIC EXECUTE ตามแพทเทิร์นเดียวกับ
-- 017 ก่อน — Postgres grant EXECUTE ให้ PUBLIC โดย default เสมอ
-- ตอนสร้างฟังก์ชัน (RLS ภายในฟังก์ชันป้องกันการแก้ข้อมูลคนอื่น
-- อยู่แล้วแม้ไม่ revoke แต่ revoke เพื่อ defense-in-depth)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.anonymize_user_on_delete_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_user_on_delete_request(uuid) TO authenticated;
```

- [ ] **Step 2: ตรวจว่าไฟล์ไม่กระทบ tsc**

Run: `npx tsc --noEmit`
Expected: exit code 0 (ไฟล์ `.sql` ไม่เกี่ยวกับ tsc — คำสั่งนี้แค่ยืนยันว่าไม่มีไฟล์อื่นพัง)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/018_harden_anonymize_execute_grant.sql
git commit -m "fix: revoke public execute on anonymize_user_on_delete_request"
```

---

### Task 3: `update-approval-chain` Edge Function

**Files:**
- Create: `supabase/functions/update-approval-chain/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `withErrorHandling()` จาก `../_shared/handler.ts`, `ForbiddenError`/`UnauthorizedError`/`ValidationError` จาก `../_shared/errors.ts`
- Produces: HTTP endpoint `POST /functions/v1/update-approval-chain` รับ `{ admin_id, approver1_id, approver2_id, office_start_hour, office_end_hour, holidays }` คืนแถว `system_config` ที่อัปเดตแล้ว

- [ ] **Step 1: สร้างไฟล์**

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../_shared/errors.ts";

interface UpdateApprovalChainBody {
  admin_id: string;
  approver1_id: string;
  approver2_id: string;
  office_start_hour: number;
  office_end_hour: number;
  holidays: string[];
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

    const body: UpdateApprovalChainBody = await req.json();

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

    const {
      admin_id,
      approver1_id,
      approver2_id,
      office_start_hour,
      office_end_hour,
      holidays,
    } = body;

    const chainIds = [admin_id, approver1_id, approver2_id];
    if (new Set(chainIds).size !== chainIds.length) {
      throw new ValidationError("ผู้อนุมัติในแต่ละขั้นตอนต้องไม่ซ้ำกัน");
    }

    const { data: chainUsers, error: chainUsersError } = await adminClient
      .from("users")
      .select("id, role")
      .in("id", chainIds);

    if (chainUsersError) throw chainUsersError;

    const findRole = (id: string) =>
      chainUsers?.find((u) => u.id === id)?.role;

    if (
      findRole(admin_id) !== "admin" ||
      !["approver", "admin"].includes(findRole(approver1_id) ?? "") ||
      !["approver", "admin"].includes(findRole(approver2_id) ?? "")
    ) {
      throw new ValidationError("ผู้ที่เลือกต้องมีสิทธิ์ Approver หรือ Admin");
    }

    if (
      typeof office_start_hour !== "number" ||
      typeof office_end_hour !== "number" ||
      office_start_hour < 0 ||
      office_end_hour > 23 ||
      office_start_hour >= office_end_hour
    ) {
      throw new ValidationError("เวลาเปิดทำการต้องน้อยกว่าเวลาปิดทำการ");
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
        admin_id,
        approver1_id,
        approver2_id,
        office_start_hour,
        office_end_hour,
        holidays,
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

หาบรรทัดสุดท้ายของไฟล์ (`[experimental.pgdelta]` block) แล้วเพิ่มต่อท้ายไฟล์:

```toml

[functions.update-approval-chain]
verify_jwt = true
```

- [ ] **Step 3: ตรวจว่า type-check + build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ทั้งสองคำสั่งผ่าน

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/update-approval-chain/index.ts supabase/config.toml
git commit -m "feat: add update-approval-chain edge function"
```

---

### Task 4: หน้า `/dashboard/rooms`

**Files:**
- Create: `app/(app)/dashboard/rooms/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client`
- Produces: route `/dashboard/rooms`

**คำเตือนสำคัญ:** สร้างไดเรกทอรีด้วยชื่อ `app/(app)/dashboard/rooms/` ให้ตรงเป๊ะ (วงเล็บเปิด-ปิดชิดกัน `(app)`) — ไดเรกทอรี `app/(app)` มีอยู่แล้วในโปรเจกต์ (มี `app/(app)/home/page.tsx`, `app/(app)/layout.tsx`) ใช้ `mkdir -p "app/(app)/dashboard/rooms"` เป็นคำสั่งเดียว **ห้ามสร้างไดเรกทอรี `(app)` ใหม่**

- [ ] **Step 1: สร้างไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Room = {
  id: string;
  name: string;
  capacity: number;
  status: "available" | "busy" | "maintenance";
  equipment: string[];
};

const STATUS_LABEL: Record<string, string> = {
  available: "ว่าง",
  busy: "ไม่ว่าง",
  maintenance: "ปิดปรับปรุง",
};

export default function DashboardRoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Room | null>(null);
  const [formName, setFormName] = useState("");
  const [formCapacity, setFormCapacity] = useState("");
  const [formStatus, setFormStatus] = useState<
    "available" | "busy" | "maintenance"
  >("available");
  const [formEquipment, setFormEquipment] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadRooms() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("rooms")
      .select("id, name, capacity, status, equipment")
      .order("name", { ascending: true });

    if (error) {
      setLoadError("ไม่สามารถโหลดรายการห้องได้");
      setLoading(false);
      return;
    }

    setRooms((data ?? []) as Room[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRooms();
  }, []);

  function openCreateForm() {
    setEditing(null);
    setFormName("");
    setFormCapacity("");
    setFormStatus("available");
    setFormEquipment("");
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(room: Room) {
    setEditing(room);
    setFormName(room.name);
    setFormCapacity(String(room.capacity));
    setFormStatus(room.status);
    setFormEquipment(room.equipment.join(", "));
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmitForm() {
    const capacityNum = Number(formCapacity);

    if (formName.trim().length === 0) {
      setFormError("กรุณากรอกชื่อห้อง");
      return;
    }

    if (!Number.isInteger(capacityNum) || capacityNum <= 0) {
      setFormError("จำนวนที่นั่งต้องมากกว่า 0");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setActionError(null);

    const supabase = createClient();
    const equipmentArray = formEquipment
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (editing) {
      const { error } = await supabase
        .from("rooms")
        .update({
          name: formName.trim(),
          capacity: capacityNum,
          status: formStatus,
          equipment: equipmentArray,
        })
        .eq("id", editing.id);

      if (error) {
        setFormError("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        setSubmitting(false);
        return;
      }
    } else {
      const { error } = await supabase.from("rooms").insert({
        name: formName.trim(),
        capacity: capacityNum,
        status: formStatus,
        equipment: equipmentArray,
      });

      if (error) {
        setFormError("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    setShowForm(false);
    await loadRooms();
  }

  async function handleDeleteClick(room: Room) {
    setDeleteError(null);
    setActionError(null);

    const supabase = createClient();
    const { count, error } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id);

    if (error) {
      setActionError("ไม่สามารถตรวจสอบประวัติการจองได้");
      return;
    }

    if ((count ?? 0) > 0) {
      setDeleteError(
        "ห้องนี้มีประวัติการจอง ไม่สามารถลบได้ กรุณาเปลี่ยนสถานะเป็น 'ปิดปรับปรุง' แทน"
      );
      return;
    }

    setDeleteTarget(room);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;

    setSubmitting(true);
    setActionError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("rooms")
      .delete()
      .eq("id", deleteTarget.id);

    setSubmitting(false);
    setDeleteTarget(null);

    if (error) {
      setActionError("ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadRooms();
  }

  return (
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

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}
      {deleteError && (
        <p className="mt-4 text-sm text-danger-text">{deleteError}</p>
      )}

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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build สำเร็จ, route list มี `/dashboard/rooms` (ตรวจด้วย `ls "app/(app)/dashboard/rooms/"` ก่อนด้วยว่ามีแค่ไฟล์นี้ ไม่มีไดเรกทอรี `(app` หรือ `(app/)` แปลกปลอมเกิดขึ้น)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/rooms/page.tsx"
git commit -m "feat: add dashboard rooms CRUD page"
```

---

### Task 5: หน้า `/dashboard/users`

**Files:**
- Create: `app/(app)/dashboard/users/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client`, Postgres function `anonymize_user_on_delete_request(p_user_id uuid)` ผ่าน `supabase.rpc()` (ต้องรัน Task 2's migration ก่อนถึงจะเรียกสำเร็จจริงบน production — ในเซสชันนี้ verify แค่ build/type-check)
- Produces: route `/dashboard/users`

**คำเตือนสำคัญ:** สร้างไดเรกทอรี `app/(app)/dashboard/users/` ให้ตรงเป๊ะ ใช้ `mkdir -p "app/(app)/dashboard/users"` เป็นคำสั่งเดียว **ห้ามสร้างไดเรกทอรี `(app)` ใหม่**

- [ ] **Step 1: สร้างไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: "user" | "approver" | "admin";
  department: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  user: "ผู้ใช้ทั่วไป",
  approver: "ผู้อนุมัติ",
  admin: "ผู้ดูแลระบบ",
};

export default function DashboardUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [chainIds, setChainIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [anonymizeTarget, setAnonymizeTarget] = useState<UserRow | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();

    const [usersRes, configRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, full_name, email, role, department")
        .order("full_name", { ascending: true }),
      supabase
        .from("system_config")
        .select("admin_id, approver1_id, approver2_id")
        .single(),
    ]);

    if (usersRes.error) {
      setLoadError("ไม่สามารถโหลดรายชื่อผู้ใช้ได้");
      setLoading(false);
      return;
    }

    setUsers((usersRes.data ?? []) as UserRow[]);

    if (configRes.data) {
      setChainIds(
        new Set(
          [
            configRes.data.admin_id,
            configRes.data.approver1_id,
            configRes.data.approver2_id,
          ].filter((id): id is string => id !== null)
        )
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleRoleChange(
    user: UserRow,
    newRole: "user" | "approver" | "admin"
  ) {
    setSavingId(user.id);
    setActionError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ role: newRole })
      .eq("id", user.id);

    setSavingId(null);

    if (error) {
      setActionError("บันทึก role ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadUsers();
  }

  async function handleDepartmentBlur(user: UserRow, newDepartment: string) {
    if (newDepartment === (user.department ?? "")) return;

    setSavingId(user.id);
    setActionError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ department: newDepartment.trim() || null })
      .eq("id", user.id);

    setSavingId(null);

    if (error) {
      setActionError("บันทึกหน่วยงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadUsers();
  }

  async function handleConfirmAnonymize() {
    if (!anonymizeTarget) return;

    setSubmitting(true);
    setActionError(null);

    const supabase = createClient();
    const { error } = await supabase.rpc(
      "anonymize_user_on_delete_request",
      { p_user_id: anonymizeTarget.id }
    );

    setSubmitting(false);
    setAnonymizeTarget(null);

    if (error) {
      setActionError("ลบข้อมูลส่วนตัวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadUsers();
  }

  return (
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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build สำเร็จ, route list มี `/dashboard/users` (ตรวจด้วย `ls "app/(app)/dashboard/users/"` ว่าไม่มีไดเรกทอรี `(app` หรือ `(app/)` แปลกปลอมเกิดขึ้น)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/users/page.tsx"
git commit -m "feat: add dashboard users role/department management page"
```

---

### Task 6: หน้า `/dashboard/settings`

**Files:**
- Create: `app/(app)/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client`, Edge Function `update-approval-chain` จาก Task 3 (body `{admin_id, approver1_id, approver2_id, office_start_hour, office_end_hour, holidays}`)
- Produces: route `/dashboard/settings`

**คำเตือนสำคัญ:** สร้างไดเรกทอรี `app/(app)/dashboard/settings/` ให้ตรงเป๊ะ ใช้ `mkdir -p "app/(app)/dashboard/settings"` เป็นคำสั่งเดียว **ห้ามสร้างไดเรกทอรี `(app)` ใหม่**

- [ ] **Step 1: สร้างไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ChainUser = {
  id: string;
  full_name: string;
};

export default function DashboardSettingsPage() {
  const [chainUsers, setChainUsers] = useState<ChainUser[]>([]);
  const [adminId, setAdminId] = useState("");
  const [approver1Id, setApprover1Id] = useState("");
  const [approver2Id, setApprover2Id] = useState("");
  const [officeStartHour, setOfficeStartHour] = useState("8");
  const [officeEndHour, setOfficeEndHour] = useState("17");
  const [holidays, setHolidays] = useState<string[]>([]);
  const [newHoliday, setNewHoliday] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadSettings() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();

    const [configRes, usersRes] = await Promise.all([
      supabase
        .from("system_config")
        .select(
          "admin_id, approver1_id, approver2_id, office_start_hour, office_end_hour, holidays"
        )
        .single(),
      supabase
        .from("users")
        .select("id, full_name")
        .in("role", ["approver", "admin"])
        .order("full_name", { ascending: true }),
    ]);

    if (configRes.error || usersRes.error) {
      setLoadError("ไม่สามารถโหลดการตั้งค่าได้");
      setLoading(false);
      return;
    }

    setChainUsers((usersRes.data ?? []) as ChainUser[]);
    setAdminId(configRes.data.admin_id ?? "");
    setApprover1Id(configRes.data.approver1_id ?? "");
    setApprover2Id(configRes.data.approver2_id ?? "");
    setOfficeStartHour(String(configRes.data.office_start_hour));
    setOfficeEndHour(String(configRes.data.office_end_hour));
    setHolidays((configRes.data.holidays ?? []) as string[]);
    setLoading(false);
  }

  useEffect(() => {
    loadSettings();
  }, []);

  function addHoliday() {
    if (newHoliday && !holidays.includes(newHoliday)) {
      setHolidays([...holidays, newHoliday].sort());
      setNewHoliday("");
    }
  }

  function removeHoliday(date: string) {
    setHolidays(holidays.filter((h) => h !== date));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setFormError(null);
    setSuccessMessage(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setFormError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setSubmitting(false);
      return;
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-approval-chain`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          admin_id: adminId,
          approver1_id: approver1Id,
          approver2_id: approver2Id,
          office_start_hour: Number(officeStartHour),
          office_end_hour: Number(officeEndHour),
          holidays,
        }),
      }
    );

    const result = await res.json();

    setSubmitting(false);

    if (!res.ok) {
      setFormError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      return;
    }

    setSuccessMessage("บันทึกการตั้งค่าสำเร็จ");
    await loadSettings();
  }

  return (
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
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-sm text-text-secondary">
                  Admin (ขั้นที่ 1)
                </label>
                <select
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value)}
                  className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
                >
                  <option value="">-- เลือก --</option>
                  {chainUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-text-secondary">
                  Approver 1 (ขั้นที่ 2)
                </label>
                <select
                  value={approver1Id}
                  onChange={(e) => setApprover1Id(e.target.value)}
                  className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
                >
                  <option value="">-- เลือก --</option>
                  {chainUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-text-secondary">
                  Approver 2 (ขั้นที่ 3)
                </label>
                <select
                  value={approver2Id}
                  onChange={(e) => setApprover2Id(e.target.value)}
                  className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
                >
                  <option value="">-- เลือก --</option>
                  {chainUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-surface-card p-5">
            <p className="font-medium text-text-primary">เวลาทำการ</p>
            <div className="mt-3 flex gap-3">
              <div>
                <label className="text-sm text-text-secondary">
                  เปิด (ชม.)
                </label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={officeStartHour}
                  onChange={(e) => setOfficeStartHour(e.target.value)}
                  className="mt-1 w-24 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
                />
              </div>
              <div>
                <label className="text-sm text-text-secondary">
                  ปิด (ชม.)
                </label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={officeEndHour}
                  onChange={(e) => setOfficeEndHour(e.target.value)}
                  className="mt-1 w-24 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-surface-card p-5">
            <p className="font-medium text-text-primary">วันหยุด</p>
            <div className="mt-3 flex gap-3">
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
            <div className="mt-3 space-y-2">
              {holidays.map((h) => (
                <div key={h} className="flex items-center justify-between">
                  <span className="text-sm text-text-primary">{h}</span>
                  <button
                    type="button"
                    onClick={() => removeHoliday(h)}
                    className="text-sm text-danger-text"
                  >
                    ลบ
                  </button>
                </div>
              ))}
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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build สำเร็จ, route list มี `/dashboard/settings` (ตรวจด้วย `ls "app/(app)/dashboard/settings/"` ว่าไม่มีไดเรกทอรี `(app` หรือ `(app/)` แปลกปลอมเกิดขึ้น)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/settings/page.tsx"
git commit -m "feat: add dashboard settings page for approval chain and business hours"
```

---

### Task 7: Manual Verification (แบ่งเป็นส่วนที่ทดสอบได้ตอนนี้ กับส่วนที่รอ deploy/migrate)

**Files:** ไม่มี (verification เท่านั้น)

**ส่วนที่ทดสอบได้ตอนนี้ (ไม่ต้องพึ่ง Edge Function หรือ migration ใหม่):**

- [ ] **Step 1: Build รวม**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่, route list มี `/dashboard/rooms`, `/dashboard/users`, `/dashboard/settings`

- [ ] **Step 2: ทดสอบ `/dashboard/rooms` — login เป็น admin**

`npm run dev`, login ด้วย `admin@test.local`, เข้า `/dashboard/rooms`
Expected: เห็นห้องจาก seed data ครบ, สร้างห้องใหม่ได้ (ปรากฏในรายการทันทีหลัง submit), แก้ไขห้องได้ (ชื่อ/ความจุ/สถานะ/อุปกรณ์เปลี่ยนตาม), ลองลบห้องที่ไม่มี booking (ห้องที่เพิ่งสร้าง) → ลบสำเร็จ, ลองลบห้องที่มี booking (เช่นห้องของ Booking 1 จาก seed) → เห็นข้อความ error ตามที่ออกแบบ ไม่ลบ

- [ ] **Step 3: ทดสอบ `/dashboard/users` — login เป็น admin**

เข้า `/dashboard/users`
Expected: เห็น user จาก seed data ครบ 4 คน, เปลี่ยน role ของ `user@test.local` เป็น `approver` แล้วเปลี่ยนกลับได้, แก้ department ได้ (พิมพ์แล้วคลิกออกจากช่อง), กด anonymize คนที่ไม่ได้อยู่ใน chain (เช่น `user@test.local` ถ้าไม่ได้อยู่ chain) → เห็น dialog ไม่มี warning พิเศษ, กด anonymize คนที่อยู่ใน chain (เช่น `approver1@test.local`) → เห็น warning สีเหลืองเพิ่มใน dialog — **ไม่ต้องกดยืนยันจริงในขั้นตอนนี้** เพราะ 4 บัญชี test (`user@test.local`, `admin@test.local`, `approver1@test.local`, `approver2@test.local`) เป็น seed data ที่ track อื่น (A/B/C) ยังใช้ทดสอบอยู่ ถ้า anonymize จริงจะลบชื่อ/อีเมลถาวรและกระทบการทดสอบ track อื่น (RPC เรียกได้สำเร็จอยู่แล้วโดยไม่ต้องรอ migration 018 เพราะ RLS ผ่านฟังก์ชันอนุญาต Admin แก้ user คนอื่นได้ตั้งแต่ migration 011 แล้ว — migration 018 เป็นแค่การปิดช่องโหว่ EXECUTE grant สำหรับ role อื่นที่ไม่ควรเรียกได้ ไม่ใช่เงื่อนไขที่ทำให้ Admin เรียกไม่ได้) ให้ทดสอบแค่ UI flow ไปถึงจุดก่อนกด "ยืนยันลบข้อมูล" เท่านั้น

- [ ] **Step 4: ทดสอบ middleware gate**

Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/dashboard/rooms`, `/dashboard/users`, `/dashboard/settings` ตรงๆ ทาง URL
Expected: ถูก middleware redirect ไป `/home` ทันที (ครอบคลุมด้วย `/dashboard` prefix → `["admin"]` ที่มีอยู่แล้ว)

**ส่วนที่ต้อง deploy Edge Function / รัน migration ก่อนถึงจะทดสอบได้จริง:**

- [ ] **Step 5: รัน migration 018 และ deploy Edge Function**

เซสชันนี้ไม่มี Deno CLI, ไม่มี Supabase CLI, และ Supabase MCP ไม่ได้เชื่อมต่อ — **ต้องให้ผู้ใช้ทำขั้นตอนนี้เอง**:
- รัน `018_harden_anonymize_execute_grant.sql` ผ่าน Supabase Dashboard SQL Editor หรือ MCP `apply_migration`
- Reconnect Supabase MCP แล้วใช้ `deploy_edge_function` กับ `update-approval-chain` (`verify_jwt=true`) หรือติดตั้ง Supabase CLI แล้วรัน `supabase functions deploy update-approval-chain`

- [ ] **Step 6: ทดสอบ anonymize จริง (หลัง migrate สำเร็จ)**

Login `admin@test.local` เข้า `/dashboard/users` กด anonymize คนที่ไม่ได้อยู่ใน chain (สร้าง test user แยกต่างหากถ้าจำเป็น ไม่ใช้ 4 บัญชี test หลักเพื่อไม่ทำลาย seed data สำหรับ track อื่น) → ยืนยันจริง
Expected: `full_name`/`email`/`line_user_id` ของ user นั้นถูกแทนที่ด้วยค่า anonymized ตามที่ `anonymize_user_on_delete_request()` กำหนด, ประวัติการจอง/อนุมัติของ user นั้นยังคงอยู่ (JOIN แล้วเห็นชื่อ "ผู้ใช้ที่ถูกลบ")

- [ ] **Step 7: ทดสอบ `update-approval-chain` จริง (หลัง deploy สำเร็จ)**

Login `admin@test.local` เข้า `/dashboard/settings` แก้ Approval Chain ให้ 2 ขั้นตอนเป็นคนเดียวกัน → submit
Expected: ได้ validation error ภาษาไทย ไม่บันทึก
แก้ไขให้ถูกต้อง (คนละคนทั้ง 3 ขั้นตอน) → submit
Expected: บันทึกสำเร็จ แสดงข้อความยืนยัน
ทดสอบตั้ง `office_start_hour` (เช่น 18) มากกว่า `office_end_hour` (เช่น 8) → submit
Expected: ได้ validation error ภาษาไทย ไม่บันทึก

---

## Self-Review Notes

- **Spec coverage:** migration 018 → Task 2, `update-approval-chain` → Task 3, `/dashboard/rooms` → Task 4, `/dashboard/users` → Task 5, `/dashboard/settings` → Task 6, success criteria ทั้ง 5 ข้อในสเปค → Task 7 ครบ (แบ่งทดสอบได้ตอนนี้ 4 ข้อ [build, rooms, users UI flow, middleware], รอ migrate/deploy 3 ข้อ)
- **Placeholder scan:** ไม่มี TBD/TODO ที่ไม่มีเนื้อหา
- **Type consistency:** `Room`/`UserRow`/`ChainUser` types สอดคล้องกับ column names ที่ query จริงในแต่ละไฟล์ — `update-approval-chain`'s request body field names (`admin_id`, `approver1_id`, `approver2_id`, `office_start_hour`, `office_end_hour`, `holidays`) ตรงกับที่ `/dashboard/settings/page.tsx`'s `handleSubmit()` ส่งไปเป๊ะ
- **Middleware:** ไม่มี task แก้ `lib/supabase/middleware.ts` เพราะ prefix `/dashboard` → `["admin"]` ที่มีอยู่แล้วครอบคลุมทั้ง 3 route ใหม่ผ่าน longest-prefix matching (ไม่ชนกับ entry เฉพาะ `/dashboard/reports`) — ตรวจยืนยันด้วย Task 7 Step 4
- **Route-group directory bug (Track B lesson):** เพิ่มคำเตือนชัดเจนใน Task 4/5/6 ให้ตรวจ `ls "app/(app)/..."` หลังสร้างไฟล์ทุกครั้ง
- **Deno/migration verification gap:** เหมือน track อื่น — Task 3 verify ด้วย manual review เท่านั้น, migration 018 สร้างเป็นไฟล์เท่านั้นไม่ได้รันจริง, Task 7 แยกส่วนทดสอบได้ตอนนี้ vs ต้องรอ migrate/deploy ไว้ชัดเจน (โดยเฉพาะ Step 3 ที่เตือนไม่ให้ทำลาย seed data โดยไม่ตั้งใจก่อนที่ migration 018 จะรันจริง)
