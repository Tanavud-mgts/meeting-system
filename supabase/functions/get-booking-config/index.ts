import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { NotFoundError } from "../_shared/errors.ts";

Deno.serve(
  withErrorHandling(async (_req: Request) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("system_config")
      .select("office_start_hour, office_end_hour, holidays")
      .single();

    if (error || !data) {
      throw new NotFoundError("ไม่พบข้อมูลการตั้งค่าระบบ");
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
