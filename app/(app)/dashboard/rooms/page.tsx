"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHero } from "@/components/ui/PageHero";

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
    <div className="animate-fade-in-up pb-10">
      <PageHero
        title="จัดการห้องประชุม"
        subtitle="เพิ่ม แก้ไข และจัดการสถานะห้องประชุม"
        width="max-w-2xl"
      />
      <div className="relative mx-auto -mt-6 max-w-2xl px-6">
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreateForm}>เพิ่มห้องใหม่</Button>
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

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && (
        <div className="mt-4 space-y-3">
          {rooms.map((r) => (
            <Card key={r.id}>
              <p className="font-medium text-text-primary">{r.name}</p>
              <p className="text-sm text-text-secondary">
                ความจุ {r.capacity} คน — สถานะ:{" "}
                {STATUS_LABEL[r.status] ?? r.status}
              </p>
              {r.equipment.length > 0 && (
                <p className="text-sm text-text-secondary">
                  อุปกรณ์: {r.equipment.join(", ")}
                </p>
              )}
              <div className="mt-3 flex gap-3">
                <Button variant="secondary" onClick={() => openEditForm(r)}>
                  แก้ไข
                </Button>
                <Button variant="danger" onClick={() => handleDeleteClick(r)}>
                  ลบ
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)}>
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
          <Button variant="secondary" onClick={() => setShowForm(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSubmitForm} disabled={submitting}>
            {submitting ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </Modal>

      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        {deleteTarget && (
          <>
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการลบห้อง
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {deleteTarget.name}
            </p>
            <div className="mt-4 flex gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                className="bg-danger-solid hover:bg-danger-solid"
                onClick={handleConfirmDelete}
                disabled={submitting}
              >
                {submitting ? "กำลังลบ..." : "ยืนยันลบ"}
              </Button>
            </div>
          </>
        )}
      </Modal>
      </div>
    </div>
  );
}
