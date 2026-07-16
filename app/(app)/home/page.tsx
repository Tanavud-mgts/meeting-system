"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { EditorialCard } from "@/components/ui/EditorialCard";
import { StatusMarker } from "@/components/ui/StatusMarker";
import { SectionTitle } from "@/components/ui/PageHero";
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
    <div className="animate-fade-in-up pb-10">
      {/* หัวหน้า — flat editorial */}
      <div className="border-b border-neutral-300 bg-surface-card px-6 pb-5 pt-6">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <Avatar name={data.fullName} size="lg" />
          <div className="min-w-0">
            <p className="text-sm text-text-secondary">ยินดีต้อนรับ</p>
            <p className="truncate text-2xl font-extrabold tracking-tight text-text-primary">
              {data.fullName}
            </p>
            <span className="mt-2 inline-block rounded-[2px] bg-neutral-150 px-2.5 py-0.5 text-xs font-bold text-brand-primary-strong">
              {ROLE_LABEL[data.role] ?? data.role}
            </span>
          </div>
        </div>
      </div>

      <div className="relative mx-auto mt-6 max-w-2xl px-6">

      {/* การ์ดสถานะของฉัน */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <EditorialCard>
          <EditorialCard.Section>
            <p className="text-sm text-text-secondary">การจองถัดไปของฉัน</p>
            {data.nextBooking ? (
              <div className="mt-1">
                <p className="font-bold text-text-primary">
                  {data.nextBooking.title}
                </p>
                <p className="text-sm text-text-secondary">
                  ห้อง {data.nextBooking.room_name}
                </p>
                <p className="font-mono text-sm text-text-secondary">
                  {formatDateTime(data.nextBooking.start_time)}
                </p>
                <div className="mt-2">
                  <StatusMarker
                    tone={STATUS_TONE[data.nextBooking.final_status] ?? "neutral"}
                  >
                    {STATUS_LABEL[data.nextBooking.final_status] ??
                      data.nextBooking.final_status}
                  </StatusMarker>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm text-text-muted">
                ยังไม่มีการจองที่กำลังจะถึง
              </p>
            )}
          </EditorialCard.Section>
        </EditorialCard>

        <EditorialCard>
          <EditorialCard.Section>
            <p className="text-sm text-text-secondary">คำขอที่รออนุมัติของฉัน</p>
            <p className="mt-1 font-mono text-xl font-bold text-text-primary">
              {data.myPendingCount.toLocaleString("th-TH")}
            </p>
            <Link
              href="/booking"
              className="bg-grad-brand shadow-brand mt-3 inline-block rounded-sm px-4 py-2 text-sm font-bold text-text-on-primary transition-transform duration-150 hover:scale-[1.02]"
            >
              จองห้องประชุม
            </Link>
          </EditorialCard.Section>
        </EditorialCard>
      </div>

      {/* การ์ดตามบทบาท */}
      {(data.waitingCount !== null || data.role === "admin") && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.waitingCount !== null && (
            <Link
              href="/approver"
              className="flex flex-col gap-1 rounded-[2px] border border-l-[3px] border-warning-border border-l-warning-accent bg-warning-surface p-5 transition-colors hover:bg-warning-surface/70"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-text-secondary">
                  รอคุณพิจารณา
                </span>
                <span className="text-xs text-warning-text opacity-85">
                  ไปหน้าคำขออนุมัติ →
                </span>
              </div>
              <span className="font-mono text-2xl font-bold text-warning-text">
                {data.waitingCount.toLocaleString("th-TH")}
              </span>
            </Link>
          )}
          {data.role === "admin" && (
            <Link
              href="/dashboard"
              className="flex items-center justify-between rounded-[2px] border border-neutral-300 bg-surface-card p-5 transition-colors hover:bg-neutral-50"
            >
              <span className="font-bold text-text-primary">ภาพรวมระบบ</span>
              <span className="text-sm text-brand-primary">ดูสถิติ →</span>
            </Link>
          )}
        </div>
      )}

      {/* แถบสัปดาห์นี้ (องค์กร) */}
      <EditorialCard className="mt-4">
        <EditorialCard.Section>
          <SectionTitle>ตารางการจองสัปดาห์นี้</SectionTitle>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {data.weekDays.map((d, i) => (
              <div
                key={i}
                className={`rounded-[2px] p-2 text-center ${
                  d.isToday ? "bg-grad-brand shadow-brand" : ""
                }`}
              >
                <p
                  className={`text-xs ${
                    d.isToday ? "text-text-on-hero-muted" : "text-text-secondary"
                  }`}
                >
                  {d.label}
                </p>
                <p
                  className={`font-mono text-sm ${
                    d.isToday
                      ? "font-extrabold text-text-on-primary"
                      : "text-text-primary"
                  }`}
                >
                  {d.dayOfMonth}
                </p>
                {d.count > 0 ? (
                  <p
                    className={`font-mono text-xs font-bold ${
                      d.isToday ? "text-text-on-hero-gold" : "text-brand-primary"
                    }`}
                  >
                    {d.count.toLocaleString("th-TH")}
                  </p>
                ) : (
                  <p
                    className={`text-xs ${
                      d.isToday ? "text-text-on-hero-muted" : "text-text-muted"
                    }`}
                  >
                    —
                  </p>
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
            className="mt-3 inline-block text-sm font-bold text-brand-primary hover:underline"
          >
            ดูปฏิทินทั้งหมด →
          </Link>
        </EditorialCard.Section>
      </EditorialCard>
      </div>
    </div>
  );
}
