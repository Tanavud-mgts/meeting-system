import { describe, it, expect } from "vitest";
import { buildSidebar, findGroupForPath } from "./nav";

describe("buildSidebar", () => {
  it("user sees 6 standalone items incl. guide", () => {
    const items = buildSidebar("user");
    expect(items).toHaveLength(6);
    expect(items.map((i) => i.href)).toEqual([
      "/home",
      "/booking",
      "/calendar",
      "/profile/bookings",
      "/guide",
      "/profile",
    ]);
  });

  it("approver sees 8 items incl. standalone รายงาน, guide, and one group", () => {
    const items = buildSidebar("approver");
    expect(items).toHaveLength(8);
    // standalone reports present exactly once for approver
    expect(items.filter((i) => i.href === "/dashboard/reports")).toHaveLength(1);
    // one group entry (งานอนุมัติ) whose click target is the first tab
    const group = items.find((i) => i.label === "งานอนุมัติ");
    expect(group?.href).toBe("/approver");
    expect(group?.groupHrefs).toEqual([
      "/approver",
      "/approver/cancel-requests",
      "/approver/history",
    ]);
  });

  it("admin sees 9 items incl. guide and no standalone รายงาน", () => {
    const items = buildSidebar("admin");
    expect(items).toHaveLength(9);
    expect(items.filter((i) => i.href === "/dashboard/reports")).toHaveLength(0);
    expect(items.map((i) => i.label)).toEqual([
      "หน้าหลัก",
      "จองห้อง",
      "ปฏิทิน",
      "การจองของฉัน",
      "งานอนุมัติ",
      "จัดการระบบ",
      "รายงานและข้อมูล",
      "คู่มือการใช้งาน",
      "โปรไฟล์",
    ]);
    const manage = items.find((i) => i.label === "จัดการระบบ");
    expect(manage?.href).toBe("/dashboard/rooms");
    expect(manage?.groupHrefs).toEqual([
      "/dashboard/rooms",
      "/dashboard/users",
      "/dashboard/settings",
    ]);
  });
});

describe("findGroupForPath", () => {
  it("matches approval routes to งานอนุมัติ", () => {
    expect(findGroupForPath("/approver", "admin")?.label).toBe("งานอนุมัติ");
    expect(findGroupForPath("/approver/history", "approver")?.label).toBe(
      "งานอนุมัติ"
    );
  });

  it("matches management routes to จัดการระบบ (admin only)", () => {
    expect(findGroupForPath("/dashboard/rooms", "admin")?.label).toBe(
      "จัดการระบบ"
    );
  });

  it("matches /dashboard/reports to รายงานและข้อมูล for admin only", () => {
    expect(findGroupForPath("/dashboard/reports", "admin")?.label).toBe(
      "รายงานและข้อมูล"
    );
    // approver is NOT in the group's roles -> no tab bar (they use standalone)
    expect(findGroupForPath("/dashboard/reports", "approver")).toBeNull();
  });

  it("returns null for routes not in any group", () => {
    expect(findGroupForPath("/home", "user")).toBeNull();
    expect(findGroupForPath("/booking", "admin")).toBeNull();
  });
});
