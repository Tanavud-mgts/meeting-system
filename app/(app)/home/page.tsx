"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  buildWeekDays,
  weekRangeISO,
  bucketByDay,
  type WeekDay,
} from "@/lib/homeWeek";

type Role = "user" | "approver" | "admin";

const ROLE_LABEL: Record<string, string> = {
  user: "ผู้ใช้ทั่วไป",
  approver: "ผู้อนุมัติ",
  admin: "ผู้ดูแลระบบ",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
};

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> =
  {
    pending: "warning",
    approved: "success",
  };

type NextBooking = {
  id: string;
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  final_status: string;
};

type HomeData = {
  fullName: string;
  role: Role;
  nextBooking: NextBooking | null;
  myPendingCount: number;
  weekDays: WeekDay[];
  waitingCount: number | null; // null = ไม่ได้อยู่ใน Approval Chain
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoadError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
        return;
      }

      const now = new Date();
      const { startISO, endISO } = weekRangeISO(now);

      const [profileRes, nextRes, pendingRes, weekRes, configRes] =
        await Promise.all([
          supabase
            .from("users")
            .select("full_name, role")
            .eq("id", user.id)
            .single(),
          supabase
            .from("booking_detail")
            .select("id, title, room_name, start_time, end_time, final_status")
            .eq("requester_id", user.id)
            .in("final_status", ["approved", "pending"])
            .gte("start_time", now.toISOString())
            .order("start_time", { ascending: true })
            .limit(1),
          supabase
            .from("booking_detail")
            .select("id", { count: "exact", head: true })
            .eq("requester_id", user.id)
            .eq("final_status", "pending"),
          supabase
            .from("booking_detail")
            .select("start_time")
            .in("final_status", ["approved", "pending"])
            .gte("start_time", startISO)
            .lt("start_time", endISO),
          supabase
            .from("system_config")
            .select("admin_id, approver1_id, approver2_id")
            .single(),
        ]);

      if (profileRes.error || !profileRes.data) {
        setLoadError("ไม่สามารถโหลดข้อมูลหน้าหลักได้");
        return;
      }

      const role = (profileRes.data.role ?? "user") as Role;

      // "รอคุณพิจารณา" ผูกกับการเป็นสมาชิก Approval Chain (มี step) ไม่ใช่ role
      let myStep: number | null = null;
      const cfg = configRes.data;
      if (cfg) {
        if (cfg.admin_id === user.id) myStep = 1;
        else if (cfg.approver1_id === user.id) myStep = 2;
        else if (cfg.approver2_id === user.id) myStep = 3;
      }

      let waitingCount: number | null = null;
      if (myStep !== null) {
        const { count } = await supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("final_status", "pending")
          .eq("current_step", myStep - 1);
        waitingCount = count ?? 0;
      }

      const weekBookings = (weekRes.data ?? []) as { start_time: string }[];
      const weekDays = bucketByDay(buildWeekDays(now), weekBookings);

      setData({
        fullName: profileRes.data.full_name,
        role,
        nextBooking: (nextRes.data?.[0] ?? null) as NextBooking | null,
        myPendingCount: pendingRes.count ?? 0,
        weekDays,
        waitingCount,
      });
    }

    load();
  }, []);

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-danger-text">{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in-up space-y-4 p-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  const emptyWeek = data.weekDays.every((d) => d.count === 0);

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      {/* Header แบรนด์ */}
      <div className="overflow-hidden rounded-lg shadow-card">
        <div
          className="flex items-center gap-4 p-5"
          style={{ background: "var(--gradient-brand)" }}
        >
          <Avatar name={data.fullName} size="lg" tone="inverse" />
          <div className="min-w-0">
            <p className="text-sm text-text-on-primary opacity-90">
              ยินดีต้อนรับ
            </p>
            <p className="truncate text-lg font-semibold text-text-on-primary">
              {data.fullName}
            </p>
            <span className="mt-2 inline-block rounded-pill bg-surface-card px-2.5 py-0.5 text-xs font-semibold text-brand-primary">
              {ROLE_LABEL[data.role] ?? data.role}
            </span>
          </div>
        </div>
      </div>

      {/* การ์ดสถานะของฉัน */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-text-secondary">การจองถัดไปของฉัน</p>
          {data.nextBooking ? (
            <div className="mt-1">
              <p className="font-medium text-text-primary">
                {data.nextBooking.title}
              </p>
              <p className="text-sm text-text-secondary">
                ห้อง {data.nextBooking.room_name}
              </p>
              <p className="text-sm text-text-secondary">
                {formatDateTime(data.nextBooking.start_time)}
              </p>
              <div className="mt-1">
                <Badge
                  tone={STATUS_TONE[data.nextBooking.final_status] ?? "neutral"}
                >
                  {STATUS_LABEL[data.nextBooking.final_status] ??
                    data.nextBooking.final_status}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-text-muted">
              ยังไม่มีการจองที่กำลังจะถึง
            </p>
          )}
        </Card>

        <Card>
          <p className="text-sm text-text-secondary">คำขอที่รออนุมัติของฉัน</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">
            {data.myPendingCount.toLocaleString("th-TH")}
          </p>
          <Link
            href="/booking"
            className="mt-3 inline-block rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary transition-transform duration-150 hover:scale-[1.02] hover:bg-brand-primary-strong"
          >
            จองห้องประชุม
          </Link>
        </Card>
      </div>

      {/* การ์ดตามบทบาท */}
      {(data.waitingCount !== null || data.role === "admin") && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.waitingCount !== null && (
            <Link
              href="/approver"
              className="flex flex-col gap-0.5 rounded-lg border border-warning-border bg-warning-surface p-5 shadow-card transition-shadow duration-150 hover:shadow-raised"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-text-secondary">
                  รอคุณพิจารณา
                </span>
                <span className="text-xs text-warning-text opacity-85">
                  ไปหน้าคำขออนุมัติ →
                </span>
              </div>
              <span className="text-2xl font-semibold text-warning-text">
                {data.waitingCount.toLocaleString("th-TH")}
              </span>
            </Link>
          )}
          {data.role === "admin" && (
            <Link
              href="/dashboard"
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-surface-card p-5 shadow-card transition-shadow duration-150 hover:shadow-raised"
            >
              <span className="font-medium text-text-primary">ภาพรวมระบบ</span>
              <span className="text-sm text-brand-primary">ดูสถิติ →</span>
            </Link>
          )}
        </div>
      )}

      {/* แถบสัปดาห์นี้ (องค์กร) */}
      <Card className="mt-4">
        <p className="text-sm font-medium text-text-primary">
          ตารางการจองสัปดาห์นี้
        </p>
        <div className="mt-3 grid grid-cols-7 gap-1">
          {data.weekDays.map((d, i) => (
            <div
              key={i}
              className={`rounded-sm p-2 text-center ${
                d.isToday ? "bg-nav-active-surface" : ""
              }`}
            >
              <p className="text-xs text-text-secondary">{d.label}</p>
              <p
                className={`text-sm ${
                  d.isToday
                    ? "font-semibold text-text-primary"
                    : "text-text-primary"
                }`}
              >
                {d.dayOfMonth}
              </p>
              {d.count > 0 ? (
                <p className="text-xs font-semibold text-brand-primary">
                  {d.count.toLocaleString("th-TH")}
                </p>
              ) : (
                <p className="text-xs text-text-muted">—</p>
              )}
            </div>
          ))}
        </div>
        {emptyWeek && (
          <p className="mt-2 text-xs text-text-muted">
            ยังไม่มีการจองในสัปดาห์นี้
          </p>
        )}
        <Link
          href="/calendar"
          className="mt-3 inline-block text-sm text-brand-primary hover:underline"
        >
          ดูปฏิทินทั้งหมด →
        </Link>
      </Card>
    </div>
  );
}
