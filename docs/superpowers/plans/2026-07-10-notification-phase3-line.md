# ระบบแจ้งเตือน เฟส 3 — LINE Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มช่องทาง LINE — Flex Message มีปุ่มอนุมัติ/ปฏิเสธ → postback → `processApproval()` ตัวเดียวกับเว็บ, OTP account linking, quota guard 500/เดือน — เข้ากับ orchestrator เดิม โดยไม่แก้ business logic

**Architecture:** LINE เป็นช่องทางที่ 4 ใน `notifyAndLog` (แบบ C) เพิ่ม optional param `lineApproval` ที่ `bookingNotify` ส่งเฉพาะ 2 event ที่มีปุ่ม; transport + logic แยกเป็น `lineClient.ts` (pure: signature/postback/flex + Deno fetch) และ `lineApproval.ts` (token/postback/link logic ทดสอบด้วย mockClient); `line-webhook` Edge Function รับ postback/`/link`/follow ตอบ 200 เสมอ

**Tech Stack:** Supabase Edge Functions (Deno), Next.js 16, Vitest, LINE Messaging API, crypto.subtle (HMAC)

## Global Constraints

- **notifyAndLog + helper ทุกตัวต้องไม่ throw เด็ดขาด** — LINE branch อยู่ใน try/catch, helper (loadLineUserId/countLinePushesThisMonth/maybeFireQuotaWarning) ห่อ try/catch ภายใน (invariant จากเฟส 1-2 ที่ test เดิมจับ)
- **Rule 2:** อนุมัติผ่าน LINE ต้องเรียก `processApproval()` ตัวเดียวกับเว็บ ผลลัพธ์เหมือนกันเป๊ะ — ห้ามเขียน approval logic ซ้ำ
- **Rule 5:** ทุก LINE API call log ผ่าน `logIntegration()` — แยก `payload: { kind: 'push' | 'reply' }` (reply ฟรี ไม่นับ quota)
- **Rule 6:** consume token (approval_tokens, line_link_tokens) ด้วย atomic UPDATE พร้อม WHERE guard ครบ — ห้าม SELECT-แล้ว-UPDATE เป็นเงื่อนไขตัดสิน race (SELECT ใช้เพื่อ authorization ได้ แต่ไม่ใช่ตัดสิน is_used)
- **Rule 7:** `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` ใน Edge Function Secrets เท่านั้น; `NEXT_PUBLIC_LINE_OA_ID` เป็น public id (.env) ไม่ใช่ secret
- **Rule 1:** Edge Function ใหม่ห่อ `withErrorHandling()` + throw AppError — **ยกเว้น line-webhook** ที่ business error ต้องตอบ HTTP 200 (LINE retry เมื่อ non-2xx → double-processing) เฉพาะ signature ผิดเท่านั้นที่ตอบ 401
- **Rule 9:** ข้อความ user-facing ภาษาไทยทางการ / **Rule 10:** UI ใช้ design token เท่านั้น
- **ไม่มี migration ใหม่** — `approval_tokens` (007), `line_link_tokens` + consent `line_linking` (009), `system_config.line_enabled` (022) มีครบแล้ว
- **ห้ามแก้ business logic เดิม:** `processApproval.ts`, `processCancellation.ts`, `approve-booking` และ handler เฟส 1-2 อื่นๆ **ไม่แตะ** — LINE ทำงานภายใน `notifyAndLog`/`bookingNotify`/webhook ใหม่
- **ขอบเขต LINE = เฉพาะ 2 event ปุ่ม** (`booking_submitted`, `booking_step_approved`) — **ตัด `cancellation_requested` ออกจาก LINE** (ยืนยันกับผู้ใช้: ประหยัด quota, Admin ได้ 3 ช่องอื่นครบ) — override matrix ของ spec แม่
- **PROJECT_ID** = `sbmbdngrutkjugsmmfxa`
- Spec: `docs/superpowers/specs/2026-07-10-line-integration-design.md`

---

## File Structure

**สร้างใหม่:**
- `supabase/functions/_shared/lineClient.ts` — `verifyLineSignature`, `parsePostbackData`, `buildApprovalFlex` (pure, testable) + `pushFlex`, `replyText` (Deno fetch, ไม่ unit-test)
- `supabase/functions/_shared/lineClient.test.ts`
- `supabase/functions/_shared/lineApproval.ts` — `createOrReuseApprovalToken`, `handleApprovalPostback`, `handleLinkCommand`
- `supabase/functions/_shared/lineApproval.test.ts`
- `supabase/functions/line-webhook/index.ts` — verify_jwt=false
- `supabase/functions/generate-line-otp/index.ts` — verify_jwt=true
- `app/(app)/profile/` — ไม่มีไฟล์ใหม่ (แก้ page.tsx เดิม)

**แก้ไข:**
- `supabase/functions/_shared/mockClient.ts` — เพิ่ม `.gte()`
- `supabase/functions/_shared/notify.ts` — line_quota_warning event, EventOverride.line, lineEnabled config, NotifyParams.lineApproval, LINE channel + quota guard
- `supabase/functions/_shared/notify.test.ts` — test LINE gating/quota
- `supabase/functions/_shared/bookingNotify.ts` — ส่ง lineApproval ใน 2 event
- `supabase/functions/_shared/bookingNotify.test.ts`
- `app/(app)/profile/page.tsx` — การ์ด LINE จริง (OTP + สถานะ + ยกเลิก)
- `supabase/config.toml` — 2 function entries

**Secrets/env:** `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` (Edge Secrets), `NEXT_PUBLIC_LINE_OA_ID` (.env public)

---

## Task 1: `lineClient.ts` — signature / postback / flex (pure) + transport

**Files:**
- Create: `supabase/functions/_shared/lineClient.ts`
- Test: `supabase/functions/_shared/lineClient.test.ts`

**Interfaces:**
- Produces:
  - `verifyLineSignature(rawBody: string, signature: string, channelSecret: string): Promise<boolean>`
  - `parsePostbackData(data: string): { action: "approve" | "reject"; token: string } | null`
  - `buildApprovalFlex(vars: { booker: string; room: string; date: string; time: string }, tokenId: string, altText: string): object`
  - `pushFlex(lineUserId: string, flexMessage: object): Promise<void>` (Deno; ไม่ unit-test)
  - `replyText(replyToken: string, text: string): Promise<void>` (Deno; ไม่ unit-test)

- [ ] **Step 1: เขียน failing test**

สร้าง `supabase/functions/_shared/lineClient.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { verifyLineSignature, parsePostbackData, buildApprovalFlex } from "./lineClient.ts";

// helper: สร้างลายเซ็นที่ถูกต้องด้วยวิธีเดียวกับ implementation (HMAC-SHA256 → base64)
async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

describe("verifyLineSignature", () => {
  it("ลายเซ็นถูกต้อง → true", async () => {
    const body = '{"events":[]}';
    const secret = "test-secret";
    const sig = await sign(body, secret);
    expect(await verifyLineSignature(body, sig, secret)).toBe(true);
  });
  it("ลายเซ็นผิด → false", async () => {
    expect(await verifyLineSignature('{"events":[]}', "bad-signature", "test-secret")).toBe(false);
  });
  it("body ถูกแก้ (ลายเซ็นของ body อื่น) → false", async () => {
    const secret = "test-secret";
    const sig = await sign('{"events":[]}', secret);
    expect(await verifyLineSignature('{"events":[{"x":1}]}', sig, secret)).toBe(false);
  });
});

describe("parsePostbackData", () => {
  it("approve", () => {
    expect(parsePostbackData("a=approve&t=abc-123")).toEqual({ action: "approve", token: "abc-123" });
  });
  it("reject", () => {
    expect(parsePostbackData("a=reject&t=xyz")).toEqual({ action: "reject", token: "xyz" });
  });
  it("action ไม่รู้จัก → null", () => {
    expect(parsePostbackData("a=delete&t=abc")).toBeNull();
  });
  it("ไม่มี token → null", () => {
    expect(parsePostbackData("a=approve")).toBeNull();
  });
});

describe("buildApprovalFlex", () => {
  const vars = { booker: "สมชาย", room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น." };
  it("altText ตรงกับที่ส่งมา + เป็น flex", () => {
    const flex = buildApprovalFlex(vars, "tok-1", "🔔 มีคำขอจองห้องประชุมใหม่") as {
      type: string; altText: string;
    };
    expect(flex.type).toBe("flex");
    expect(flex.altText).toBe("🔔 มีคำขอจองห้องประชุมใหม่");
  });
  it("ฝัง postback data ของทั้งปุ่มอนุมัติและปฏิเสธพร้อม token", () => {
    const json = JSON.stringify(buildApprovalFlex(vars, "tok-1", "x"));
    expect(json).toContain("a=approve&t=tok-1");
    expect(json).toContain("a=reject&t=tok-1");
  });
  it("แสดงรายละเอียดคำขอในการ์ด", () => {
    const json = JSON.stringify(buildApprovalFlex(vars, "tok-1", "x"));
    expect(json).toContain("สมชาย");
    expect(json).toContain("ห้อง A");
    expect(json).toContain("09:00–12:00 น.");
  });
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm run test -- lineClient`
Expected: FAIL — module ไม่พบ

