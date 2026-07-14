import { describe, it, expect } from "vitest";
import { logIntegration } from "./integrationLog.ts";
import type { IntegrationLogEntry } from "./integrationLog.ts";

describe("logIntegration", () => {
  it("resolves with { error: null } → logIntegration resolves to undefined, no throw", async () => {
    const client = {
      from: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
    };

    const result = await logIntegration(
      client as never,
      { service: "discord", status: "success" }
    );

    expect(result).toBeUndefined();
  });

  it("resolves with { error: { message } } → logIntegration resolves to undefined (swallows error)", async () => {
    const client = {
      from: () => ({
        insert: () =>
          Promise.resolve({ error: { message: "db constraint violation" } }),
      }),
    };

    const result = await logIntegration(
      client as never,
      { service: "discord", status: "failed" }
    );

    expect(result).toBeUndefined();
  });

  it("insert REJECTS (throws) → logIntegration still resolves to undefined, does NOT throw", async () => {
    const client = {
      from: () => ({
        insert: () => Promise.reject(new Error("db connection down")),
      }),
    };

    const result = await logIntegration(
      client as never,
      { service: "discord", status: "failed", error_detail: "network error" }
    );

    expect(result).toBeUndefined();
  });
});
