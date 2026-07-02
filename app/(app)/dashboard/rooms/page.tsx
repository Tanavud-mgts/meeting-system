"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Room = {
  id: string;
  name: string;
  capacity: number;
  status: "available" | "busy" | "maintenance";
  equipment: string[];
};

const STATUS_LABEL: Record<string, string> = {
  available: "ว่าง",
  busy: "ไม่ว่าง",
  maintenance: "ปิดปรับปรุง",
};

export default function DashboardRoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Room | null>(null);
  const [formName, setFormName] = useState("");
  const [formCapacity, setFormCapacity] = useState("");
  const [formStatus, setFormStatus] = useState<
    "available" | "busy" | "maintenance"
  >("available");
  const [formEquipment, setFormEquipment] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadRooms() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("rooms")
      .select("id, name, capacity, status, equipment")
      .order("name", { ascending: true });

    if (error) {
      setLoadError("ไม่สามารถโหลดรายการห้องได้");
      setLoading(false);
      return;
    }

    setRooms((data ?? []) as Room[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRooms();
  }, []);

  function openCreateForm() {
    setEditing(null);
    setFormName("");
    setFormCapacity("");
    setFormStatus("available");
    setFormEquipment("");
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(room: Room) {
    setEditing(room);
    setFormName(room.name);
    setFormCapacity(String(room.capacity));
    setFormStatus(room.status);
    setFormEquipment(room.equipment.join(", "));
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmitForm() {
    const capacityNum = Number(formCapacity);

    if (formName.trim().length === 0) {
      setFormError("กรุณากรอกชื่อห้อง");
      return;
    }

    if (!Number.isInteger(capacityNum) || capacityNum <= 0) {
      setFormError("จำนวนที่นั่งต้องมากกว่า 0");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setActionError(null);

    const supabase = createClient();
    const equipmentArray = formEquipment
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (editing) {
      const { error } = await supabase
        .from("rooms")
        .update({
          name: formName.trim(),
          capacity: capacityNum,
          status: formStatus,
          equipment: equipmentArray,
        })
        .eq("id", editing.id);

      if (error) {
        setFormError("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        setSubmitting(false);
        return;
      }
    } else {
      const { error } = await supabase.from("rooms").insert({
        name: formName.trim(),
        capacity: capacityNum,
        status: formStatus,
        equipment: equipmentArray,
      });

      if (error) {
        setFormError("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    setShowForm(false);
    await loadRooms();
  }

  async function handleDeleteClick(room: Room) {
    setDeleteError(null);
    setActionError(null);

    const supabase = createClient();
    const { count, error } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id);

    if (error) {
      setActionError("ไม่สามารถตรวจสอบประวัติการจองได้");
      return;
    }

    if ((count ?? 0) > 0) {
      setDeleteError(
        "ห้องนี้มีประวัติการจอง ไม่สามารถลบได้ กรุณาเปลี่ยนสถานะเป็น 'ปิดปรับปรุง' แทน"
      );
      return;
    }

    setDeleteTarget(room);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;

    setSubmitting(true);
    setActionError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("rooms")
      .delete()
      .eq("id", deleteTarget.id);

    setSubmitting(false);
    setDeleteTarget(null);

    if (error) {
      setActionError("ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadRooms();
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">
          จัดการห้องประชุม
        </h1>
        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary"
        >
          เพิ่มห้องใหม่
        </button>
      </div>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}
      {deleteError && (
        <p className="mt-4 text-sm text-danger-text">{deleteError}</p>
      )}

      {!loading && rooms.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">ยังไม่มีห้องประชุม</p>
      )}

      <div className="mt-4 space-y-3">
        {rooms.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">{r.name}</p>
            <p className="text-sm text-text-secondary">
              ความจุ {r.capacity} คน — สถานะ: {STATUS_LABEL[r.status] ?? r.status}
            </p>
            {r.equipment.length > 0 && (
              <p className="text-sm text-text-secondary">
                อุปกรณ์: {r.equipment.join(", ")}
              </p>
            )}
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => openEditForm(r)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                แก้ไข
              </button>
              <button
                type="button"
                onClick={() => handleDeleteClick(r)}
                className="rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ลบ
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              {editing ? "แก้ไขห้องประชุม" : "เพิ่มห้องใหม่"}
            </p>
            <div className="mt-3 space-y-3">
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="ชื่อห้อง"
                className="w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
              <input
                type="number"
                value={formCapacity}
                onChange={(e) => setFormCapacity(e.target.value)}
                placeholder="จำนวนที่นั่ง"
                className="w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
              <select
                value={formStatus}
                onChange={(e) =>
                  setFormStatus(
                    e.target.value as "available" | "busy" | "maintenance"
                  )
                }
                className="w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              >
                <option value="available">ว่าง</option>
                <option value="busy">ไม่ว่าง</option>
                <option value="maintenance">ปิดปรับปรุง</option>
              </select>
              <input
                type="text"
                value={formEquipment}
                onChange={(e) => setFormEquipment(e.target.value)}
                placeholder="อุปกรณ์ (คั่นด้วยจุลภาค เช่น projector, whiteboard)"
                className="w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
            </div>
            {formError && (
              <p className="mt-2 text-sm text-danger-text">{formError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSubmitForm}
                disabled={submitting}
                className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
              >
                {submitting ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการลบห้อง
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {deleteTarget.name}
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={submitting}
                className="rounded-sm bg-danger-solid px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
              >
                {submitting ? "กำลังลบ..." : "ยืนยันลบ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