- [ ] **Step 3: implement `lineClient.ts`**

สร้าง `supabase/functions/_shared/lineClient.ts`:

```typescript
const LINE_API = "https://api.line.me/v2/bot/message";

// ── Signature (HMAC-SHA256 ของ raw body → base64) — testable ──
// constant-time compare กัน timing attack บน base64 string
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyLineSignature(
  rawBody: string,
  signature: string,
  channelSecret: string
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(channelSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    return safeEqual(expected, signature);
  } catch {
    return false;
  }
}

// ── Postback data — testable ──
export function parsePostbackData(
  data: string
): { action: "approve" | "reject"; token: string } | null {
  const params = new URLSearchParams(data);
  const action = params.get("a");
  const token = params.get("t");
  if ((action !== "approve" && action !== "reject") || !token) return null;
  return { action, token };
}

// ── Flex card — testable ──
export function buildApprovalFlex(
  vars: { booker: string; room: string; date: string; time: string },
  tokenId: string,
  altText: string
): object {
  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: altText, weight: "bold", size: "md", wrap: true },
          { type: "text", text: `ผู้ขอ: ${vars.booker}`, size: "sm", color: "#555555", wrap: true },
          { type: "text", text: `ห้อง: ${vars.room}`, size: "sm", color: "#555555", wrap: true },
          { type: "text", text: `วันที่: ${vars.date}`, size: "sm", color: "#555555", wrap: true },
          { type: "text", text: `เวลา: ${vars.time}`, size: "sm", color: "#555555", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#0d8a5f",
            action: { type: "postback", label: "อนุมัติ", data: `a=approve&t=${tokenId}`, displayText: "อนุมัติ" },
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "postback", label: "ปฏิเสธ", data: `a=reject&t=${tokenId}`, displayText: "ปฏิเสธ" },
          },
        ],
      },
    },
  };
}

// ── Transport (Deno fetch — ไม่ unit-test, ทดสอบตอน live) ──
function accessToken(): string {
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN ไม่ได้ตั้งค่า");
  return token;
}

export async function pushFlex(lineUserId: string, flexMessage: object): Promise<void> {
  const res = await fetch(`${LINE_API}/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken()}`,
    },
    body: JSON.stringify({ to: lineUserId, messages: [flexMessage] }),
  });
  if (!res.ok) {
    throw new Error(`LINE push failed: ${res.status} ${await res.text()}`);
  }
}

export async function replyText(replyToken: string, text: string): Promise<void> {
  const res = await fetch(`${LINE_API}/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken()}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    throw new Error(`LINE reply failed: ${res.status} ${await res.text()}`);
  }
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npm run test -- lineClient`
Expected: PASS ทุก case

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/lineClient.ts supabase/functions/_shared/lineClient.test.ts
git commit -m "feat(line): lineClient — signature verify, postback parse, approval Flex + transport"
```

---

## Task 2: `lineApproval.ts` — token / postback / link logic

**Files:**
- Create: `supabase/functions/_shared/lineApproval.ts`
- Test: `supabase/functions/_shared/lineApproval.test.ts`

**Interfaces:**
- Consumes: `processApproval` + `ApprovalAction` (จาก `./processApproval.ts`), `notifyApprovalOutcome` (จาก `./bookingNotify.ts`), `ConflictError` (จาก `./errors.ts`)
- Produces:
  - `createOrReuseApprovalToken(client, params: { bookingId: string; step: number; approverId: string }): Promise<string | null>`
  - `interface ApprovalPostbackDeps { processApproval: typeof processApproval; notifyApprovalOutcome: typeof notifyApprovalOutcome }`
  - `handleApprovalPostback(client, params: { tokenId: string; action: "approve" | "reject"; lineUserId: string }, deps?: ApprovalPostbackDeps): Promise<{ replyText: string }>`
  - `handleLinkCommand(client, params: { otp: string; lineUserId: string }): Promise<{ replyText: string }>`

- [ ] **Step 1: เขียน failing test**

