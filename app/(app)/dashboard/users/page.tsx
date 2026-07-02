"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: "user" | "approver" | "admin";
  department: string | null;
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
        .select("id, full_name, email, role, department")
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
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        จัดการผู้ใช้
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      <div className="mt-4 space-y-3">
        {users.map((u) => (
          <div
            key={u.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">{u.full_name}</p>
            <p className="text-sm text-text-secondary">{u.email}</p>
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
              <button
                type="button"
                onClick={() => setAnonymizeTarget(u)}
                className="rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ลบข้อมูลส่วนตัว (PDPA)
              </button>
            </div>
          </div>
        ))}
      </div>

      {anonymizeTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
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
              <button
                type="button"
                onClick={() => setAnonymizeTarget(null)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmAnonymize}
                disabled={submitting}
                className="rounded-sm bg-danger-solid px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
              >
                {submitting ? "กำลังลบ..." : "ยืนยันลบข้อมูล"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
