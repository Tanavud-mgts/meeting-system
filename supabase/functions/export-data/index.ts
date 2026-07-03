import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../_shared/errors.ts";

type Dataset = "bookings" | "approval_history" | "users";

interface ExportDataBody {
  dataset: Dataset;
}

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.map(csvEscape).join(",");
  const dataLines = rows.map((row) =>
    headers.map((h) => csvEscape(row[h])).join(",")
  );
  return [headerLine, ...dataLines].join("\r\n");
}

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

    const body: ExportDataBody = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: caller, error: callerError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerError || !caller || caller.role !== "admin") {
      throw new ForbiddenError("ท่านไม่มีสิทธิ์ดำเนินการนี้");
    }

    if (
      body.dataset !== "bookings" &&
      body.dataset !== "approval_history" &&
      body.dataset !== "users"
    ) {
      throw new ValidationError("ประเภทข้อมูลไม่ถูกต้อง");
    }

    let headers: string[];
    let rows: Record<string, unknown>[];

    if (body.dataset === "bookings") {
      const { data, error } = await adminClient
        .from("booking_detail")
        .select(
          "ref_id, title, room_name, requester_name, requester_department, final_status, start_time, end_time, attendees, created_at"
        );
      if (error) throw error;
      headers = [
        "ref_id",
        "title",
        "room_name",
        "requester_name",
        "requester_department",
        "final_status",
        "start_time",
        "end_time",
        "attendees",
        "created_at",
      ];
      rows = data ?? [];
    } else if (body.dataset === "approval_history") {
      const { data, error } = await adminClient
        .from("staff_activity_timeline")
        .select("actor_name, related_ref, sub_type, detail, occurred_at")
        .eq("event_type", "approval");
      if (error) throw error;
      headers = [
        "actor_name",
        "related_ref",
        "sub_type",
        "detail",
        "occurred_at",
      ];
      rows = data ?? [];
    } else {
      const { data, error } = await adminClient
        .from("users")
        .select("full_name, email, role, department, created_at");
      if (error) throw error;
      headers = ["full_name", "email", "role", "department", "created_at"];
      rows = data ?? [];
    }

    const csv = toCsv(headers, rows);
    const dateStr = new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
      .replace(/-/g, "");

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${body.dataset}-${dateStr}.csv"`,
      },
    });
  })
);