สร้าง `supabase/functions/_shared/lineApproval.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import {
  createOrReuseApprovalToken,
  handleApprovalPostback,
  handleLinkCommand,
} from "./lineApproval.ts";
import { makeClient, type DbCallContext } from "./mockClient.ts";
import { ConflictError } from "./errors.ts";

describe("createOrReuseApprovalToken", () => {
  it("insert สำเร็จ → คืน token id ใหม่", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "insert")
        return { data: { id: "new-token" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const id = await createOrReuseApprovalToken(client as never, {
      bookingId: "b1", step: 1, approverId: "a1",
    });
    expect(id).toBe("new-token");
  });

  it("ชน 23505 (มี active token อยู่แล้ว) → SELECT ตัวเดิมมา reuse", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "insert")
        return { data: null, error: { code: "23505", message: "dup" } };
      if (ctx.table === "approval_tokens" && ctx.op === "select")
        return { data: { id: "existing-token" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const id = await createOrReuseApprovalToken(client as never, {
      bookingId: "b1", step: 1, approverId: "a1",
    });
    expect(id).toBe("existing-token");
  });

  it("error อื่น → null (ข้าม LINE เงียบ)", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "insert")
        return { data: null, error: { code: "XXXXX", message: "boom" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const id = await createOrReuseApprovalToken(client as never, {
      bookingId: "b1", step: 1, approverId: "a1",
    });
    expect(id).toBeNull();
  });
});

describe("handleApprovalPostback", () => {
  const base = { tokenId: "tok-1", action: "approve" as const, lineUserId: "U_line_1" };

  function depsSpy() {
    return {
      processApproval: vi.fn().mockResolvedValue({
        bookingId: "b1", step: 1, action: "approved", currentStep: 1, finalStatus: "pending",
      }),
      notifyApprovalOutcome: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("token ไม่พบ → reply แจ้ง ไม่เรียก processApproval", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "select")
        return { data: null, error: { message: "not found" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const deps = depsSpy();
    const r = await handleApprovalPostback(client as never, base, deps);
    expect(r.replyText).toContain("ไม่พบ");
    expect(deps.processApproval).not.toHaveBeenCalled();
  });

  it("identity ไม่ตรง (line_user_id ต่าง) → reply generic ไม่ consume ไม่ processApproval", async () => {
    const calls: DbCallContext[] = [];
    const { client } = makeClient((ctx) => {
      calls.push(ctx);
      if (ctx.table === "approval_tokens" && ctx.op === "select")
        return { data: { booking_id: "b1", step: 1, approver_id: "a1", is_used: false } };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: { line_user_id: "U_someone_else" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const deps = depsSpy();
    const r = await handleApprovalPostback(client as never, base, deps);
    expect(r.replyText).toContain("ตรวจสอบ");
    expect(deps.processApproval).not.toHaveBeenCalled();
    // ต้องไม่มี UPDATE (ไม่เผา token)
    expect(calls.find((c) => c.table === "approval_tokens" && c.op === "update")).toBeUndefined();
  });

  it("atomic consume คืนศูนย์แถว (ใช้แล้ว/หมดอายุ) → reply แจ้ง ไม่ processApproval", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "select")
        return { data: { booking_id: "b1", step: 1, approver_id: "a1", is_used: false } };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: { line_user_id: "U_line_1" } };
      if (ctx.table === "approval_tokens" && ctx.op === "update") return { data: [] };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const deps = depsSpy();
    const r = await handleApprovalPostback(client as never, base, deps);
    expect(r.replyText).toContain("ดำเนินการไปแล้ว");
    expect(deps.processApproval).not.toHaveBeenCalled();
  });

  it("สำเร็จ → processApproval ถูกเรียกด้วย params จาก token + reply อนุมัติ + notifyApprovalOutcome", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "select")
        return { data: { booking_id: "b1", step: 1, approver_id: "a1", is_used: false } };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: { line_user_id: "U_line_1" } };
      if (ctx.table === "approval_tokens" && ctx.op === "update") return { data: [{ id: "tok-1" }] };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const deps = depsSpy();
    const r = await handleApprovalPostback(client as never, base, deps);
    expect(deps.processApproval).toHaveBeenCalledWith(client, {
      bookingId: "b1", step: 1, approverId: "a1", action: "approved",
    });
    expect(deps.notifyApprovalOutcome).toHaveBeenCalledTimes(1);
    expect(r.replyText).toContain("อนุมัติเรียบร้อย");
  });

  it("processApproval throw ConflictError (เว็บตัดสินไปก่อน) → reply ดำเนินการไปแล้ว", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "select")
        return { data: { booking_id: "b1", step: 1, approver_id: "a1", is_used: false } };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: { line_user_id: "U_line_1" } };
      if (ctx.table === "approval_tokens" && ctx.op === "update") return { data: [{ id: "tok-1" }] };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const deps = {
      processApproval: vi.fn().mockRejectedValue(new ConflictError("มีการดำเนินการนี้ไปแล้ว")),
      notifyApprovalOutcome: vi.fn(),
    };
    const r = await handleApprovalPostback(client as never, base, deps);
    expect(r.replyText).toContain("ดำเนินการไปแล้ว");
  });
});

describe("handleLinkCommand", () => {
  it("OTP ถูกต้อง → ผูก line_user_id + consent + reply สำเร็จ", async () => {
    const calls: DbCallContext[] = [];
    const { client } = makeClient((ctx) => {
      calls.push(ctx);
      if (ctx.table === "line_link_tokens" && ctx.op === "update") return { data: [{ user_id: "u1" }] };
      if (ctx.table === "users" && ctx.op === "update") return {};
      if (ctx.table === "consent_records" && ctx.op === "insert") return {};
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const r = await handleLinkCommand(client as never, { otp: "123456", lineUserId: "U_line_1" });
    expect(r.replyText).toContain("สำเร็จ");
    const usersUpdate = calls.find((c) => c.table === "users" && c.op === "update");
    expect(usersUpdate?.payload).toMatchObject({ line_user_id: "U_line_1" });
    const consent = calls.find((c) => c.table === "consent_records" && c.op === "insert");
    expect(consent?.payload).toMatchObject({ user_id: "u1", consent_type: "line_linking" });
  });

  it("OTP ผิด/หมดอายุ (consume ศูนย์แถว) → reply แจ้งขอรหัสใหม่ ไม่แตะ users", async () => {
    const calls: DbCallContext[] = [];
    const { client } = makeClient((ctx) => {
      calls.push(ctx);
      if (ctx.table === "line_link_tokens" && ctx.op === "update") return { data: [] };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const r = await handleLinkCommand(client as never, { otp: "999999", lineUserId: "U_line_1" });
    expect(r.replyText).toContain("รหัสไม่ถูกต้อง");
    expect(calls.find((c) => c.table === "users")).toBeUndefined();
  });

  it("LINE นี้ผูกบัญชีอื่นแล้ว (23505) → reply แจ้ง", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "line_link_tokens" && ctx.op === "update") return { data: [{ user_id: "u1" }] };
      if (ctx.table === "users" && ctx.op === "update")
        return { error: { code: "23505", message: "dup" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const r = await handleLinkCommand(client as never, { otp: "123456", lineUserId: "U_line_1" });
    expect(r.replyText).toContain("ถูกเชื่อมกับผู้ใช้อื่น");
  });
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm run test -- lineApproval`
Expected: FAIL — module ไม่พบ

- [ ] **Step 3: implement `lineApproval.ts`**

สร้าง `supabase/functions/_shared/lineApproval.ts`:

```typescript
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { processApproval } from "./processApproval.ts";
import { notifyApprovalOutcome } from "./bookingNotify.ts";
import { ConflictError } from "./errors.ts";

// สร้าง approval_token — ชน unique partial index (23505) = มี active token
// ของ step นี้อยู่แล้ว → ดึงตัวเดิมมา reuse; error อื่น → null (ข้าม LINE เงียบ)
export async function createOrReuseApprovalToken(
  client: SupabaseClient,
  params: { bookingId: string; step: number; approverId: string }
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from("approval_tokens")
      .insert({ booking_id: params.bookingId, step: params.step, approver_id: params.approverId })
      .select("id")
      .single();

    if (!error && data) return (data as { id: string }).id;

    if (error && (error as { code?: string }).code === "23505") {
      const { data: existing } = await client
        .from("approval_tokens")
        .select("id")
        .eq("booking_id", params.bookingId)
        .eq("step", params.step)
        .eq("is_used", false)
        .single();
      return existing ? (existing as { id: string }).id : null;
    }

    return null;
  } catch (err) {
    console.error("[createOrReuseApprovalToken]", err);
    return null;
  }
}

export interface ApprovalPostbackDeps {
  processApproval: typeof processApproval;
  notifyApprovalOutcome: typeof notifyApprovalOutcome;
}

const DEFAULT_DEPS: ApprovalPostbackDeps = { processApproval, notifyApprovalOutcome };

export async function handleApprovalPostback(
  client: SupabaseClient,
  params: { tokenId: string; action: "approve" | "reject"; lineUserId: string },
  deps: ApprovalPostbackDeps = DEFAULT_DEPS
): Promise<{ replyText: string }> {
  // 1. อ่าน token (read-only) — ยังไม่แตะ is_used
  const { data: tok, error: tokErr } = await client
    .from("approval_tokens")
    .select("booking_id, step, approver_id, is_used")
    .eq("id", params.tokenId)
    .single();
  if (tokErr || !tok) {
    return { replyText: "ไม่พบคำขอนี้ อาจถูกยกเลิกหรือหมดอายุแล้ว" };
  }
  const token = tok as { booking_id: string; step: number; approver_id: string };

  // 2. identity check ก่อน consume — คนผิดกดต้องไม่เผา token ของ approver ตัวจริง
  const { data: approver } = await client
    .from("users")
    .select("line_user_id")
    .eq("id", token.approver_id)
    .single();
  if (!approver || (approver as { line_user_id: string | null }).line_user_id !== params.lineUserId) {
    return { replyText: "ไม่สามารถดำเนินการได้ กรุณาตรวจสอบที่หน้าเว็บ" };
  }

  // 3. atomic consume (Rule 6) — guard ทุกตัวใน WHERE ของ UPDATE เดียว
  const { data: consumed } = await client
    .from("approval_tokens")
    .update({ is_used: true })
    .eq("id", params.tokenId)
    .eq("is_used", false)
    .gt("expires_at", new Date().toISOString())
    .select("id");
  if (!consumed || (consumed as unknown[]).length === 0) {
    return { replyText: "คำขอนี้ถูกดำเนินการไปแล้วหรือลิงก์หมดอายุ กรุณาตรวจสอบที่หน้าเว็บ" };
  }

  // 4. processApproval ตัวเดียวกับเว็บ (Rule 2)
  try {
    const result = await deps.processApproval(client, {
      bookingId: token.booking_id,
      step: token.step,
      approverId: token.approver_id,
      action: params.action === "approve" ? "approved" : "rejected",
    });
    await deps.notifyApprovalOutcome(client, token.booking_id, result);
    return {
      replyText: params.action === "approve" ? "✅ อนุมัติเรียบร้อยแล้ว" : "❌ ปฏิเสธเรียบร้อยแล้ว",
    };
  } catch (err) {
    if (err instanceof ConflictError) {
      return { replyText: "คำขอนี้ถูกดำเนินการไปแล้ว กรุณาตรวจสอบที่หน้าเว็บ" };
    }
    console.error("[handleApprovalPostback] processApproval", err);
    return { replyText: "เกิดข้อผิดพลาด กรุณาตรวจสอบที่หน้าเว็บ" };
  }
}

// /link XXXXXX — atomic consume OTP → ผูก line_user_id + consent
export async function handleLinkCommand(
  client: SupabaseClient,
  params: { otp: string; lineUserId: string }
): Promise<{ replyText: string }> {
  const { data: consumed } = await client
    .from("line_link_tokens")
    .update({ is_used: true })
    .eq("otp", params.otp)
    .eq("is_used", false)
    .gt("expires_at", new Date().toISOString())
    .select("user_id");
  if (!consumed || (consumed as unknown[]).length === 0) {
    return { replyText: "รหัสไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่จากหน้าโปรไฟล์" };
  }
  const userId = (consumed as { user_id: string }[])[0].user_id;

  const { error: updErr } = await client
    .from("users")
    .update({ line_user_id: params.lineUserId })
    .eq("id", userId);
  if (updErr) {
    if ((updErr as { code?: string }).code === "23505") {
      return { replyText: "บัญชี LINE นี้ถูกเชื่อมกับผู้ใช้อื่นแล้ว" };
    }
    return { replyText: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
  }

  await client.from("consent_records").insert({ user_id: userId, consent_type: "line_linking" });
  return { replyText: "✅ เชื่อมต่อบัญชี LINE สำเร็จ" };
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npm run test -- lineApproval`
Expected: PASS ทุก case

