import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../_shared/errors.ts";

interface UpdateApprovalChainBody {
  admin_id: string;
  approver1_id: string;
  approver2_id: string;
  office_start_hour: number;
  office_end_hour: number;
  holidays: string[];
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

    const body: UpdateApprovalChainBody = await req.json();

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
      throw new ForbiddenError("ท่านไม่มีสิทธิ์แก้ไขการตั้งค่านี้");
    }

    const {
      admin_id,
      approver1_id,
      approver2_id,
      office_start_hour,
      office_end_hour,
      holidays,
    } = body;

    const chainIds = [admin_id, approver1_id, approver2_id];
    if (new Set(chainIds).size !== chainIds.length) {
      throw new ValidationError("ผู้อนุมัติในแต่ละขั้นตอนต้องไม่ซ้ำกัน");
    }

    const { data: chainUsers, error: chainUsersError } = await adminClient
      .from("users")
      .select("id, role")
      .in("id", chainIds);

    if (chainUsersError) throw chainUsersError;

    const findRole = (id: string) =>
      chainUsers?.find((u) => u.id === id)?.role;

    if (
      findRole(admin_id) !== "admin" ||
      !["approver", "admin"].includes(findRole(approver1_id) ?? "") ||
      !["approver", "admin"].includes(findRole(approver2_id) ?? "")
    ) {
      throw new ValidationError("ผู้ที่เลือกต้องมีสิทธิ์ Approver หรือ Admin");
    }

    if (
      typeof office_start_hour !== "number" ||
      typeof office_end_hour !== "number" ||
      office_start_hour < 0 ||
      office_end_hour > 23 ||
      office_start_hour >= office_end_hour
    ) {
      throw new ValidationError("เวลาเปิดทำการต้องน้อยกว่าเวลาปิดทำการ");
    }

    const { data: config, error: configError } = await adminClient
      .from("system_config")
      .select("id")
      .single();

    if (configError || !config) {
      throw new ValidationError("ไม่พบข้อมูลการตั้งค่าระบบ");
    }

    const { data: updated, error: updateError } = await adminClient
      .from("system_config")
      .update({
        admin_id,
        approver1_id,
        approver2_id,
        office_start_hour,
        office_end_hour,
        holidays,
      })
      .eq("id", config.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
