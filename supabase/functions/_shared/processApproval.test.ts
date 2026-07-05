import { describe, it, expect } from "vitest";
import { processApproval } from "./processApproval.ts";
import { makeClient, type DbResponse, type DbCallContext } from "./mockClient.ts";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from "./errors.ts";

// Helper: build a responder from a booking row + optional overrides for the
// insert/update calls. The read (op "select", single) returns the booking;
// approval_logs insert and bookings update succeed unless overridden.
function responderFor(
  booking: { final_status: string; current_step: number } | null,
  overrides: Partial<{
    insertApprovalLog: DbResponse;
    updateBooking: DbResponse;
  }> = {}
) {
  return (ctx: DbCallContext): DbResponse => {
    if (ctx.table === "bookings" && ctx.op === "select") {
      return booking ? { data: booking } : { data: null, error: { message: "not found" } };
    }
    if (ctx.table === "approval_logs" && ctx.op === "insert") {
      return overrides.insertApprovalLog ?? {};
    }
    if (ctx.table === "bookings" && ctx.op === "update") {
      return overrides.updateBooking ?? {};
    }
    throw new Error(`unexpected db call: ${ctx.table}.${ctx.op}`);
  };
}

const base = {
  bookingId: "b1",
  approverId: "u1",
  action: "approved" as const,
};

describe("processApproval", () => {
  it("rejects an invalid action before touching the db", async () => {
    const { client, calls } = makeClient(() => {
      throw new Error("db should not be called");
    });
    await expect(
      processApproval(client as never, { ...base, step: 1, action: "banana" as never })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it("throws NotFoundError when the booking does not exist", async () => {
    const { client } = makeClient(responderFor(null));
    await expect(
      processApproval(client as never, { ...base, step: 1 })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ConflictError when the booking is no longer pending", async () => {
    const { client } = makeClient(
      responderFor({ final_status: "approved", current_step: 0 })
    );
    await expect(
      processApproval(client as never, { ...base, step: 1 })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws ForbiddenError when it is not this step's turn", async () => {
    // current_step 0 means step 1 is next; asking for step 2 is out of turn.
    const { client } = makeClient(
      responderFor({ final_status: "pending", current_step: 0 })
    );
    await expect(
      processApproval(client as never, { ...base, step: 2 })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("advances current_step and stays pending on a non-final approval", async () => {
    const { client, calls } = makeClient(
      responderFor({ final_status: "pending", current_step: 0 })
    );
    const result = await processApproval(client as never, { ...base, step: 1 });
    expect(result).toMatchObject({
      currentStep: 1,
      finalStatus: "pending",
      action: "approved",
    });
    // The bookings update must set current_step to 1 (not final_status).
    const update = calls.find((c) => c.table === "bookings" && c.op === "update");
    expect(update?.payload).toEqual({ current_step: 1 });
  });

  it("approves the booking on the final (step 3) approval", async () => {
    const { client, calls } = makeClient(
      responderFor({ final_status: "pending", current_step: 2 })
    );
    const result = await processApproval(client as never, { ...base, step: 3 });
    expect(result).toMatchObject({ currentStep: 3, finalStatus: "approved" });
    const update = calls.find((c) => c.table === "bookings" && c.op === "update");
    expect(update?.payload).toEqual({ current_step: 3, final_status: "approved" });
  });

  it("terminates the chain immediately on rejection", async () => {
    const { client, calls } = makeClient(
      responderFor({ final_status: "pending", current_step: 0 })
    );
    const result = await processApproval(client as never, {
      ...base,
      step: 1,
      action: "rejected",
    });
    expect(result.finalStatus).toBe("rejected");
    const update = calls.find((c) => c.table === "bookings" && c.op === "update");
    expect(update?.payload).toEqual({ final_status: "rejected" });
  });

  it("maps a duplicate approval_logs insert (23505) to ConflictError", async () => {
    const { client } = makeClient(
      responderFor(
        { final_status: "pending", current_step: 0 },
        { insertApprovalLog: { error: { code: "23505", message: "dup" } } }
      )
    );
    await expect(
      processApproval(client as never, { ...base, step: 1 })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