- [ ] **Step 5: รัน full suite**

Run: `npm run test`
Expected: PASS ทั้งหมด (ไม่กระทบไฟล์อื่น)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/lineApproval.ts supabase/functions/_shared/lineApproval.test.ts
git commit -m "feat(line): lineApproval — token create/reuse, postback handler, /link handler"
```

---

## Task 3: notify.ts registry + config groundwork + mockClient.gte()

**Files:**
- Modify: `supabase/functions/_shared/mockClient.ts`
- Modify: `supabase/functions/_shared/notify.ts`
- Modify: `supabase/functions/_shared/notify.test.ts`

**Interfaces:**
- Produces:
  - `EventKey` เพิ่ม `"line_quota_warning"` (ตัวที่ 9)
  - `EventOverride` เพิ่ม `line?: boolean`
  - `NotifyParams` เพิ่ม `lineApproval?: { bookingId: string; step: number; approverId: string }`
  - `NotificationConfig` เพิ่ม `lineEnabled: boolean` (ภายใน — ไม่ export)
  - `mockClient` builder เพิ่ม `.gte(key, value)`

- [ ] **Step 1: เพิ่ม `.gte()` เข้า mockClient**

แก้ `supabase/functions/_shared/mockClient.ts` — เพิ่มต่อจาก `gt` (ที่เพิ่มในเฟส 2):

```typescript
      gt(key: string, value: unknown) {
        state.filters.push([key, value]);
        return builder;
      },
      gte(key: string, value: unknown) {
        state.filters.push([key, value]);
        return builder;
      },
```

- [ ] **Step 2: เขียน failing test สำหรับ registry + config**

เพิ่มต่อท้าย `supabase/functions/_shared/notify.test.ts`:

```typescript
describe("line_quota_warning event (registry)", () => {
  it("buildNotification มี default title/body/link", () => {
    const n = buildNotification("line_quota_warning", { sent: "410" });
    expect(n.title).toBe("⚠️ โควตา LINE ใกล้เต็ม");
    expect(n.body).toBe("เดือนนี้ส่งไปแล้ว 410/500 ข้อความ เมื่อครบโควตาระบบจะหยุดส่งทาง LINE อัตโนมัติ");
    expect(n.link).toBe("/dashboard/integrations");
  });
});

describe("notifyAndLog — line_enabled config", () => {
  const vars = { booker: "สมชาย", room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น." };

  it("line_enabled=false (default) + มี lineApproval → ไม่มี logIntegration service=line", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config")
        return { data: { welpru_enabled: false, discord_enabled: false, line_enabled: false, notification_settings: {} } };
      if (ctx.table === "notifications" && ctx.op === "insert") return {};
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await notifyAndLog(client as never, {
      eventKey: "booking_submitted",
      recipients: [{ userId: "adm1" }],
      variables: vars,
      lineApproval: { bookingId: "b1", step: 1, approverId: "adm1" },
    });
    const lineLogs = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.payload?.service === "line"
    );
    expect(lineLogs).toHaveLength(0);
  });
});
```

- [ ] **Step 3: รัน test ให้ fail**

Run: `npm run test -- notify`
Expected: FAIL — `line_quota_warning` ยังไม่มีใน EventKey/EVENT_DEFAULTS, `notify.ts` ยังไม่รับ `line_enabled`/`lineApproval`

- [ ] **Step 4: implement — แก้ `notify.ts`**

(4a) เพิ่ม `"line_quota_warning"` เข้า `EventKey` union (ต่อจาก `"booking_cancelled"`):
```typescript
export type EventKey =
  | "booking_submitted"
  | "booking_step_approved"
  | "booking_approved"
  | "booking_rejected"
  | "cancellation_requested"
  | "cancellation_approved"
  | "cancellation_denied"
  | "booking_cancelled"
  | "line_quota_warning";
```

(4b) เพิ่ม entry ใน `EVENT_DEFAULTS` (ต่อจาก `booking_cancelled`):
```typescript
  line_quota_warning: {
    title: "⚠️ โควตา LINE ใกล้เต็ม",
    body: "เดือนนี้ส่งไปแล้ว {sent}/500 ข้อความ เมื่อครบโควตาระบบจะหยุดส่งทาง LINE อัตโนมัติ",
    link: "/dashboard/integrations",
  },
```

(4c) เพิ่ม entry ใน `DISCORD_MESSAGE_TEMPLATES` (ต่อจาก `booking_cancelled`):
```typescript
  line_quota_warning: "⚠️ LINE quota: {sent}/500",
```

(4d) เพิ่ม `line?` เข้า `EventOverride`:
```typescript
export interface EventOverride {
  discord?: boolean;
  welpru?: boolean;
  line?: boolean;
  title?: string | null;
  body?: string | null;
}
```

(4e) เพิ่ม `lineApproval?` เข้า `NotifyParams`:
```typescript
export interface NotifyParams {
  eventKey: EventKey;
  recipients: NotifyRecipient[];
  variables: Record<string, string>;
  lineApproval?: { bookingId: string; step: number; approverId: string };
}
```

(4f) เพิ่ม `lineEnabled` เข้า `NotificationConfig` + `CONFIG_DISABLED`:
```typescript
interface NotificationConfig {
  welpruEnabled: boolean;
  discordEnabled: boolean;
  lineEnabled: boolean;
  settings: Record<string, EventOverride>;
}

const CONFIG_DISABLED: NotificationConfig = {
  welpruEnabled: false,
  discordEnabled: false,
  lineEnabled: false,
  settings: {},
};
```

(4g) แก้ `loadNotificationConfig` ให้ select + map `line_enabled`:
```typescript
async function loadNotificationConfig(client: SupabaseClient): Promise<NotificationConfig> {
  try {
    const { data, error } = await client
      .from("system_config")
      .select("welpru_enabled, discord_enabled, line_enabled, notification_settings")
      .single();
    if (error || !data) return CONFIG_DISABLED;
    const row = data as {
      welpru_enabled: boolean | null;
      discord_enabled: boolean | null;
      line_enabled: boolean | null;
      notification_settings: Record<string, EventOverride> | null;
    };
    return {
      welpruEnabled: row.welpru_enabled ?? false,
      discordEnabled: row.discord_enabled ?? false,
      lineEnabled: row.line_enabled ?? false,
      settings: row.notification_settings ?? {},
    };
  } catch (err) {
    console.error("[notifyAndLog] loadNotificationConfig ล้มเหลว:", err);
    return CONFIG_DISABLED;
  }
}
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `npm run test -- notify`
Expected: PASS ทั้งหมด (test เดิม + 2 test ใหม่) — LINE channel ยังไม่มี ดังนั้น line_enabled=false test ผ่านเพราะไม่มี branch ส่ง LINE เลย (ยังไม่ถึง Task 4)

- [ ] **Step 6: รัน full suite**

