import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../_shared/errors.ts";

interface ReportStatsBody {
  year: number;
  month?: number; // 1-12, or omitted / 0 for the whole year
}

interface CountRow {
  label: string;
  count: number;
}

interface ReportStatsResult {
  year: number;
  month: number | null;
  roomUtilization: CountRow[];
  byDepartment: CountRow[];
}

// Reports read across every user's bookings and departments. The bookings RLS
// lets approver/admin read all bookings, but the users SELECT policy does not
// let an approver read other users' departments — so aggregation runs here with
// the service-role client, gated to approver/admin, instead of client-side.
Deno.serve(
  withErrorHandling(async (req: Request) => {
    const authHeader = req.headers.get("Authorization") ?? "";

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่");
    }

    const body: ReportStatsBody = await req.json();
    const year = Number(body.year);
    const month =
      body.month === undefined || Number(body.month) === 0
        ? null
        : Number(body.month);

    if (!Number.isInteger(year) || year < 2000 || year > 3000) {
      throw new ValidationError("ปีไม่ถูกต้อง");
    }
    if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
      throw new ValidationError("เดือนไม่ถูกต้อง");
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: caller, error: callerError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (
      callerError ||
      !caller ||
      (caller.role !== "approver" && caller.role !== "admin")
    ) {
      throw new ForbiddenError("ท่านไม่มีสิทธิ์ดำเนินการนี้");
    }

    // Date window for the selected year (and month if given). start_time is
    // timestamptz; string bounds compare correctly.
    const startBound =
      month === null
        ? `${year}-01-01`
        : `${year}-${String(month).padStart(2, "0")}-01`;
    const endBound =
      month === null
        ? `${year + 1}-01-01`
        : month === 12
          ? `${year + 1}-01-01`
          : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    // Room usage = approved bookings in the window.
    const { data, error } = await adminClient
      .from("booking_detail")
      .select("room_name, requester_department, final_status, start_time")
      .eq("final_status", "approved")
      .gte("start_time", startBound)
      .lt("start_time", endBound);

    if (error) throw error;

    type Row = {
      room_name: string | null;
      requester_department: string | null;
      final_status: string;
      start_time: string;
    };

    const rows = (data ?? []) as Row[];

    const roomMap = new Map<string, number>();
    const deptMap = new Map<string, number>();

    for (const row of rows) {
      const room = row.room_name ?? "ไม่ระบุห้อง";
      roomMap.set(room, (roomMap.get(room) ?? 0) + 1);

      const dept = row.requester_department ?? "ไม่ระบุหน่วยงาน";
      deptMap.set(dept, (deptMap.get(dept) ?? 0) + 1);
    }

    const toSortedRows = (map: Map<string, number>): CountRow[] =>
      Array.from(map.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

    const result: ReportStatsResult = {
      year,
      month,
      roomUtilization: toSortedRows(roomMap),
      byDepartment: toSortedRows(deptMap),
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
