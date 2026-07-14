import { describe, it, expect } from "vitest";
import { classifyDiscordResponse } from "./discordClient.ts";
import { RetryableHttpError } from "./retry.ts";

describe("classifyDiscordResponse", () => {
  it("status 2xx → ok", () => {
    expect(classifyDiscordResponse(200, null)).toBe("ok");
    expect(classifyDiscordResponse(204, null)).toBe("ok");
  });

  it("status 429 พร้อม Retry-After header → RetryableHttpError พร้อม retryAfterMs", () => {
    const result = classifyDiscordResponse(429, "2");
    expect(result).toBeInstanceOf(RetryableHttpError);
    expect((result as RetryableHttpError).retryAfterMs).toBe(2000);
  });

  it("status 429 ไม่มี Retry-After header → RetryableHttpError โดย retryAfterMs เป็น undefined", () => {
    const result = classifyDiscordResponse(429, null);
    expect(result).toBeInstanceOf(RetryableHttpError);
    expect((result as RetryableHttpError).retryAfterMs).toBeUndefined();
  });

  it("status 500 → Error ธรรมดา ไม่ใช่ RetryableHttpError", () => {
    const result = classifyDiscordResponse(500, null);
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(RetryableHttpError);
  });
});