Run: `npm run test`
Expected: PASS ทั้งหมด

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/mockClient.ts supabase/functions/_shared/notify.ts supabase/functions/_shared/notify.test.ts
git commit -m "feat(line): notify registry — line_quota_warning event, line config/override/param, mockClient.gte"
```

---

## Task 4: notify.ts LINE channel + quota guard

**Files:**
- Modify: `supabase/functions/_shared/notify.ts`
- Modify: `supabase/functions/_shared/notify.test.ts`

**Interfaces:**
- Consumes: `pushFlex`, `buildApprovalFlex` (Task 1), `createOrReuseApprovalToken` (Task 2), `logIntegration` (existing)
- Produces: LINE channel ใน `notifyAndLog` (ช่องทางที่ 4)

- [ ] **Step 1: เขียน failing test**

เพิ่มต่อท้าย `supabase/functions/_shared/notify.test.ts`:

```typescript
describe("notifyAndLog — LINE channel", () => {
  const vars = { booker: "สมชาย", room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น." };
  const lineApproval = { bookingId: "b1", step: 1, approverId: "adm1" };

  // responder มาตรฐาน: config เปิด line, approver มี line_user_id, quota นับได้, token สร้างได้
  function lineResponder(overrides: {
    lineEnabled?: boolean;
    lineUserId?: string | null;
    pushCount?: number;
    warnCount?: number;
    onInsert?: (ctx: DbCallContext) => void;
  } = {}) {
    return (ctx: DbCallContext) => {
      if (ctx.table === "system_config" && ctx.op === "select") {
        // แยกระหว่าง loadNotificationConfig (มี welpru_enabled) กับ maybeFireQuotaWarning (admin_id)
        return {
          data: {
            welpru_enabled: false,
            discord_enabled: false,
            line_enabled: overrides.lineEnabled ?? true,
            notification_settings: {},
            admin_id: "adm1",
          },
        };
      }
      if (ctx.table === "users" && ctx.op === "select")
        return { data: { line_user_id: overrides.lineUserId ?? "U_line_1", staff_id: null, welpru_verified_at: null } };
      if (ctx.table === "integration_health" && ctx.op === "select")
        return { count: overrides.pushCount ?? 0 }; // quota count
      if (ctx.table === "notifications" && ctx.op === "select")
        return { count: overrides.warnCount ?? 0 }; // dedupe count
      if (ctx.table === "approval_tokens" && ctx.op === "insert")
        return { data: { id: "tok-1" } };
      if (ctx.op === "insert") {
        overrides.onInsert?.(ctx);
        return {};
      }
      return {};
    };
  }

  it("line_enabled + lineApproval + มี line_user_id + quota ว่าง → log service=line push success", async () => {
    const { client, calls } = makeClient(lineResponder());
    await notifyAndLog(client as never, {
      eventKey: "booking_submitted", recipients: [{ userId: "adm1" }], variables: vars, lineApproval,
    });
    const lineLog = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.op === "insert" && c.payload?.service === "line"
    );
    expect(lineLog).toHaveLength(1);
    expect(lineLog[0].payload).toMatchObject({ status: "failed", payload: { kind: "push" } });
    // status failed เพราะ pushFlex เรียก Deno.env (ไม่มีใน test) → throw → caught → log failed
  });

  it("ไม่มี lineApproval → ข้าม LINE (ไม่มี token insert)", async () => {
    const { client, calls } = makeClient(lineResponder());
    await notifyAndLog(client as never, {
      eventKey: "booking_approved", recipients: [{ userId: "req1" }], variables: vars,
    });
    expect(calls.filter((c: DbCallContext) => c.table === "approval_tokens")).toHaveLength(0);
  });

  it("approver ไม่มี line_user_id → ข้าม LINE เงียบ", async () => {
    const { client, calls } = makeClient(lineResponder({ lineUserId: null }));
    await notifyAndLog(client as never, {
      eventKey: "booking_submitted", recipients: [{ userId: "adm1" }], variables: vars, lineApproval,
    });
    expect(calls.filter((c: DbCallContext) => c.table === "approval_tokens")).toHaveLength(0);
  });

  it("quota ≥500 → ข้าม LINE, log service=internal skipped", async () => {
    const { client, calls } = makeClient(lineResponder({ pushCount: 500 }));
    await notifyAndLog(client as never, {
      eventKey: "booking_submitted", recipients: [{ userId: "adm1" }], variables: vars, lineApproval,
    });
    expect(calls.filter((c: DbCallContext) => c.table === "approval_tokens")).toHaveLength(0);
    const skip = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.op === "insert" && c.payload?.service === "internal"
    );
    expect(skip).toHaveLength(1);
    expect(skip[0].payload).toMatchObject({ payload: { skipped: "line_quota" } });
  });

  it("quota แตะ 400 (sent=399) ครั้งแรก → ยิง line_quota_warning ให้ admin (in-app)", async () => {
    const { client, calls } = makeClient(lineResponder({ pushCount: 399, warnCount: 0 }));
    await notifyAndLog(client as never, {
      eventKey: "booking_submitted", recipients: [{ userId: "adm1" }], variables: vars, lineApproval,
    });
    const warnNotif = calls.filter(
      (c: DbCallContext) =>
        c.table === "notifications" && c.op === "insert" && c.payload?.event_key === "line_quota_warning"
    );
    expect(warnNotif).toHaveLength(1);
    expect(warnNotif[0].payload?.user_id).toBe("adm1");
  });

  it("quota แตะ 400 แต่เดือนนี้เตือนไปแล้ว (dedupe) → ไม่ยิงซ้ำ", async () => {
    const { client, calls } = makeClient(lineResponder({ pushCount: 399, warnCount: 1 }));
    await notifyAndLog(client as never, {
      eventKey: "booking_submitted", recipients: [{ userId: "adm1" }], variables: vars, lineApproval,
    });
    const warnNotif = calls.filter(
      (c: DbCallContext) =>
        c.table === "notifications" && c.op === "insert" && c.payload?.event_key === "line_quota_warning"
    );
    expect(warnNotif).toHaveLength(0);
  });

  it("never-throw: ทุก query ใน LINE path พังก็ไม่ throw", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "system_config") return { data: { line_enabled: true } };
      throw new Error("db down");
    });
    await expect(
      notifyAndLog(client as never, {
        eventKey: "booking_submitted", recipients: [{ userId: "adm1" }], variables: vars, lineApproval,
      })
    ).resolves.toBeUndefined();
  });
});
```

**หมายเหตุ test:** `pushFlex` เรียก `Deno.env.get` ซึ่งไม่มีใน Vitest → throw ReferenceError → ถูก catch ใน LINE branch → log `failed` (เหมือน Discord/WeLPRU ในเฟส 2) — จึง assert `status: "failed"` ในเคสแรก การทดสอบ push success จริงทำตอน live

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm run test -- notify`
Expected: FAIL — LINE channel ยังไม่มี (`approval_tokens`/line log ไม่เกิด)

- [ ] **Step 3: implement — แก้ `notify.ts`**

(3a) เพิ่ม import ที่หัวไฟล์ (ต่อจาก import เดิม):
```typescript
import { pushFlex, buildApprovalFlex } from "./lineClient.ts";
import { createOrReuseApprovalToken } from "./lineApproval.ts";
```

(3b) แก้ WeLPRU branch — กัน `line_quota_warning` ไม่ให้ยิง WeLPRU (matrix: in-app+Discord เท่านั้น) เปลี่ยนบรรทัดเงื่อนไข:
```typescript
  // 3. WeLPRU (เฉพาะผู้รับที่ verified แล้ว — ยกเว้น line_quota_warning ที่ไป in-app+Discord เท่านั้น)
  if (cfg.welpruEnabled && override.welpru !== false && params.eventKey !== "line_quota_warning") {
```

