export type Role = "user" | "approver" | "admin";

export type Tab = { href: string; label: string; roles: Role[] };
export type NavGroup = { label: string; roles: Role[]; tabs: Tab[] };
export type SidebarItem = {
  href: string;
  label: string;
  groupHrefs?: string[];
};

const ALL: Role[] = ["user", "approver", "admin"];

export const GROUPS: NavGroup[] = [
  {
    label: "งานอนุมัติ",
    roles: ["approver", "admin"],
    tabs: [
      { href: "/approver", label: "รออนุมัติ", roles: ["approver", "admin"] },
      {
        href: "/approver/cancel-requests",
        label: "คำขอยกเลิก",
        roles: ["approver", "admin"],
      },
      {
        href: "/approver/history",
        label: "ประวัติ",
        roles: ["approver", "admin"],
      },
    ],
  },
  {
    label: "จัดการระบบ",
    roles: ["admin"],
    tabs: [
      { href: "/dashboard/rooms", label: "ห้อง", roles: ["admin"] },
      { href: "/dashboard/users", label: "ผู้ใช้", roles: ["admin"] },
      { href: "/dashboard/settings", label: "ตั้งค่า", roles: ["admin"] },
    ],
  },
  {
    label: "รายงานและข้อมูล",
    roles: ["admin"],
    tabs: [
      { href: "/dashboard", label: "ภาพรวม", roles: ["admin"] },
      { href: "/dashboard/reports", label: "รายงาน", roles: ["admin"] },
      {
        href: "/dashboard/bookings",
        label: "การจองทั้งหมด",
        roles: ["admin"],
      },
      {
        href: "/dashboard/integrations",
        label: "Integration",
        roles: ["admin"],
      },
      { href: "/dashboard/activity", label: "ประวัติรวม", roles: ["admin"] },
      { href: "/dashboard/data", label: "Export", roles: ["admin"] },
    ],
  },
];

// Ordered master list. Each entry is either a standalone link or a reference to
// a group (by label). buildSidebar filters this by role and expands groups.
type Entry =
  | { kind: "link"; href: string; label: string; roles: Role[] }
  | { kind: "group"; label: string };

const SIDEBAR_ORDER: Entry[] = [
  { kind: "link", href: "/home", label: "หน้าหลัก", roles: ALL },
  { kind: "link", href: "/booking", label: "จองห้อง", roles: ALL },
  { kind: "link", href: "/calendar", label: "ปฏิทิน", roles: ALL },
  { kind: "link", href: "/profile/bookings", label: "การจองของฉัน", roles: ALL },
  { kind: "group", label: "งานอนุมัติ" },
  { kind: "group", label: "จัดการระบบ" },
  { kind: "group", label: "รายงานและข้อมูล" },
  // standalone รายงาน for approver only (admin gets it inside the group above)
  {
    kind: "link",
    href: "/dashboard/reports",
    label: "รายงาน",
    roles: ["approver"],
  },
  { kind: "link", href: "/guide", label: "คู่มือการใช้งาน", roles: ALL },
  { kind: "link", href: "/profile", label: "โปรไฟล์", roles: ALL },
];

export function buildSidebar(role: Role): SidebarItem[] {
  const items: SidebarItem[] = [];

  for (const entry of SIDEBAR_ORDER) {
    if (entry.kind === "link") {
      if (entry.roles.includes(role)) {
        items.push({ href: entry.href, label: entry.label });
      }
      continue;
    }

    const group = GROUPS.find((g) => g.label === entry.label);
    if (!group || !group.roles.includes(role)) continue;

    const accessibleTabs = group.tabs.filter((t) => t.roles.includes(role));
    if (accessibleTabs.length === 0) continue;

    items.push({
      href: accessibleTabs[0].href,
      label: group.label,
      groupHrefs: accessibleTabs.map((t) => t.href),
    });
  }

  return items;
}

export function findGroupForPath(
  pathname: string,
  role: Role
): NavGroup | null {
  for (const group of GROUPS) {
    if (!group.roles.includes(role)) continue;
    const match = group.tabs.some(
      (t) => t.href === pathname && t.roles.includes(role)
    );
    if (match) return group;
  }
  return null;
}
