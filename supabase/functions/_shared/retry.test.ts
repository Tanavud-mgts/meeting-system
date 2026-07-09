import { describe, it, expect, vi } from "vitest";
import { withRetry, RetryableHttpError } from "./retry.ts";

describe("withRetry", () => {
  it("คืนค่าสำเร็จโดยไม่ retry ถ้า fn สำเร็จตั้งแต่ครั้งแรก", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("ใช้ exponential backoff สำหรับ Error ทั่วไป", async () => {
    vi.useFakeTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockResolvedValueOnce("ok");
    const promise = withRetry(fn, { initialDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("ใช้ retryAfterMs จาก RetryableHttpError แทน exponential backoff", async () => {
    vi.useFakeTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new RetryableHttpError("rate limited", 5000))
      .mockResolvedValueOnce("ok");
    const promise = withRetry(fn, { initialDelayMs: 10 });
    // ถ้ายังใช้ initialDelayMs (10ms) แทน retryAfterMs (5000ms) test นี้จะ resolve เร็วเกินไป
    await vi.advanceTimersByTimeAsync(10);
    expect(fn).toHaveBeenCalledTimes(1); // ยังไม่ retry เพราะรอ 5000ms ไม่ใช่ 10ms
    await vi.advanceTimersByTimeAsync(4990);
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("throw lastError เมื่อครบ maxAttempts", async () => {
    const err = new Error("always fails");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { maxAttempts: 2, initialDelayMs: 1 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