(3c) เพิ่ม LINE branch ต่อจาก WeLPRU branch (ก่อนปิด `}` ของ `notifyAndLog`):
```typescript
  // 4. LINE (เฉพาะ 2 event ปุ่ม — ต้องมี lineApproval + line_user_id + quota ไม่เต็ม)
  if (cfg.lineEnabled && override.line !== false && params.lineApproval) {
    try {
      const lineUserId = await loadLineUserId(client, params.lineApproval.approverId);
      if (lineUserId) {
        const sent = await countLinePushesThisMonth(client);
        if (sent >= 500) {
          await logIntegration(client, {
            service: "internal",
            status: "success",
            payload: { skipped: "line_quota", sent },
          });
        } else {
          const tokenId = await createOrReuseApprovalToken(client, params.lineApproval);
          if (tokenId) {
            // เตือน quota ก่อน push (push นี้จะทำให้ยอด ≥400) — วางก่อน push เพื่อให้
            // logic นี้ทดสอบได้จริง (pushFlex throw ใน test env เพราะไม่มี Deno.env)
            if (sent + 1 >= 400) {
              await maybeFireQuotaWarning(client, sent + 1);
            }
            const flex = buildApprovalFlex(
              {
                booker: params.variables.booker ?? "",
                room: params.variables.room ?? "",
                date: params.variables.date ?? "",
                time: params.variables.time ?? "",
              },
              tokenId,
              title
            );
            await pushFlex(lineUserId, flex);
            await logIntegration(client, {
              service: "line",
              status: "success",
              payload: { kind: "push" },
            });
          }
        }
      }
    } catch (err) {
      console.error("[notifyAndLog] line ล้มเหลว:", err);
      await logIntegration(client, {
        service: "line",
        status: "failed",
        payload: { kind: "push" },
        error_detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
```

(3d) เพิ่ม helper ต่อจาก `loadWelpruStaffId` (ท้ายไฟล์):
```typescript
// ── LINE eligibility + quota (ต้องไม่ throw — เรียกใน try/catch ของ LINE branch) ──
async function loadLineUserId(client: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await client
      .from("users")
      .select("line_user_id")
      .eq("id", userId)
      .single();
    if (error || !data) return null;
    return (data as { line_user_id: string | null }).line_user_id;
  } catch (err) {
    console.error("[notifyAndLog] loadLineUserId ล้มเหลว:", err);
    return null;
  }
}

function startOfMonthISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// นับ push (ไม่นับ reply) เดือนนี้ — พังก็คืน 0 (favor delivery)
async function countLinePushesThisMonth(client: SupabaseClient): Promise<number> {
  try {
    const { count } = await client
      .from("integration_health")
      .select("*", { count: "exact", head: true })
      .eq("service", "line")
      .eq("status", "success")
      .eq("payload->>kind", "push")
      .gte("created_at", startOfMonthISO());
    return count ?? 0;
  } catch (err) {
    console.error("[notifyAndLog] countLinePushesThisMonth ล้มเหลว:", err);
    return 0;
  }
}

// ยิง line_quota_warning เดือนละครั้ง (dedupe) ให้ Admin — in-app + Discord เท่านั้น
async function maybeFireQuotaWarning(client: SupabaseClient, sent: number): Promise<void> {
  const { count } = await client
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("event_key", "line_quota_warning")
    .gte("created_at", startOfMonthISO());
  if ((count ?? 0) > 0) return;

  const { data: cfg } = await client.from("system_config").select("admin_id").single();
  const adminId = (cfg as { admin_id: string | null } | null)?.admin_id;
  if (!adminId) return;

  // recursion ลึก 1 — event นี้ไม่มี lineApproval จึงไม่เข้า LINE branch อีก
  await notifyAndLog(client, {
    eventKey: "line_quota_warning",
    recipients: [{ userId: adminId }],
    variables: { sent: String(sent) },
  });
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npm run test -- notify`
Expected: PASS ทั้งหมด (test เดิม + LINE channel ใหม่)

- [ ] **Step 5: รัน full suite**

