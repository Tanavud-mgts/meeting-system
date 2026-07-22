"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/ui/PageHeader";

type ViewMode = "day" | "week" | "month";

type Booking = {
  id: string;
  refId: string;
  title: string;
  status: "approved" | "pending";
  roomId: string;
  roomName: string;
  requesterName: string;
  dateKey: string;
  startMin: number;
  endMin: number;
};

type Room = { id: string; name: string };

type BookingConfig = {
  office_start_hour: number;
  office_end_hour: number;
  holidays: string[];
};

type YMD = { y: number; m: number; d: number };

const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const MABBR = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const DFULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const DABBR = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const WEEKDAY_HEADS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const VIEW_LABEL: Record<ViewMode, string> = {
  day: "วัน",
  week: "สัปดาห์",
  month: "เดือน",
};

const HOUR_HEIGHT = 54;

const STATUS_STYLE = {
  approved: {
    dot: "var(--color-success-accent)",
    barBg: "var(--color-success-surface)",
    barText: "var(--color-success-text)",
    label: "อนุมัติแล้ว",
  },
  pending: {
    dot: "var(--color-warning-accent)",
    barBg: "var(--color-warning-surface)",
    barText: "var(--color-warning-text)",
    label: "รออนุมัติ",
  },
} as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function fmtMin(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
function keyOf(o: YMD): string {
  return `${o.y}-${pad(o.m + 1)}-${pad(o.d)}`;
}
function fromDate(dt: Date): YMD {
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}
function addDays(o: YMD, n: number): YMD {
  return fromDate(new Date(o.y, o.m, o.d + n));
}
function addMonths(o: YMD, n: number): YMD {
  return fromDate(new Date(o.y, o.m + n, 1));
}
function dow(o: YMD): number {
  return new Date(o.y, o.m, o.d).getDay();
}
function weekStart(o: YMD): YMD {
  return addDays(o, -((dow(o) + 6) % 7));
}
function fullDateLabel(o: YMD): string {
  return `${DFULL[dow(o)]} ${o.d} ${MONTHS[o.m]} ${o.y + 543}`;
}
function timeShort(b: Booking): string {
  return `${fmtMin(b.startMin)}–${fmtMin(b.endMin)}`;
}

/** จัดเลนให้ event ที่เวลาทับซ้อนกันแสดงเคียงข้างกันในคอลัมน์เดียว */
function packLanes(items: Booking[]): {
  booking: Booking;
  lane: number;
  laneCount: number;
}[] {
  const list = items
    .slice()
    .sort((a, b) => a.startMin - b.startMin)
    .map((booking) => ({ booking, lane: 0, laneCount: 1 }));
  const laneEnds: number[] = [];
  for (const it of list) {
    let placed = false;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= it.booking.startMin) {
        it.lane = i;
        laneEnds[i] = it.booking.endMin;
        placed = true;
        break;
      }
    }
    if (!placed) {
      it.lane = laneEnds.length;
      laneEnds.push(it.booking.endMin);
    }
  }
  const n = Math.max(1, laneEnds.length);
  for (const it of list) it.laneCount = n;
  return list;
}

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>("month");
  const [cur, setCur] = useState<YMD>(() => fromDate(new Date()));
  const [roomFilter, setRoomFilter] = useState("all");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [config, setConfig] = useState<BookingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      setIsMobile(mq.matches);
      if (mq.matches) setView((v) => (v === "month" ? "day" : v));
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const [bookingsRes, roomsRes, configRes] = await Promise.all([
        supabase
          .from("booking_detail")
          .select(
            "id, ref_id, title, final_status, start_time, end_time, room_id, room_name, requester_name"
          )
          .in("final_status", ["approved", "pending"]),
        supabase.from("rooms").select("id, name").order("name"),
        session
          ? fetch(
              `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-booking-config`,
              { headers: { Authorization: `Bearer ${session.access_token}` } }
            ).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (bookingsRes.error || roomsRes.error || !configRes?.ok) {
        setLoadError("ไม่สามารถโหลดข้อมูลปฏิทินได้ กรุณาลองใหม่อีกครั้ง");
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
        room_id: string;
        room_name: string;
        requester_name: string;
      };

      setBookings(
        ((bookingsRes.data ?? []) as Row[]).map((b) => {
          const st = new Date(b.start_time);
          const en = new Date(b.end_time);
          const dateKey = keyOf(fromDate(st));
          // การจองข้ามวัน (ข้อมูลเก่า) แสดงเฉพาะวันแรกจนถึงสิ้นวัน
          const sameDay = dateKey === keyOf(fromDate(en));
          return {
            id: b.id,
            refId: b.ref_id,
            title: b.title,
            status: b.final_status === "approved" ? "approved" : "pending",
            roomId: b.room_id,
            roomName: b.room_name,
            requesterName: b.requester_name,
            dateKey,
            startMin: st.getHours() * 60 + st.getMinutes(),
            endMin: sameDay ? en.getHours() * 60 + en.getMinutes() : 24 * 60,
          };
        })
      );
      setRooms((roomsRes.data ?? []) as Room[]);
      setConfig(await configRes.json());
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(
    () =>
      bookings.filter((b) => roomFilter === "all" || b.roomId === roomFilter),
    [bookings, roomFilter]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of filtered) {
      const list = map.get(b.dateKey) ?? [];
      list.push(b);
      map.set(b.dateKey, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startMin - b.startMin);
    }
    return map;
  }, [filtered]);

  const todayKey = keyOf(fromDate(new Date()));
  const buddhistYear = cur.y + 543;

  function go(dir: number) {
    if (view === "month") setCur(addMonths(cur, dir));
    else if (view === "week") setCur(addDays(cur, dir * 7));
    else setCur(addDays(cur, dir));
  }

  let rangeLabel: string;
  if (view === "month") {
    rangeLabel = `${MONTHS[cur.m]} ${buddhistYear}`;
  } else if (view === "week") {
    const ws = weekStart(cur);
    const we = addDays(ws, 6);
    rangeLabel = `${ws.d} ${MABBR[ws.m]} – ${we.d} ${MABBR[we.m]} ${buddhistYear}`;
  } else {
    rangeLabel = fullDateLabel(cur);
  }

  const isAgenda = isMobile;
  const isMonth = !isAgenda && view === "month";
  const isGrid = !isAgenda && (view === "week" || view === "day");

  // ===== Month grid =====
  const weeks = useMemo(() => {
    if (!isMonth) return [];
    const first = { y: cur.y, m: cur.m, d: 1 };
    const start = weekStart(first);
    const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
    const offset = (dow(first) + 6) % 7;
    const nWeeks = Math.ceil((offset + daysInMonth) / 7);
    const rows: {
      ymd: YMD;
      key: string;
      inMonth: boolean;
      isToday: boolean;
      events: Booking[];
    }[][] = [];
    for (let w = 0; w < nWeeks; w++) {
      const days = [];
      for (let d = 0; d < 7; d++) {
        const cell = addDays(start, w * 7 + d);
        const key = keyOf(cell);
        days.push({
          ymd: cell,
          key,
          inMonth: cell.m === cur.m,
          isToday: key === todayKey,
          events: byDay.get(key) ?? [],
        });
      }
      rows.push(days);
    }
    return rows;
  }, [isMonth, cur, byDay, todayKey]);

  // ===== Timeline (สัปดาห์/วัน) =====
  const startHour = config?.office_start_hour ?? 0;
  const endHour = config?.office_end_hour ?? 0;
  const gridHeight = Math.max(0, endHour - startHour) * HOUR_HEIGHT;

  const hourMarks = useMemo(() => {
    const marks = [];
    for (let h = startHour; h <= endHour; h++) {
      marks.push({ label: fmtMin(h * 60), top: (h - startHour) * HOUR_HEIGHT });
    }
    return marks;
  }, [startHour, endHour]);

  type Column = {
    key: string;
    title: string;
    sub: string | null;
    isToday: boolean;
    blocks: {
      booking: Booking;
      sub: string;
      top: number;
      height: number;
      left: number;
      width: number;
    }[];
  };

  const columns = useMemo<Column[]>(() => {
    if (!isGrid || !config) return [];
    const dayStartMin = startHour * 60;
    const dayEndMin = endHour * 60;

    const mkBlocks = (items: Booking[], sub: (b: Booking) => string) =>
      packLanes(
        items.filter((b) => b.endMin > dayStartMin && b.startMin < dayEndMin)
      ).map(({ booking, lane, laneCount }) => {
        const top =
          ((Math.max(booking.startMin, dayStartMin) - dayStartMin) / 60) *
          HOUR_HEIGHT;
        const bottom =
          ((Math.min(booking.endMin, dayEndMin) - dayStartMin) / 60) *
          HOUR_HEIGHT;
        return {
          booking,
          sub: sub(booking),
          top,
          height: Math.max(18, bottom - top - 3),
          left: lane * (100 / laneCount),
          width: 100 / laneCount,
        };
      });

    if (view === "day") {
      const ck = keyOf(cur);
      const dayBookings = byDay.get(ck) ?? [];
      const visibleRooms =
        roomFilter === "all" ? rooms : rooms.filter((r) => r.id === roomFilter);
      return visibleRooms.map((r) => ({
        key: r.id,
        title: r.name,
        sub: null,
        isToday: false,
        blocks: mkBlocks(
          dayBookings.filter((b) => b.roomId === r.id),
          (b) => b.requesterName
        ),
      }));
    }

    const ws = weekStart(cur);
    const cols: Column[] = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(ws, d);
      const ck = keyOf(day);
      cols.push({
        key: ck,
        title: DABBR[dow(day)],
        sub: `${day.d} ${MABBR[day.m]}`,
        isToday: ck === todayKey,
        blocks: mkBlocks(byDay.get(ck) ?? [], (b) => b.roomName),
      });
    }
    return cols;
  }, [isGrid, config, view, cur, byDay, rooms, roomFilter, startHour, endHour, todayKey]);

  // ===== Agenda (มือถือ) =====
  const agendaGroups = useMemo(() => {
    if (!isAgenda) return [];
    let dates: YMD[] = [];
    if (view === "day") {
      dates = [cur];
    } else if (view === "week") {
      const ws = weekStart(cur);
      for (let d = 0; d < 7; d++) dates.push(addDays(ws, d));
    } else {
      const dim = new Date(cur.y, cur.m + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) dates.push({ y: cur.y, m: cur.m, d });
    }
    return dates
      .map((dt) => ({ label: fullDateLabel(dt), items: byDay.get(keyOf(dt)) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [isAgenda, view, cur, byDay]);

  const selectedStyle = selected ? STATUS_STYLE[selected.status] : null;
  const selectedYMD = selected
    ? (() => {
        const [y, m, d] = selected.dateKey.split("-").map(Number);
        return { y, m: m - 1, d };
      })()
    : null;

  return (
    <div className="animate-fade-in-up pb-16">
      <PageHeader
        title="ภาพรวมการจองห้องประชุม"
        subtitle="ดูตารางการใช้ห้องประชุมทั้งหมดแบบวัน สัปดาห์ และเดือน"
        width="max-w-5xl"
      />
      <div className="relative mx-auto mt-6 max-w-5xl px-6">

      {loadError && <p className="mb-4 text-sm text-danger-text">{loadError}</p>}

      {loading && (
        <div>
          <Skeleton className="h-[32rem] w-full" />
        </div>
      )}

      {!loading && !loadError && (
        <>
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-neutral-300 bg-surface-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => go(-1)}
                  aria-label="ช่วงก่อนหน้า"
                  className="h-[34px] w-[34px] cursor-pointer rounded-sm border border-neutral-300 bg-surface-field text-md text-text-secondary hover:bg-neutral-100"
                >
                  ‹
                </button>
                <button
                  onClick={() => setCur(fromDate(new Date()))}
                  className="h-[34px] cursor-pointer rounded-sm border border-neutral-300 bg-surface-field px-3.5 text-base font-semibold text-neutral-700 hover:bg-neutral-100"
                >
                  วันนี้
                </button>
                <button
                  onClick={() => go(1)}
                  aria-label="ช่วงถัดไป"
                  className="h-[34px] w-[34px] cursor-pointer rounded-sm border border-neutral-300 bg-surface-field text-md text-text-secondary hover:bg-neutral-100"
                >
                  ›
                </button>
              </div>
              <div className="min-w-[160px] text-lg font-bold text-text-primary">
                {rangeLabel}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex rounded-md bg-neutral-100 p-[3px]">
                {(["day", "week", "month"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`h-[30px] cursor-pointer rounded-sm px-3.5 text-sm font-bold ${
                      view === v
                        ? "bg-brand-primary text-text-on-primary"
                        : "text-text-secondary"
                    }`}
                  >
                    {VIEW_LABEL[v]}
                  </button>
                ))}
              </div>
              <select
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
                aria-label="กรองตามห้อง"
                className="h-9 cursor-pointer rounded-md border border-neutral-300 bg-surface-field px-2.5 text-base"
              >
                <option value="all">ทุกห้อง</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Legend */}
          <div className="mb-3.5 flex flex-wrap items-center gap-4 px-1 text-sm text-text-secondary">
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded border-l-[3px] border-success-accent bg-success-surface" />
              อนุมัติแล้ว
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded border-l-[3px] border-warning-accent bg-warning-surface" />
              รออนุมัติ
            </span>
          </div>

          {/* มุมมองเดือน */}
          {isMonth && (
            <div className="overflow-hidden rounded-[2px] border border-neutral-300 bg-surface-card">
              <div className="grid grid-cols-7 border-b border-neutral-150 bg-neutral-50">
                {WEEKDAY_HEADS.map((wd) => (
                  <div
                    key={wd}
                    className="px-1.5 py-2.5 text-center text-sm font-semibold text-text-secondary"
                  >
                    {wd}
                  </div>
                ))}
              </div>
              {weeks.map((days, wi) => (
                <div
                  key={wi}
                  className="grid grid-cols-7 border-b border-neutral-100 last:border-b-0"
                >
                  {days.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => {
                        setView("day");
                        setCur(c.ymd);
                      }}
                      className={`flex min-h-[104px] cursor-pointer flex-col gap-1 border-r border-neutral-100 p-1.5 pb-2 text-left last:border-r-0 ${
                        c.inMonth ? "bg-surface-card" : "bg-surface-sunken"
                      }`}
                    >
                      <span className="flex items-center justify-between">
                        <span
                          className={`flex h-[25px] w-[25px] items-center justify-center rounded-pill text-sm font-semibold ${
                            c.isToday
                              ? "bg-brand-primary text-text-on-primary"
                              : c.inMonth
                                ? "text-text-primary"
                                : "text-neutral-400"
                          }`}
                        >
                          {c.ymd.d}
                        </span>
                        <span className="flex gap-1">
                          {c.events.some((b) => b.status === "approved") && (
                            <span className="rounded-sm bg-success-surface px-1.5 text-xs font-bold text-success-text">
                              {c.events.filter((b) => b.status === "approved").length}
                            </span>
                          )}
                          {c.events.some((b) => b.status === "pending") && (
                            <span className="rounded-sm bg-warning-surface px-1.5 text-xs font-bold text-warning-text">
                              {c.events.filter((b) => b.status === "pending").length}
                            </span>
                          )}
                        </span>
                      </span>
                      {c.events.slice(0, 2).map((b) => (
                        <span
                          key={b.id}
                          className="overflow-hidden text-ellipsis whitespace-nowrap rounded px-1.5 py-0.5 text-xs leading-snug"
                          style={{
                            background: STATUS_STYLE[b.status].barBg,
                            color: STATUS_STYLE[b.status].barText,
                            borderLeft: `3px solid ${STATUS_STYLE[b.status].dot}`,
                          }}
                        >
                          {fmtMin(b.startMin)} {b.roomName}
                        </span>
                      ))}
                      {c.events.length > 2 && (
                        <span className="text-xs text-text-muted">
                          +{c.events.length - 2} เพิ่มเติม
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* มุมมองสัปดาห์/วัน (timeline) */}
          {isGrid && (
            <div className="overflow-hidden rounded-[2px] border border-neutral-300 bg-surface-card">
              <div className="flex border-b border-neutral-150 bg-neutral-50">
                <div className="w-14 flex-none" />
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className={`min-w-0 flex-1 border-l border-neutral-100 px-1.5 py-2 text-center ${
                      col.isToday ? "bg-brand-primary/10" : ""
                    }`}
                  >
                    <div
                      className={`overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold ${
                        col.isToday
                          ? "text-brand-primary-strong"
                          : "text-text-primary"
                      }`}
                    >
                      {col.title}
                    </div>
                    {col.sub && (
                      <div className="text-xs text-text-muted">{col.sub}</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex">
                <div
                  className="relative w-14 flex-none"
                  style={{ height: gridHeight }}
                >
                  {hourMarks.map((h) => (
                    <div
                      key={h.label}
                      className="absolute right-2 -translate-y-1.5 text-xs text-text-muted"
                      style={{ top: h.top }}
                    >
                      {h.label}
                    </div>
                  ))}
                </div>
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className="relative min-w-0 flex-1 border-l border-neutral-100"
                    style={{
                      height: gridHeight,
                      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT - 1}px, var(--color-neutral-100) ${HOUR_HEIGHT - 1}px, var(--color-neutral-100) ${HOUR_HEIGHT}px)`,
                    }}
                  >
                    {col.blocks.map((b) => (
                      <button
                        key={b.booking.id}
                        onClick={() => setSelected(b.booking)}
                        className="absolute cursor-pointer overflow-hidden rounded-sm px-1.5 py-1 text-left"
                        style={{
                          top: b.top,
                          height: b.height,
                          left: `${b.left}%`,
                          width: `${b.width}%`,
                          background: STATUS_STYLE[b.booking.status].barBg,
                          borderLeft: `3px solid ${STATUS_STYLE[b.booking.status].dot}`,
                          color: STATUS_STYLE[b.booking.status].barText,
                        }}
                      >
                        <div className="whitespace-nowrap text-xs font-semibold">
                          {timeShort(b.booking)}
                        </div>
                        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold leading-tight">
                          {b.booking.title}
                        </div>
                        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs opacity-80">
                          {b.sub}
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* มุมมองรายการ (มือถือ) */}
          {isAgenda && (
            <div className="flex flex-col gap-4">
              {agendaGroups.map((g) => (
                <div key={g.label}>
                  <div className="mx-0.5 mb-2 text-base font-bold text-neutral-700">
                    {g.label}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {g.items.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setSelected(b)}
                        className="flex cursor-pointer items-start gap-3 rounded-[2px] border border-neutral-300 bg-surface-card p-3 text-left"
                        style={{
                          borderLeft: `4px solid ${STATUS_STYLE[b.status].dot}`,
                        }}
                      >
                        <span className="whitespace-nowrap pt-px text-sm font-bold text-neutral-700">
                          {timeShort(b)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-md font-bold text-text-primary">
                            {b.title}
                          </span>
                          <span className="mt-0.5 block text-sm text-text-secondary">
                            {b.roomName} · {b.requesterName}
                          </span>
                        </span>
                        <span
                          className="flex-none rounded-pill px-2 py-0.5 text-xs font-bold"
                          style={{
                            background: STATUS_STYLE[b.status].barBg,
                            color: STATUS_STYLE[b.status].barText,
                          }}
                        >
                          {STATUS_STYLE[b.status].label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {agendaGroups.length === 0 && (
                <div className="rounded-md border border-dashed border-neutral-300 bg-surface-card px-5 py-9 text-center text-md text-text-muted">
                  ไม่มีการจองในช่วงนี้
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Modal open={selected !== null} onClose={() => setSelected(null)}>
        {selected && selectedStyle && selectedYMD && (
          <>
            <div
              className="-mx-6 -mt-6 mb-4 h-[7px] rounded-t-xl"
              style={{ background: selectedStyle.dot }}
            />
            <div className="flex items-start justify-between gap-3">
              <div>
                <span
                  className="rounded-pill px-2.5 py-0.5 text-xs font-bold"
                  style={{
                    background: selectedStyle.barBg,
                    color: selectedStyle.barText,
                  }}
                >
                  {selectedStyle.label}
                </span>
                <h2 className="mt-2.5 text-xl font-bold leading-snug text-text-primary">
                  {selected.title}
                </h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="ปิด"
                className="h-8 w-8 flex-none cursor-pointer rounded-sm bg-neutral-100 text-md text-text-secondary hover:bg-neutral-150"
              >
                ✕
              </button>
            </div>
            <dl className="mt-3.5 flex flex-col gap-2.5 border-t border-neutral-100 pt-4 text-base">
              <div className="flex gap-2.5">
                <dt className="w-[78px] flex-none text-text-muted">ห้อง</dt>
                <dd className="font-semibold text-text-primary">
                  {selected.roomName}
                </dd>
              </div>
              <div className="flex gap-2.5">
                <dt className="w-[78px] flex-none text-text-muted">ผู้จอง</dt>
                <dd className="text-text-primary">{selected.requesterName}</dd>
              </div>
              <div className="flex gap-2.5">
                <dt className="w-[78px] flex-none text-text-muted">วันที่</dt>
                <dd className="text-text-primary">
                  {fullDateLabel(selectedYMD)}
                </dd>
              </div>
              <div className="flex gap-2.5">
                <dt className="w-[78px] flex-none text-text-muted">เวลา</dt>
                <dd className="text-text-primary">{timeShort(selected)} น.</dd>
              </div>
              <div className="flex gap-2.5">
                <dt className="w-[78px] flex-none text-text-muted">
                  รหัสอ้างอิง
                </dt>
                <dd className="font-mono text-neutral-700">{selected.refId}</dd>
              </div>
            </dl>
          </>
        )}
      </Modal>
      </div>
    </div>
  );
}
