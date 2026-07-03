"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ภาพรวมระบบ
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}

      {stats && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/approver"
              className="rounded-lg border border-warning-border bg-warning-surface p-5"
            >
              <p className="text-sm text-text-secondary">รอ Admin อนุมัติ</p>
              <p className="text-2xl font-semibold text-warning-text">
                {stats.pendingAdminApproval}
              </p>
            </Link>
            <Link
              href="/approver/cancel-requests"
              className="rounded-lg border border-warning-border bg-warning-surface p-5"
            >
              <p className="text-sm text-text-secondary">
                รอพิจารณาคำขอยกเลิก
              </p>
              <p className="text-2xl font-semibold text-warning-text">
                {stats.pendingCancelDecision}
              </p>
            </Link>
          </div>

          <div className="mt-6">
            <p className="font-medium text-text-primary">การจอง</p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">รออนุมัติ</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingPending}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">อนุมัติแล้ว</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingApproved}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">
                  รอพิจารณายกเลิก
                </p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingCancelRequested}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ถูกปฏิเสธ</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingRejected}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ยกเลิกแล้ว</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingCancelled}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <p className="font-medium text-text-primary">ห้องประชุม</p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ว่าง</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.roomAvailable}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ไม่ว่าง</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.roomBusy}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ปิดปรับปรุง</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.roomMaintenance}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <p className="font-medium text-text-primary">ผู้ใช้งาน</p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ผู้ใช้ทั่วไป</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.userCount}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ผู้อนุมัติ</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.approverCount}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ผู้ดูแลระบบ</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.adminCount}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
