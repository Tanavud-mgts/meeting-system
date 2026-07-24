import { describe, it, expect } from "vitest";
import { modulesForRole, GUIDE_CONTENT } from "./content";

describe("modulesForRole", () => {
  it("user sees only the user module", () => {
    expect(modulesForRole("user")).toEqual(["user"]);
  });

  it("approver sees user + approver (cumulative)", () => {
    expect(modulesForRole("approver")).toEqual(["user", "approver"]);
  });

  it("admin sees all three modules", () => {
    expect(modulesForRole("admin")).toEqual(["user", "approver", "admin"]);
  });

  it("unknown role falls back to user", () => {
    expect(modulesForRole("bogus")).toEqual(["user"]);
  });
});

describe("GUIDE_CONTENT integrity", () => {
  it("defines exactly the three modules in order", () => {
    expect(GUIDE_CONTENT.map((m) => m.module)).toEqual([
      "user",
      "approver",
      "admin",
    ]);
  });

  it("every module has at least one section with at least one step", () => {
    for (const mod of GUIDE_CONTENT) {
      expect(mod.sections.length).toBeGreaterThan(0);
      for (const section of mod.sections) {
        expect(section.steps.length).toBeGreaterThan(0);
      }
    }
  });

  it("every step href (when present) is an internal path", () => {
    for (const mod of GUIDE_CONTENT) {
      for (const section of mod.sections) {
        for (const step of section.steps) {
          if (step.href !== undefined) {
            expect(step.href.startsWith("/")).toBe(true);
          }
        }
      }
    }
  });
});
