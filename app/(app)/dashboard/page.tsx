"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/PageHero";

type Stats = {
  bookingPending: number;
  bookingApproved: number;
  bookingCancelRequested: number;
  bookingRejected: number;
  bookingCancelled: number;
  roomAvailable: number;
  roomBusy: number;
  roomMaintenance: number;
  userCount: number;
  approverCount: number;
  adminCount: number;
  pendingAdminApproval: number;
  pendingCancelDecision: number;
};

function formatCount(n: number): string {
  return n.toLocaleString("th-TH");
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-[2px] border border-neutral-200 bg-surface-card p-4">
      <p className="text-sm text-text-secondary">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-7 w-10" />
      ) : (
        <p className="mt-1 font-mono text-xl font-bold text-text-primary">
          {formatCount(value)}
        </p>
      )}
    </div>
  );
}

function HighlightCard({
  href,
  label,
  hint,
  value,
  loading,
}: {
  href: string;
  label: string;
  hint: string;
  value: number;
  loading: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-[2px] border border-l-[3px] border-warning-border border-l-warning-accent bg-warning-surface p-5 transition-colors hover:bg-warning-surface/70"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-text-secondary">{label}</span>
        <span className="text-xs text-warning-text opacity-85">{hint} →</span>
      </div>
      {loading ? (
        <Skeleton className="mt-1 h-8 w-9 bg-warning-border/40" />
      ) : (
        <span className="font-mono text-2xl font-bold text-warning-text">
          {formatCount(value)}
        </span>
      )}
    </Link>
  );
}

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      setLoadError(null);

      const supabase = createClient();

      async function countBookings(
        finalStatus: string,
        currentStep?: number
      ): Promise<number> {
        let query = supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("final_status", finalStatus);
        if (currentStep !== undefined) {
          query = query.eq("current_step", currentStep);
        }
        const { count, error } = await query;
        if (error) throw error;
        return count ?? 0;
      }

      async function countRooms(status: string): Promise<number> {
        const { count, error } = await supabase
          .from("rooms")
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        if (error) throw error;
        return count ?? 0;
      }

      async function countUsers(role: string): Promise<number> {
        const { count, error } = await supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("role", role);
        if (error) throw error;
        return count ?? 0;
      }

      try {
        const [
          bookingPending,
          bookingApproved,
          bookingCancelRequested,
          bookingRejected,
          bookingCancelled,
          bookingCancelledByAdmin,
          roomAvailable,
          roomBusy,
          roomMaintenance,
          userCount,
          approverCount,
          adminCount,
          pendingAdminApproval,
        ] = await Promise.all([
          countBookings("pending"),
          countBookings("approved"),
          countBookings("cancel_requested"),
          countBookings("rejected"),
          countBookings("cancelled"),
          countBookings("cancelled_by_admin"),
          countRooms("available"),
          countRooms("busy"),
          countRooms("maintenance"),
          countUsers("user"),
          countUsers("approver"),
          countUsers("admin"),
          countBookings("pending", 0),
        ]);

        setStats({
          bookingPending,
          bookingApproved,
          bookingCancelRequested,
          bookingRejected,
          bookingCancelled: bookingCancelled + bookingCancelledByAdmin,
          roomAvailable,
          roomBusy,
          roomMaintenance,
          userCount,
          approverCount,
          adminCount,
          pendingAdminApproval,
          pendingCancelDecision: bookingCancelRequested,
        });
      } catch {
        setLoadError("ไม่สามารถโหลดข้อมูลภาพรวมได้");
      }
    }

    loadStats();
  }, []);

  const loading = stats === null && loadError === null;
  // ระหว่างโหลดใช้ค่า 0 ชั่วคราว — Skeleton ทับอยู่แล้ว จึงไม่แสดงตัวเลขนี้จริง
  const s: Stats =
    stats ?? {
      bookingPending: 0,
      bookingApproved: 0,
      bookingCancelRequested: 0,
      bookingRejected: 0,
      bookingCancelled: 0,
      roomAvailable: 0,
      roomBusy: 0,
      roomMaintenance: 0,
      userCount: 0,
      approverCount: 0,
      adminCount: 0,
      pendingAdminApproval: 0,
      pendingCancelDecision: 0,
    };

  return (
    <div className="animate-fade-in-up pb-10">
      <PageHeader
        title="ภาพรวมระบบ"
        subtitle="สถิติการใช้งานและสถานะโดยรวมของระบบ"
        width="max-w-2xl"
      >
        <span className="mt-3 inline-block rounded-[2px] bg-neutral-150 px-2.5 py-0.5 text-xs font-bold text-brand-primary-strong">
          ผู้ดูแลระบบ
        </span>
      </PageHeader>
      <div className="relative mx-auto mt-6 max-w-2xl px-6">

      {loadError && <p className="text-sm text-danger-text">{loadError}</p>}

      {!loadError && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <HighlightCard
              href="/approver"
              label="รอ Admin อนุมัติ"
              hint="ไปหน้าคำขออนุมัติ"
              value={s.pendingAdminApproval}
              loading={loading}
            />
            <HighlightCard
              href="/approver/cancel-requests"
              label="รอพิจารณาคำขอยกเลิก"
              hint="ไปหน้าคำขอยกเลิก"
              value={s.pendingCancelDecision}
              loading={loading}
            />
          </div>

          <section className="mt-6">
            <SectionTitle>การจอง</SectionTitle>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCard
                label="รออนุมัติ"
                value={s.bookingPending}
                loading={loading}
              />
              <StatCard
                label="อนุมัติแล้ว"
                value={s.bookingApproved}
                loading={loading}
              />
              <StatCard
                label="รอพิจารณายกเลิก"
                value={s.bookingCancelRequested}
                loading={loading}
              />
              <StatCard
                label="ถูกปฏิเสธ"
                value={s.bookingRejected}
                loading={loading}
              />
              <StatCard
                label="ยกเลิกแล้ว"
                value={s.bookingCancelled}
                loading={loading}
              />
            </div>
          </section>

          <section className="mt-6">
            <SectionTitle>ห้องประชุม</SectionTitle>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <StatCard label="ว่าง" value={s.roomAvailable} loading={loading} />
              <StatCard label="ไม่ว่าง" value={s.roomBusy} loading={loading} />
              <StatCard
                label="ปิดปรับปรุง"
                value={s.roomMaintenance}
                loading={loading}
              />
            </div>
          </section>

          <section className="mt-6">
            <SectionTitle>ผู้ใช้งาน</SectionTitle>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <StatCard
                label="ผู้ใช้ทั่วไป"
                value={s.userCount}
                loading={loading}
              />
              <StatCard
                label="ผู้อนุมัติ"
                value={s.approverCount}
                loading={loading}
              />
              <StatCard
                label="ผู้ดูแลระบบ"
                value={s.adminCount}
                loading={loading}
              />
            </div>
          </section>
        </>
      )}
      </div>
    </div>
  );
}
