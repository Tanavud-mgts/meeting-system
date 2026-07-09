export type IntegrationService =
  | "make_com"
  | "line"
  | "google_calendar"
  | "vercel"
  | "internal"
  | "welpru"
  | "discord";

export type IntegrationStatus = "success" | "failed";

export interface IntegrationLogEntry {
  service: IntegrationService;
  status: IntegrationStatus;
  payload?: Record<string, unknown>;
  error_detail?: string;
}

interface InsertableClient {
  from(table: string): {
    insert(
      row: Record<string, unknown>
    ): Promise<{ error: { message: string } | null }>;
  };
}

export async function logIntegration(
  client: InsertableClient,
  entry: IntegrationLogEntry
): Promise<void> {
  try {
    const { error } = await client.from("integration_health").insert({
      service: entry.service,
      status: entry.status,
      payload: entry.payload ?? null,
      error_detail: entry.error_detail ?? null,
    });

    if (error) {
      console.error(
        "logIntegration: failed to write integration_health row:",
        error.message
      );
    }
  } catch (err) {
    // Promise rejection (e.g., network error, connection down).
    // Swallow the error to maintain the fire-and-forget guarantee
    // for callers like notifyAndLog (which must never throw).
    console.error(
      "logIntegration: insert promise rejected:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
