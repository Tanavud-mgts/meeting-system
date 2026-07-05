"use client";

import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import thLocale from "@fullcalendar/core/locales/th";
import type { EventClickArg } from "@fullcalendar/core";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

type BookingEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    refId: string;
    roomName: string;
    requesterName: string;
    status: string;
    startTime: string;
    endTime: string;
  };
};

const STATUS_LABEL: Record<string, string> = {
  approved: "อนุมัติแล้ว",
  pending: "รออนุมัติ",
};

type SelectedEvent = BookingEvent["extendedProps"] & { title: string };

export default function CalendarPage() {
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedEvent | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);

      const supabase = createClient();
      const { data, error } = await supabase
        .from("booking_detail")
        .select(
          "id, ref_id, title, final_status, start_time, end_time, room_name, requester_name"
        )
        .in("final_status", ["approved", "pending"]);

      if (error) {
        setLoadError("ไม่สามารถโหลดข้อมูลปฏิทินได้");
        setLoading(false);
        return;
      }

      type Row = {
        id: string;
        ref_id: string;
        title: string;
        final_status: string;
        start_time: string;
        end_time: string;
        room_name: string;
        requester_name: string;
      };

      setEvents(
        ((data ?? []) as Row[]).map((b) => {
          const approved = b.final_status === "approved";
          const color = approved
            ? "var(--color-success-solid)"
            : "var(--color-warning-accent)";
          return {
            id: b.id,
            title: b.title,
            start: b.start_time,
            end: b.end_time,
            backgroundColor: color,
            borderColor: color,
            textColor: approved
              ? "var(--color-text-on-primary)"
              : "var(--color-warning-text)",
            extendedProps: {
              refId: b.ref_id,
              roomName: b.room_name,
              requesterName: b.requester_name,
              status: b.final_status,
              startTime: b.start_time,
              endTime: b.end_time,
            },
          };
        })
      );
      setLoading(false);
    }
    load();
  }, []);

  function handleEventClick(arg: EventClickArg) {
    const props = arg.event.extendedProps as BookingEvent["extendedProps"];
    setSelected({ ...props, title: arg.event.title });
  }

  function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ปฏิทินการจอง
      </h1>

      {loadError && <p className="mt-4 text-sm text-danger-text">{loadError}</p>}

      {loading && (
        <div className="mt-4">
          <Skeleton className="h-[32rem] w-full" />
        </div>
      )}

      {!loading && !loadError && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-surface-card p-4 shadow-card">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale={thLocale}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            events={events}
            eventClick={handleEventClick}
            height="auto"
          />
        </div>
      )}

      <Modal open={selected !== null} onClose={() => setSelected(null)}>
        {selected && (
          <>
            <p className="text-lg font-semibold text-text-primary">
              {selected.title}
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-text-secondary">หมายเลขอ้างอิง</dt>
                <dd className="text-text-primary">{selected.refId}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">ห้อง</dt>
                <dd className="text-text-primary">{selected.roomName}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">ผู้จอง</dt>
                <dd className="text-text-primary">{selected.requesterName}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">ช่วงเวลา</dt>
                <dd className="text-text-primary">
                  {formatDateTime(selected.startTime)} —{" "}
                  {formatDateTime(selected.endTime)}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">สถานะ</dt>
                <dd className="text-text-primary">
                  {STATUS_LABEL[selected.status] ?? selected.status}
                </dd>
              </div>
            </dl>
            <div className="mt-4">
              <Button variant="secondary" onClick={() => setSelected(null)}>
                ปิด
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