Run: `npm run test`
Expected: PASS ทั้งหมด — ยืนยัน never-throw invariant test เดิมยังผ่าน

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/notify.ts supabase/functions/_shared/notify.test.ts
git commit -m "feat(line): LINE channel in notifyAndLog — Flex push, quota guard, quota-warning fire"
```

---

## Task 5: bookingNotify.ts — ส่ง lineApproval ใน 2 event ปุ่ม

**Files:**
- Modify: `supabase/functions/_shared/bookingNotify.ts`
- Modify: `supabase/functions/_shared/bookingNotify.test.ts`

**Interfaces:**
- Consumes: `NotifyParams.lineApproval` (Task 3)

- [ ] **Step 1: เขียน failing test**

เพิ่ม test block นี้ต่อท้าย `bookingNotify.test.ts` — ตรวจ `lineApproval` แบบ **integration ผ่าน LINE channel จริง** (ไม่ spy): เมื่อ `line_enabled=true` + approver มี `line_user_id`, การส่ง `lineApproval` เข้า `notifyAndLog` จะทำให้เกิด `approval_tokens` insert ที่ payload บอก booking/step/approver — assert ตรงนั้น (ใช้ import เดิม `makeClient`/`DbCallContext`/`notifyBookingSubmitted`/`notifyApprovalOutcome` ที่มีอยู่แล้ว ไม่ต้องเพิ่ม import):

```typescript
describe("bookingNotify — lineApproval → approval_token (integration ผ่าน LINE channel)", () => {
  const detailRow = {
    requester_id: "req1", requester_name: "สมชาย", room_name: "ห้อง A",
    start_time: "2026-07-15T02:00:00Z", end_time: "2026-07-15T05:00:00Z", cancellation_reason: null,
  };
  // system_config รวมทั้ง chain (admin/approver) และ toggle (line_enabled=true)
  const cfgRow = {
    admin_id: "adm1", approver1_id: "apv1", approver2_id: "apv2",
    welpru_enabled: false, discord_enabled: false, line_enabled: true, notification_settings: {},
  };

  function tokenCaptureResponder() {
    return (ctx: DbCallContext) => {
      if (ctx.table === "booking_detail") return { data: detailRow };
      if (ctx.table === "system_config") return { data: cfgRow };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: { full_name: "ผู้อนุมัติ", line_user_id: "U_line", staff_id: null, welpru_verified_at: null } };
      if (ctx.table === "integration_health" && ctx.op === "select") return { count: 0 };
      if (ctx.table === "approval_tokens" && ctx.op === "insert") return { data: { id: "tok-1" } };
      return {}; // notifications insert, integration_health insert (log)
    };
  }

  it("notifyBookingSubmitted → approval_token { booking_id, step:1, approver_id: admin }", async () => {
    const { client, calls } = makeClient(tokenCaptureResponder());
    await notifyBookingSubmitted(client as never, "b1");
    const tok = calls.find((c: DbCallContext) => c.table === "approval_tokens" && c.op === "insert");
    expect(tok?.payload).toMatchObject({ booking_id: "b1", step: 1, approver_id: "adm1" });
  });

  it("notifyApprovalOutcome step-approved → approval_token { booking_id, step:2, approver_id: approver1 }", async () => {
    const { client, calls } = makeClient(tokenCaptureResponder());
    await notifyApprovalOutcome(client as never, "b1", {
      bookingId: "b1", step: 1, action: "approved", currentStep: 1, finalStatus: "pending",
    });
    const tok = calls.find((c: DbCallContext) => c.table === "approval_tokens" && c.op === "insert");
    expect(tok?.payload).toMatchObject({ booking_id: "b1", step: 2, approver_id: "apv1" });
  });
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm run test -- bookingNotify`
Expected: FAIL — ยังไม่ส่ง `lineApproval`

- [ ] **Step 3: implement — แก้ `bookingNotify.ts`**

(3a) `notifyBookingSubmitted` — เพิ่ม `lineApproval` เข้า notifyAndLog call:
```typescript
    await notifyAndLog(client, {
      eventKey: "booking_submitted",
      recipients: [{ userId: chain.admin_id }],
      variables: baseVars(d),
      lineApproval: { bookingId, step: 1, approverId: chain.admin_id },
    });
```

(3b) `notifyApprovalOutcome` — ในกิ่ง step-approved (non-final) เพิ่ม `lineApproval`:
```typescript
    if (nextApprover) {
      const approverName = await loadUserName(client, nextApprover);
      await notifyAndLog(client, {
        eventKey: "booking_step_approved",
        recipients: [{ userId: nextApprover }],
        variables: { ...base, step: String(result.step), approver: approverName },
        lineApproval: { bookingId, step: result.currentStep + 1, approverId: nextApprover },
      });
    }
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npm run test -- bookingNotify`
Expected: PASS ทั้งหมด (17 เดิม + 2 ใหม่)

- [ ] **Step 5: รัน full suite**

Run: `npm run test`
Expected: PASS ทั้งหมด

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/bookingNotify.ts supabase/functions/_shared/bookingNotify.test.ts
git commit -m "feat(line): pass lineApproval context from bookingNotify for the 2 button events"
```

---

## Task 6: Edge Functions `line-webhook` + `generate-line-otp` + config.toml

**Files:**
- Create: `supabase/functions/line-webhook/index.ts`
- Create: `supabase/functions/generate-line-otp/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `verifyLineSignature`, `parsePostbackData`, `replyText` (Task 1); `handleApprovalPostback`, `handleLinkCommand` (Task 2)

- [ ] **Step 1: สร้าง `line-webhook/index.ts`**

สร้าง `supabase/functions/line-webhook/index.ts`:

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyLineSignature, parsePostbackData, replyText } from "../_shared/lineClient.ts";
import { handleApprovalPostback, handleLinkCommand } from "../_shared/lineApproval.ts";

// line-webhook: verify_jwt=false (LINE เรียก, ใช้ signature แทน)
// ต้องตอบ 200 เสมอยกเว้น signature ผิด (401) — กัน LINE retry ซ้ำ
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  const rawBody = await req.text();
  const signature = req.headers.get("X-Line-Signature") ?? "";
  const secret = Deno.env.get("LINE_CHANNEL_SECRET") ?? "";

  const valid = await verifyLineSignature(rawBody, signature, secret);
  if (!valid) {
    return new Response("invalid signature", { status: 401 });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let payload: { events?: LineEvent[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("ok", { status: 200 });
  }

  for (const event of payload.events ?? []) {
    try {
      await handleEvent(adminClient, event);
    } catch (err) {
      // business/unexpected error → log แต่ยังตอบ 200 กัน LINE retry
      console.error("[line-webhook] handleEvent", err);
    }
  }

  return new Response("ok", { status: 200 });
});

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  postback?: { data: string };
  message?: { type: string; text?: string };
}

async function handleEvent(
  // deno-lint-ignore no-explicit-any
  client: any,
  event: LineEvent
): Promise<void> {
  const lineUserId = event.source?.userId;
  const replyToken = event.replyToken;

  // postback อนุมัติ/ปฏิเสธ
  if (event.type === "postback" && event.postback && lineUserId && replyToken) {
    const parsed = parsePostbackData(event.postback.data);
    if (!parsed) return;
    const { replyText: text } = await handleApprovalPostback(client, {
      tokenId: parsed.token,
      action: parsed.action,
      lineUserId,
    });
    await replyText(replyToken, text);
    return;
  }

  // message
  if (event.type === "message" && event.message?.type === "text" && lineUserId && replyToken) {
    const text = (event.message.text ?? "").trim();
    const linkMatch = text.match(/^\/link\s+(\d{6})$/);
    if (linkMatch) {
      const { replyText: r } = await handleLinkCommand(client, { otp: linkMatch[1], lineUserId });
      await replyText(replyToken, r);
      return;
    }
    await replyText(
      replyToken,
      "พิมพ์ /link ตามด้วยรหัส 6 หลักจากหน้าโปรไฟล์ เพื่อเชื่อมบัญชี"
    );
    return;
  }

  // follow (เพิ่มเพื่อนครั้งแรก)
  if (event.type === "follow" && replyToken) {
    await replyText(
      replyToken,
      "ยินดีต้อนรับสู่ระบบจองห้องประชุม LPRU 🔔\nเชื่อมบัญชีโดยไปที่หน้าโปรไฟล์ในเว็บ กด \"เชื่อมต่อ LINE\" แล้วพิมพ์ /link ตามด้วยรหัส 6 หลัก"
    );
    return;
  }
  // event อื่น (unfollow, sticker ฯลฯ) → เมิน
}
```

- [ ] **Step 2: สร้าง `generate-line-otp/index.ts`**

สร้าง `supabase/functions/generate-line-otp/index.ts`:

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { UnauthorizedError, AppError } from "../_shared/errors.ts";

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
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
    if (!user) throw new UnauthorizedError("ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // สร้าง OTP — otp เป็น UNIQUE, ชนก็ลองใหม่สูงสุด 5 ครั้ง
    let otp = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      otp = generateOtp();
      const { error } = await adminClient
        .from("line_link_tokens")
        .insert({ user_id: user.id, otp });
      if (!error) {
        return new Response(JSON.stringify({ otp, expiresInMinutes: 10 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if ((error as { code?: string }).code !== "23505") throw error;
    }
    throw new AppError("OTP_GENERATION_FAILED", "ไม่สามารถสร้างรหัสได้ กรุณาลองใหม่", 500);
  })
);
```

- [ ] **Step 3: เพิ่ม config.toml entries**

แก้ `supabase/config.toml` — เพิ่มต่อจาก entries เดิม:
```toml
[functions.line-webhook]
verify_jwt = false

[functions.generate-line-otp]
verify_jwt = true
```

- [ ] **Step 4: type-check + full suite**

Run: `npm run test`
Expected: PASS ทั้งหมด (ไม่มี test ใหม่สำหรับ edge function — เป็น thin wrapper เหนือ logic ที่ทดสอบแล้วใน Task 1-2)

ตรวจว่าไม่มี type error ใหม่ (edge functions ใช้ Deno-style import เหมือน function อื่นทั้งหมด — `npx tsc --noEmit` จะข้าม supabase/functions ตาม config เดิม เหมือน approve-booking)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/line-webhook supabase/functions/generate-line-otp supabase/config.toml
git commit -m "feat(line): line-webhook + generate-line-otp edge functions"
```

---

## Task 7: Profile UI — การ์ด LINE จริง (OTP + สถานะ + ยกเลิก)

**Files:**
- Modify: `app/(app)/profile/page.tsx`

**Interfaces:**
- Consumes: Edge Function `generate-line-otp` (Task 6)

**อ่านก่อนเริ่ม:** ดูการ์ด WeLPRU ในไฟล์เดียวกัน (เพิ่มในเฟส 2) เป็น pattern — ใช้ `Card`/`Button`, token class เท่านั้น (Rule 10)

- [ ] **Step 1: แก้ `Profile` type + query ให้มี `line_user_id`**

แก้ `type Profile` เพิ่มฟิลด์:
```typescript
type Profile = {
  full_name: string;
  email: string;
  role: "user" | "approver" | "admin";
  department: string | null;
  phone: string | null;
  staff_id: string | null;
  welpru_verified_at: string | null;
  line_user_id: string | null;
};
```

แก้ query ใน `load()` เพิ่ม `line_user_id`:
```typescript
      const { data, error } = await supabase
        .from("users")
        .select("full_name, email, role, department, phone, staff_id, welpru_verified_at, line_user_id")
        .eq("id", user.id)
        .single();
```

- [ ] **Step 2: เพิ่ม state + handlers**

เพิ่ม state ใหม่ (ต่อจาก state ของ WeLPRU):
```typescript
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [lineOtp, setLineOtp] = useState<string | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [generatingOtp, setGeneratingOtp] = useState(false);
  const [lineMessage, setLineMessage] = useState<string | null>(null);
```

ตั้งค่า `lineUserId` หลังโหลด profile (ต่อจาก `setWelpruVerifiedAt(...)`):
```typescript
      setLineUserId((data as Profile).line_user_id);
```

เพิ่ม countdown effect (หลัง useEffect โหลด profile):
```typescript
  useEffect(() => {
    if (otpSecondsLeft <= 0) return;
    const timer = setInterval(() => setOtpSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [otpSecondsLeft]);
```

เพิ่ม handlers (ต่อจาก handler ของ WeLPRU):
```typescript
  async function handleGenerateLineOtp() {
    setGeneratingOtp(true);
    setLineMessage(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLineMessage("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setGeneratingOtp(false);
      return;
    }
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-line-otp`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      }
    );
    setGeneratingOtp(false);
    if (!response.ok) {
      setLineMessage("สร้างรหัสไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    const data = (await response.json()) as { otp: string; expiresInMinutes: number };
    setLineOtp(data.otp);
    setOtpSecondsLeft(data.expiresInMinutes * 60);
  }

  async function handleUnlinkLine() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("users").update({ line_user_id: null }).eq("id", user.id);
    if (error) {
      setLineMessage("ยกเลิกการเชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setLineUserId(null);
    setLineOtp(null);
    setOtpSecondsLeft(0);
  }
```

- [ ] **Step 3: แทนที่ Card "เชื่อมต่อ LINE" placeholder เดิม**

หา Card เดิม (ข้อความ "เร็วๆ นี้ — ระบบแจ้งเตือนผ่าน LINE อยู่ระหว่างการพัฒนา") แล้วแทนที่ทั้ง Card ด้วย:

```tsx
          <Card className="mt-4">
            <p className="font-medium text-text-primary">เชื่อมต่อ LINE</p>
            {lineUserId ? (
              <>
                <p className="mt-1 text-sm text-success-text">
                  ✅ เชื่อมต่อบัญชี LINE แล้ว
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  ท่านจะได้รับ Flex Message พร้อมปุ่มอนุมัติเมื่อมีคำขอที่ต้องพิจารณา
                </p>
                <div className="mt-3">
                  <Button variant="secondary" onClick={handleUnlinkLine}>
                    ยกเลิกการเชื่อมต่อ
                  </Button>
                </div>
              </>
            ) : lineOtp && otpSecondsLeft > 0 ? (
              <>
                <p className="mt-1 text-sm text-text-secondary">
                  1. เพิ่มเพื่อน LINE Official Account ของระบบ
                  {process.env.NEXT_PUBLIC_LINE_OA_ID && (
                    <>
                      {" "}
                      <a
                        href={`https://line.me/R/ti/p/@${process.env.NEXT_PUBLIC_LINE_OA_ID}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-primary hover:underline"
                      >
                        (เพิ่มเพื่อน)
                      </a>
                    </>
                  )}
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  2. พิมพ์ข้อความนี้ในแชท:
                </p>
                <p className="mt-1 text-lg font-semibold text-text-primary">
                  /link {lineOtp}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  รหัสหมดอายุใน {Math.floor(otpSecondsLeft / 60)}:
                  {String(otpSecondsLeft % 60).padStart(2, "0")} นาที
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-text-secondary">
                  เชื่อมบัญชี LINE เพื่อรับการแจ้งเตือนคำขออนุมัติพร้อมปุ่มกดอนุมัติในแชท
                </p>
                {lineMessage && (
                  <p className="mt-2 text-sm text-text-secondary">{lineMessage}</p>
                )}
                <div className="mt-3">
                  <Button onClick={handleGenerateLineOtp} disabled={generatingOtp}>
                    {generatingOtp ? "กำลังสร้างรหัส..." : "เชื่อมต่อ LINE"}
                  </Button>
                </div>
              </>
            )}
          </Card>
```

- [ ] **Step 4: type-check + lint**

Run: `npx tsc --noEmit` แล้ว `npm run lint`
Expected: ไม่มี error ใหม่ในไฟล์ที่แก้

- [ ] **Step 5: รัน full suite (frontend ไม่กระทบ Deno tests)**

Run: `npm run test`
Expected: PASS เท่าเดิม

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/profile/page.tsx"
git commit -m "feat(line): profile LINE linking UI — OTP generate, status, unlink"
```

---

## Task 8: Deploy + Live Verification

**Files:** ไม่มี (deploy + ทดสอบ)

- [ ] **Step 1: ตั้ง secrets (controller — ต้องได้ค่าจริงจากผู้ใช้ก่อน)**

```bash
supabase secrets set LINE_CHANNEL_SECRET=<จาก LINE Developers Console> --project-ref sbmbdngrutkjugsmmfxa
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=<จาก LINE Developers Console> --project-ref sbmbdngrutkjugsmmfxa
```
และตั้ง `NEXT_PUBLIC_LINE_OA_ID` ใน Vercel/`.env.local` (public OA id เช่น `abc1234` จาก @abc1234)

- [ ] **Step 2: Deploy functions**

Deploy function ใหม่ + re-deploy ที่ import shared ที่เปลี่ยน (notify.ts/bookingNotify.ts เปลี่ยน → 5 handler เดิมต้อง redeploy ด้วย):
```bash
npx supabase functions deploy line-webhook generate-line-otp --use-api --project-ref sbmbdngrutkjugsmmfxa
npx supabase functions deploy create-booking approve-booking request-cancellation decide-cancellation direct-cancel-booking --use-api --project-ref sbmbdngrutkjugsmmfxa
```
Expected: `"Deployed Functions."` ทั้งหมด — ตรวจ `functions list` ว่า `line-webhook` verify_jwt=false, `generate-line-otp` verify_jwt=true

- [ ] **Step 3: ผู้ใช้ register webhook URL**

ใน LINE Developers Console → Messaging API → Webhook URL:
`https://sbmbdngrutkjugsmmfxa.supabase.co/functions/v1/line-webhook`
เปิด "Use webhook" + ปิด auto-reply/greeting → กด **Verify** (ต้องขึ้น Success / 200)

- [ ] **Step 4: Live-test — OTP linking**

- Login เว็บ → `/profile` → กด "เชื่อมต่อ LINE" → เห็น OTP + countdown
- เพิ่มเพื่อน OA (ถ้ายัง) → พิมพ์ `/link <OTP>` ในแชท → เห็น reply "✅ เชื่อมต่อบัญชี LINE สำเร็จ"
- refresh `/profile` → เห็น "✅ เชื่อมต่อบัญชี LINE แล้ว" + ปุ่มยกเลิก
- ตรวจ DB: `SELECT line_user_id FROM users WHERE ...` มีค่า, `consent_records` มี line_linking

- [ ] **Step 5: Live-test — approval postback**

- เปิด toggle: `UPDATE system_config SET line_enabled = true;` (ผ่าน db query — ยังไม่มี UI จนเฟส 4; **ถามผู้ใช้ก่อนเปิด**)
- ให้ Admin (step 1) เชื่อม LINE ไว้ → user สร้าง booking จริง → Admin ได้รับ Flex การ์ด + ปุ่ม
- กด **อนุมัติ** → เห็น reply "✅ อนุมัติเรียบร้อยแล้ว" → ตรวจ DB: `bookings.current_step` เดินไป 1, `approval_logs` มีแถว step 1, `approval_tokens.is_used=true` — ผลตรงกับอนุมัติผ่านเว็บเป๊ะ
- กดการ์ดเดิมซ้ำ → reply "ดำเนินการไปแล้ว" (atomic กัน double)
- ถ้ามี Approver ขั้นถัดไปเชื่อม LINE → ได้ Flex ใบใหม่ต่อ chain
- รอบสอง: ทดสอบปุ่ม **ปฏิเสธ** → `bookings.final_status=rejected` + ผู้จองได้แจ้งเตือน (in-app) เหตุผล "ไม่ระบุ"
- ตรวจ `integration_health`: มีแถว `service='line'` `payload->>kind='push'` (จาก Flex) และ `'reply'` แยกกัน

- [ ] **Step 6: บันทึกผล + ปิด toggle ถ้าผู้ใช้ต้องการ**

สรุปผล live-test; ถามผู้ใช้ว่าจะเปิด `line_enabled` ค้างไว้ใช้งานจริงหรือปิดกลับก่อน

---

## Self-Review Checklist (หลังลงมือครบ 8 task)

- [ ] LINE ยิงเฉพาะ `booking_submitted` + `booking_step_approved` (มี lineApproval) — ไม่มีทางยิง cancellation_requested หรือ event อื่นทาง LINE
- [ ] `line_quota_warning` เข้า in-app + Discord เท่านั้น (WeLPRU branch มี guard `!== "line_quota_warning"`, LINE branch ต้องมี lineApproval ที่ event นี้ไม่มี)
- [ ] `processApproval` เรียกด้วย params จาก token (booking_id/step/approver_id) — Rule 2, ไม่ซ้ำ logic
- [ ] consume ทั้ง approval_tokens + line_link_tokens เป็น atomic UPDATE with WHERE (Rule 6)
- [ ] identity check ก่อน consume (ไม่เผา token ถ้าคนผิดกด)
- [ ] webhook ตอบ 200 ทุกกรณียกเว้น signature ผิด (401)
- [ ] LINE API call log push/reply แยก kind (Rule 5) → quota นับเฉพาะ push
- [ ] never-throw invariant: test เดิมทุกตัวผ่าน + LINE path พังไม่ throw
- [ ] ไม่มี migration ใหม่, ไม่แตะ processApproval/approve-booking/เว็บ flow
- [ ] Secrets ผ่าน Deno.env เท่านั้น (Rule 7), UI ใช้ token class (Rule 10), ข้อความไทยทางการ (Rule 9)
- [ ] ไม่มี placeholder/TODO ในโค้ดที่รันจริง
