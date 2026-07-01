# Password Login Testing Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the team log in to the LPRU meeting-room booking app with email/password (using 4 fixed test accounts) so business-logic testing can start before Google OAuth exists, with a hard, accidental-leak-proof off-switch for production.

**Architecture:** Standard `@supabase/ssr` Next.js App Router auth wiring (browser client, server client, middleware session-refresh helper) plus a one-off Node script that creates the 4 test accounts via the Supabase Admin API (replacing the Docker-only raw `INSERT INTO auth.users` that shipped in `014_seed_data.sql`). The password login form only renders when `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true`.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, `@supabase/ssr`, `@supabase/supabase-js`, `tsx` (script runner), Tailwind CSS v4 (already installed).

## Global Constraints

- `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` must never be set to `true` in Vercel production env vars — this plan only builds the code-side gate; setting the actual Vercel value is a deploy-time human step, out of scope here.
- `SUPABASE_SERVICE_ROLE_KEY` must never carry the `NEXT_PUBLIC_` prefix and must never be imported into any file under `app/` or `lib/supabase/client.ts` (client-bundled code) — it is read only inside `scripts/create-test-users.ts`.
- All user-facing text is formal Thai, matching CLAUDE.md's UI language rule.
- The login error message is identical for "wrong password" and "unknown email" (`อีเมลหรือรหัสผ่านไม่ถูกต้อง`) — never reveal which one was wrong.
- Do not touch the `public.users` / `system_config` / `rooms` / `bookings` / `approval_logs` sections of `supabase/migrations/014_seed_data.sql` — only the `auth.users` insert block and header comment change.
- Do not implement Google OAuth, the auth-hook Edge Function, or domain-check logic in this plan — explicitly out of scope per the spec.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/supabase/client.ts` | Browser Supabase client factory (used by `app/login/page.tsx`) |
| `lib/supabase/server.ts` | Server Component Supabase client factory, reads cookies via `next/headers` (used by `app/home/page.tsx`) |
| `lib/supabase/middleware.ts` | `updateSession(request)` — refreshes the session cookie and redirects unauthenticated requests away from protected paths |
| `middleware.ts` | Root Next.js middleware entrypoint, delegates to `lib/supabase/middleware.ts` |
| `app/login/page.tsx` | Client component: env-gated email/password form |
| `app/home/page.tsx` | Server component stub: shows logged-in user's name/email/role |
| `scripts/create-test-users.ts` | One-off script: creates the 4 fixed-UUID test accounts via Admin API |
| `supabase/migrations/014_seed_data.sql` | Edited: `auth.users` INSERT block removed, header comment updated |
| `.env.local.example` | Documents the 4 required env vars (no real secrets) |
| `.gitignore` | Small addition so `.env.local.example` isn't swallowed by the existing `.env*` ignore rule |
| `package.json` | New deps + `seed:test-users` script |

---

### Task 1: Install dependencies and set up env var template

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `.env.local.example`

**Interfaces:**
- Produces: `@supabase/ssr` and `@supabase/supabase-js` available as dependencies; `tsx` available as a devDependency for later tasks to run `.ts` scripts directly.

- [ ] **Step 1: Install the runtime and dev dependencies**

Run:
```bash
npm install @supabase/ssr @supabase/supabase-js
npm install -D tsx
```
Expected: `package.json` `dependencies` gains `@supabase/ssr` and `@supabase/supabase-js`; `devDependencies` gains `tsx`.

- [ ] **Step 2: Allow the env template file past `.gitignore`**

The repo's `.gitignore` currently has a blanket `.env*` rule (line 34) which would also swallow a committed example/template file. Add an exception right after it:

```
# env files (can opt-in for committing if needed)
.env*
!.env*.example
```

- [ ] **Step 3: Create the env var template**

Create `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true
```

- [ ] **Step 4: Verify `.env.local.example` is trackable**

Run: `git check-ignore -v .env.local.example`
Expected: command exits with status 1 and prints nothing (meaning the file is NOT ignored). If it prints a match, the `.gitignore` edit in Step 2 was not applied correctly — fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore .env.local.example
git commit -m "chore: add Supabase SSR deps and env var template for password login testing"
```

---

