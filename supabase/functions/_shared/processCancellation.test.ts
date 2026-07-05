import { describe, it, expect } from "vitest";
import {
  requestCancellation,
  decideCancellation,
} from "./processCancellation.ts";
import { makeClient, type DbResponse, type DbCallContext } from "./mockClient.ts";
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from "./errors.ts";

describe("requestCancellation", () => {
  const base = { bookingId: "b1", requesterId: "owner", reason: "ไม่ว่างแล้ว" };

  it("rejects an empty reason before touching the db", async () => {
    const { client, calls } = makeClient(() => {
      throw new Error("db should not be called");
    });
    await expect(
      requestCancellation(client as never, { ...base, reason: "  " })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it("throws NotFoundError when the booking does not exist", async () => {
    const { client } = makeClient((ctx: DbCallContext): DbResponse => {
      if (ctx.op === "select") return { data: null, error: { message: "x" } };
      throw new Error("unexpected");
    });
    await expect(
      requestCancellation(client as never, base)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ForbiddenError when the requester is not the owner", async () => {
    const { client } = makeClient((ctx: DbCallContext): DbResponse => {
      if (ctx.op === "select")
        return { data: { final_status: "pending", requester_id: "someone-else" } };
      throw new Error("unexpected");
    });
    await expect(
      requestCancellation(client as never, base)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("cancels a pending booking immediately and logs it", async () => {
    const { client, calls } = makeClient((ctx: DbCallContext): DbResponse => {
      if (ctx.op === "select")
        return { data: { final_status: "pending", requester_id: "owner" } };
      if (ctx.table === "bookings" && ctx.op === "update") return { data: [{ id: "b1" }] };
      if (ctx.table === "cancellation_logs" && ctx.op === "insert") return {};
      throw new Error(`unexpected ${ctx.table}.${ctx.op}`);
    });
    const result = await requestCancellation(client as never, base);
    expect(result.newStatus).toBe("cancelled");
    const update = calls.find((c) => c.table === "bookings" && c.op === "update");
    expect(update?.payload).toEqual({ final_status: "cancelled" });
    const log = calls.find((c) => c.table === "cancellation_logs");
    expect(log?.payload).toMatchObject({ role: "user", prev_status: "pending" });
  });

  it("moves an approved booking to cancel_requested (needs admin decision)", async () => {
    const { client } = makeClient((ctx: DbCallContext): DbResponse => {
      if (ctx.op === "select")
        return { data: { final_status: "approved", requester_id: "owner" } };
      if (ctx.table === "bookings" && ctx.op === "update") return { data: [{ id: "b1" }] };
      throw new Error(`unexpected ${ctx.table}.${ctx.op}`);
    });
    const result = await requestCancellation(client as never, base);
    expect(result.newStatus).toBe("cancel_requested");
  });

  it("throws ConflictError when the pending update affects zero rows (race)", async () => {
    const { client } = makeClient((ctx: DbCallContext): DbResponse => {
      if (ctx.op === "select")
        return { data: { final_status: "pending", requester_id: "owner" } };
      if (ctx.table === "bookings" && ctx.op === "update") return { data: [] };
      throw new Error(`unexpected ${ctx.table}.${ctx.op}`);
    });
    await expect(
      requestCancellation(client as never, base)
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws ConflictError for a non-cancellable status", async () => {
    const { client } = makeClient((ctx: DbCallContext): DbResponse => {
      if (ctx.op === "select")
        return { data: { final_status: "rejected", requester_id: "owner" } };
      throw new Error("unexpected");
    });
    await expect(
      requestCancellation(client as never, base)
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("decideCancellation", () => {
  const base = {
    bookingId: "b1",
    deciderId: "admin",
    role: "admin" as const,
    decision: "approve" as const,
  };

  it("rejects an invalid decision before touching the db", async () => {
    const { client, calls } = makeClient(() => {
      throw new Error("db should not be called");
    });
    await expect(
      decideCancellation(client as never, { ...base, decision: "maybe" as never })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it("throws ConflictError when the booking is not cancel_requested", async () => {
    const { client } = makeClient((ctx: DbCallContext): DbResponse => {
      if (ctx.op === "select")
        return { data: { final_status: "approved", cancellation_reason: null } };
      throw new Error("unexpected");
    });
    await expect(
      decideCancellation(client as never, base)
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("approving a cancel request sets the booking to cancelled and logs it", async () => {
    const { client, calls } = makeClient((ctx: DbCallContext): DbResponse => {
      if (ctx.op === "select")
        return { data: { final_status: "cancel_requested", cancellation_reason: "r" } };
      if (ctx.table === "bookings" && ctx.op === "update") return { data: [{ id: "b1" }] };
      if (ctx.table === "cancellation_logs" && ctx.op === "insert") return {};
      throw new Error(`unexpected ${ctx.table}.${ctx.op}`);
    });
    const result = await decideCancellation(client as never, base);
    expect(result.newStatus).toBe("cancelled");
    const update = calls.find((c) => c.table === "bookings" && c.op === "update");
    expect(update?.payload).toEqual({ final_status: "cancelled" });
  });

  it("rejecting a cancel request restores approved and writes an activity log", async () => {
    const { client, calls } = makeClient((ctx: DbCallContext): DbResponse => {
      if (ctx.op === "select")
        return { data: { final_status: "cancel_requested", cancellation_reason: "r" } };
      if (ctx.table === "bookings" && ctx.op === "update") return { data: [{ id: "b1" }] };
      if (ctx.table === "activity_logs" && ctx.op === "insert") return {};
      throw new Error(`unexpected ${ctx.table}.${ctx.op}`);
    });
    const result = await decideCancellation(client as never, {
      ...base,
      decision: "reject",
    });
    expect(result.newStatus).toBe("approved");
    const update = calls.find((c) => c.table === "bookings" && c.op === "update");
    expect(update?.payload).toEqual({ final_status: "approved" });
    expect(calls.some((c) => c.table === "activity_logs")).toBe(true);
  });

  it("throws ConflictError when the decision update affects zero rows (race)", async () => {
    const { client } = makeClient((ctx: DbCallContext): DbResponse => {
      if (ctx.op === "select")
        return { data: { final_status: "cancel_requested", cancellation_reason: "r" } };
      if (ctx.table === "bookings" && ctx.op === "update") return { data: [] };
      throw new Error(`unexpected ${ctx.table}.${ctx.op}`);
    });
    await expect(
      decideCancellation(client as never, base)
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
