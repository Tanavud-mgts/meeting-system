"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: "user" | "approver" | "admin";
  department: string | null;
  phone: string | null;
  staff_id: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  user: "ผู้ใช้ทั่วไป",
  approver: "ผู้อนุมัติ",
  admin: "ผู้ดูแลระบบ",
};

export default function DashboardUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [chainIds, setChainIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [anonymizeTarget, setAnonymizeTarget] = useState<UserRow | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();

    const [usersRes, configRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, full_name, email, role, department, phone, staff_id")
        .order("full_name", { ascending: true }),
      supabase
        .from("system_config")
        .select("admin_id, approver1_id, approver2_id")
        .single(),
    ]);

    if (usersRes.error) {
      setLoadError("ไม่สามารถโหลดรายชื่อผู้ใช้ได้");
      setLoading(false);
      return;
    }

    setUsers((usersRes.data ?? []) as UserRow[]);

    if (configRes.data) {
      setChainIds(
        new Set(
          [
            configRes.data.admin_id,
            configRes.data.approver1_id,
            configRes.data.approver2_id,
          ].filter((id): id is string => id !== null)
        )
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleRoleChange(
    user: UserRow,
    newRole: "user" | "approver" | "admin"
  ) {
    setSavingId(user.id);
    setActionError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ role: newRole })
      .eq("id", user.id);

    setSavingId(null);

    if (error) {
      setActionError("บันทึก role ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadUsers();
  }

  async function handleDepartmentBlur(user: UserRow, newDepartment: string) {
    if (newDepartment === (user.department ?? "")) return;

    setSavingId(user.id);
    setActionError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ department: newDepartment.trim() || null })
      .eq("id", user.id);

    setSavingId(null);

    if (error) {
      setActionError("บันทึกหน่วยงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadUsers();
  }

  async function handleConfirmAnonymize() {
    if (!anonymizeTarget) return;

    setSubmitting(true);
    setActionError(null);

    const supabase = createClient();
    const { error } = await supabase.rpc(
      "anonymize_user_on_delete_request",
      { p_user_id: anonymizeTarget.id }
    );

    setSubmitting(false);
    setAnonymizeTarget(null);

    if (error) {
      setActionError("ลบข้อมูลส่วนตัวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadUsers();
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        จัดการผู้ใช้
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && (
        <div className="mt-4 space-y-3">
          {users.map((u) => (
            <Card key={u.id}>
              <div className="flex items-center gap-3">
                <Avatar name={u.full_name} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">
                    {u.full_name}
                  </p>
                  <p className="truncate text-sm text-text-secondary">
                    {u.email}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm text-text-secondary">
                รหัสบุคลากร: {u.staff_id ?? "—"} · เบอร์โทร: {u.phone ?? "—"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <select
                  value={u.role}
                  disabled={savingId === u.id}
                  onChange={(e) =>
                    handleRoleChange(
                      u,
                      e.target.value as "user" | "approver" | "admin"
                    )
                  }
                  className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
                >
                  <option value="user">{ROLE_LABEL.user}</option>
                  <option value="approver">{ROLE_LABEL.approver}</option>
                  <option value="admin">{ROLE_LABEL.admin}</option>
                </select>
                <input
                  type="text"
                  defaultValue={u.department ?? ""}
                  disabled={savingId === u.id}
                  onBlur={(e) => handleDepartmentBlur(u, e.target.value)}
                  placeholder="หน่วยงาน"
                  className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
                />
                <Button variant="danger" onClick={() => setAnonymizeTarget(u)}>
                  ลบข้อมูลส่วนตัว (PDPA)
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={anonymizeTarget !== null}
        onClose={() => setAnonymizeTarget(null)}
      >
        {anonymizeTarget && (
          <>
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการลบข้อมูลส่วนตัว
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {anonymizeTarget.full_name} ({anonymizeTarget.email})
            </p>
            <p className="mt-2 text-sm text-danger-text">
              การกระทำนี้จะลบชื่อ อีเมล และ LINE ID ของผู้ใช้นี้ถาวร
              กู้คืนไม่ได้ (ประวัติการจองและการอนุมัติยังคงอยู่)
            </p>
            {chainIds.has(anonymizeTarget.id) && (
              <p className="mt-2 text-sm text-warning-text">
                ผู้ใช้นี้เป็นสมาชิกของ Approval Chain ปัจจุบัน
                การลบข้อมูลจะทำให้ขั้นตอนอนุมัตินั้นดำเนินการต่อไม่ได้
                จนกว่าจะเปลี่ยนสมาชิก Chain
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setAnonymizeTarget(null)}
              >
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                className="bg-danger-solid hover:bg-danger-solid"
                onClick={handleConfirmAnonymize}
                disabled={submitting}
              >
                {submitting ? "กำลังลบ..." : "ยืนยันลบข้อมูล"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