### Task 2: Supabase client helpers

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `process.env` (Task 1's `.env.local.example` documents these; the developer must have real values in their own `.env.local`, copied from Supabase Dashboard → Project Settings → API, for the app to function against real data).
- Produces:
  - `createClient(): SupabaseClient` from `lib/supabase/client.ts` (synchronous, browser-only)
  - `createClient(): Promise<SupabaseClient>` from `lib/supabase/server.ts` (async, Server Component-only) — used by Task 5 and by `lib/supabase/middleware.ts` (Task 3) via a separate inline instance, not this export.

- [ ] **Step 1: Create the browser client**

Create `lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create the server client**

Create `lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // เรียกจาก Server Component ล้วนๆ (ไม่มี Route Handler/Server Action
            // ห่ออยู่) จะ set cookie ไม่ได้ — middleware (Task 3) รีเฟรชแทน
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `lib/supabase/client.ts` or `lib/supabase/server.ts`. (There is no `.env.local` requirement for this check — it's static type checking only.)

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/client.ts lib/supabase/server.ts
git commit -m "feat: add Supabase browser and server client helpers"
```

---

### Task 3: Middleware — session refresh + protected route redirect

**Files:**
- Create: `lib/supabase/middleware.ts`
- Create: `middleware.ts`

**Interfaces:**
- Consumes: none from earlier tasks (constructs its own Supabase client inline — middleware needs request/response-bound cookie handling that differs from `lib/supabase/server.ts`'s Server Component cookie handling, so it is intentionally not shared).
- Produces: `updateSession(request: NextRequest): Promise<NextResponse>` from `lib/supabase/middleware.ts`, called by `middleware.ts`.

- [ ] **Step 1: Create the middleware session-refresh helper**

Create `lib/supabase/middleware.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PATHS = ["/home"];

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

  const isProtectedPath = PROTECTED_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}
```

- [ ] **Step 2: Create the root middleware entrypoint**

Create `middleware.ts` (repo root, next to `package.json`):
```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification — redirect on unauthenticated access**

You need *some* value (real or syntactically-valid placeholder) in `.env.local` for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the app to boot (copy `.env.local.example` to `.env.local` and fill in real values from Supabase Dashboard → Project Settings → API if you have them).

Run: `npm run dev`, then in a second terminal:
```bash
curl -sI http://localhost:3000/home
```
Expected: response headers include `location: /login` and status `307` (no cookie was sent, so `user` is `null`, so the protected-path check redirects). This works even before real data exists — it's testing the redirect logic, not real user data.

Stop the dev server (Ctrl+C) after checking.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/middleware.ts middleware.ts
git commit -m "feat: add middleware session refresh and protected-route redirect"
```

---

### Task 4: Login page (env-gated email/password form)

**Files:**
- Create: `app/login/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase/client.ts` (Task 2).
- Produces: route `/login`, rendering either the disabled-state message or the form depending on `process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN`.

- [ ] **Step 1: Create the login page**

Create `app/login/page.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
        <p className="text-zinc-600">
          ปิดใช้งานการเข้าสู่ระบบด้วยรหัสผ่านชั่วคราว
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 p-8"
      >
        <h1 className="text-xl font-semibold text-zinc-900">
          เข้าสู่ระบบ (ทดสอบ)
        </h1>
        <input
          type="email"
          required
          placeholder="อีเมล"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 text-zinc-900"
        />
        <input
          type="password"
          required
          placeholder="รหัสผ่าน"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 text-zinc-900"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: build succeeds (exit code 0). `/login` appears in the route list output.

- [ ] **Step 3: Manual verification — disabled state**

With `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` absent or `false` in `.env.local`:
Run: `npm run dev`, open `http://localhost:3000/login` in a browser.
Expected: page shows only the text "ปิดใช้งานการเข้าสู่ระบบด้วยรหัสผ่านชั่วคราว" — no form fields.

- [ ] **Step 4: Manual verification — enabled state**

Set `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true` in `.env.local`, restart `npm run dev`, reload `http://localhost:3000/login`.
Expected: email + password fields and a "เข้าสู่ระบบ" button are visible. (Submitting won't fully succeed until Task 6's test accounts exist — that's covered in Task 8.)

Stop the dev server after checking.

- [ ] **Step 5: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: add env-gated email/password login page"
```

---

### Task 5: Home page stub (protected, shows logged-in user)

**Files:**
- Create: `app/home/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase/server.ts` (Task 2). Queries `public.users` table columns `full_name`, `email`, `role` (per `docs/SCHEMA.md`).
- Produces: route `/home`.

- [ ] **Step 1: Create the home page**

Create `app/home/page.tsx`:
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

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: build succeeds. `/home` appears in the route list, marked dynamic (it calls `cookies()` transitively via the server client, so Next.js cannot statically prerender it).

- [ ] **Step 3: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat: add protected home page stub showing logged-in user"
```

(Full behavior — actually seeing a real name/role after logging in — is verified in Task 8 once test accounts and seed data exist.)

---

### Task 6: Test-user creation script

**Files:**
- Create: `scripts/create-test-users.ts`
- Modify: `package.json` (add `seed:test-users` script)

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from `process.env`.
- Produces: 4 `auth.users` rows on the connected Supabase project with fixed UUIDs matching the `public.users` rows already defined in `supabase/migrations/014_seed_data.sql` (`11111111-...`, `22222222-...`, `33333333-...`, `44444444-...`).

- [ ] **Step 1: Create the script**

Create `scripts/create-test-users.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "ขาด NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_USERS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    email: "user@test.local",
    full_name: "ทดสอบ ผู้ใช้งาน",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    email: "admin@test.local",
    full_name: "ทดสอบ ผู้ดูแลระบบ",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    email: "approver1@test.local",
    full_name: "ทดสอบ ผู้อนุมัติ 1",
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    email: "approver2@test.local",
    full_name: "ทดสอบ ผู้อนุมัติ 2",
  },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const testUser of TEST_USERS) {
    const { error } = await supabase.auth.admin.createUser({
      id: testUser.id,
      email: testUser.email,
      password: "test1234",
      email_confirm: true,
      user_metadata: { full_name: testUser.full_name },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already been registered")) {
        console.log(`ข้าม (มีอยู่แล้ว): ${testUser.email}`);
        skipped++;
        continue;
      }
      console.error(`สร้างไม่สำเร็จ ${testUser.email}:`, error.message);
      continue;
    }

    console.log(`สร้างสำเร็จ: ${testUser.email}`);
    created++;
  }

  console.log(`\nสรุป: สร้างใหม่ ${created} บัญชี, ข้าม ${skipped} บัญชี (มีอยู่แล้ว)`);
}

main();
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"`:
```json
"seed:test-users": "tsx scripts/create-test-users.ts"
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/create-test-users.ts package.json
git commit -m "feat: add script to create 4 test accounts via Supabase Admin API"
```

(Actually running this script against a live project — and confirming the 4 accounts appear in Supabase Dashboard → Authentication → Users — happens in Task 8, since it requires the real `SUPABASE_SERVICE_ROLE_KEY` secret.)

---

### Task 7: Fix `014_seed_data.sql` for Supabase Cloud

**Files:**
- Modify: `supabase/migrations/014_seed_data.sql:1-49`

**Interfaces:**
- Consumes: nothing new.
- Produces: a seed file whose `public.users` rows (unchanged, lines 54-59 in the current file) reference `auth.users` rows created by Task 6's script instead of a broken in-file `INSERT`.

- [ ] **Step 1: Remove the `auth.users` INSERT block and rewrite the header comment**

In `supabase/migrations/014_seed_data.sql`, replace lines 1-49 (the header comment plus the entire "Auth Users (Supabase Auth layer)" section) with:

```sql
-- ============================================================
-- 014_seed_data.sql
-- ก่อนรันไฟล์นี้ ต้องรัน scripts/create-test-users.ts ก่อนเสมอ
-- (สร้าง auth.users ผ่าน Supabase Admin API — INSERT ตรงเข้า
-- auth.users ด้วย SQL ใช้ไม่ได้กับ Supabase Cloud เพราะขาด record
-- ที่ GoTrue คาดหวังใน auth.identities และ column อื่นๆ)
-- ใช้เฉพาะสภาพแวดล้อมทดสอบเท่านั้น ห้ามรันใน production จริง
-- ============================================================
```

Everything from the current `-- Public Users (ผูกกับ auth.users)` comment onward (currently starting at line 51) stays exactly as-is — do not modify it.

- [ ] **Step 2: Confirm the diff only touches the intended range**

Run: `git diff supabase/migrations/014_seed_data.sql`
Expected: the diff shows only the header comment replacement and removal of the `INSERT INTO auth.users (...)` statement. The `INSERT INTO users (...)`, `INSERT INTO system_config (...)`, `INSERT INTO rooms (...)`, and the 4 sample-booking `INSERT` blocks show no changes (context lines only).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/014_seed_data.sql
git commit -m "fix: remove Docker-only auth.users insert from 014_seed_data.sql"
```

---

### Task 8: Full manual end-to-end verification (requires your live Supabase credentials)

This task cannot be run by an agent without your real `SUPABASE_SERVICE_ROLE_KEY` and Supabase Dashboard access — do this yourself (or hand these exact steps to whoever has the credentials).

**Files:** none (verification only).

- [ ] **Step 1: Fill in real credentials**

Copy `.env.local.example` to `.env.local` if you haven't already. Fill in:
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase Dashboard → Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — same page, "service_role" secret (never commit this)
- `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true`

- [ ] **Step 2: Create the test accounts**

Run: `npm run seed:test-users`
Expected output: `สรุป: สร้างใหม่ 4 บัญชี, ข้าม 0 บัญชี (มีอยู่แล้ว)` (or fewer "created"/more "skipped" if you've run it before — that's fine, it's idempotent).

Verify in Supabase Dashboard → Authentication → Users: 4 rows with emails ending in `@test.local`.

- [ ] **Step 3: Run the seed data migration**

Copy the full contents of `supabase/migrations/014_seed_data.sql` (as edited in Task 7) into Supabase Dashboard → SQL Editor and run it.
Expected: no errors. Verify with `SELECT full_name, email, role FROM public.users;` — 4 rows matching the test accounts.

- [ ] **Step 4: Log in as each of the 4 test users**

Run: `npm run dev`, open `http://localhost:3000/login`.
For each of `user@test.local`, `admin@test.local`, `approver1@test.local`, `approver2@test.local` (password `test1234` for all):
- Log in
- Expected: redirected to `/home`, page shows "ยินดีต้อนรับ [ชื่อที่ seed ไว้]" and the correct role (`user`, `admin`, `approver`, `approver` respectively)
- Log out between accounts: run `await (await import('@/lib/supabase/client')).createClient().auth.signOut()` in the browser console, or simply clear cookies for `localhost:3000`

- [ ] **Step 5: Verify wrong-password handling**

On `/login`, enter `admin@test.local` with an incorrect password.
Expected: red text "อีเมลหรือรหัสผ่านไม่ถูกต้อง" appears, no crash, no redirect.

- [ ] **Step 6: Verify the disabled state blocks login entirely**

Set `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=false` in `.env.local`, restart `npm run dev`, reload `/login`.
Expected: no form is rendered — only the "ปิดใช้งานการเข้าสู่ระบบด้วยรหัสผ่านชั่วคราว" message.

- [ ] **Step 7: Verify the protected-route redirect with a real session**

While logged out (no session cookie), open `http://localhost:3000/home` directly in a browser (not curl, so cookies behave normally).
Expected: immediately redirected to `/login`.

- [ ] **Step 8: Record completion**

No commit needed for this task (verification only) — but note in your own tracking that all 8 success criteria from `docs/superpowers/specs/2026-07-01-password-login-testing-design.md` passed.

---

## Self-Review Notes

- **Spec coverage:** All 6 components from the spec's "สถาปัตยกรรม / Components" section map 1:1 to Tasks 2–7. The spec's env var table maps to Task 1. The spec's 7-point success criteria list maps to Task 8 steps 2–7. The production checklist in the spec is explicitly a deploy-time human step, not a coding task — not represented as a task here, matching the spec's own framing ("ไม่ใช่โค้ด").
- **Placeholder scan:** No TBD/TODO markers; every step has literal file contents or exact commands with expected output.
- **Type consistency:** `createClient()` from `lib/supabase/client.ts` returns a `SupabaseClient` synchronously; `createClient()` from `lib/supabase/server.ts` is `async` and returns `Promise<SupabaseClient>` — Task 4 (client component) calls the sync version without `await`, Task 5 (server component) calls the async version with `await`. `lib/supabase/middleware.ts` intentionally does not reuse either — confirmed consistent with the Interfaces note in Task 3.
