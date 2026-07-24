// Test-only mock of the Supabase query builder used by processApproval /
// processCancellation. Not imported by any Edge Function — only by *.test.ts.
//
// The real modules chain calls like:
//   client.from("bookings").select("...").eq("id", x).single()          -> { data, error }
//   client.from("approval_logs").insert({...})                          -> { error }
//   client.from("bookings").update({...}).eq("id", x)                   -> { error }
//   client.from("bookings").update({...}).eq(...).eq(...).select("id")  -> { data, error }
//
// Every builder method returns the same thenable builder, so awaiting at any
// terminal point invokes the per-test `responder` with the accumulated state.

export type DbOp = "select" | "insert" | "update";

export interface DbCallContext {
  table: string;
  op: DbOp;
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
  single: boolean;
}

export interface DbResponse {
  data?: unknown;
  error?: unknown;
}

export type Responder = (ctx: DbCallContext) => DbResponse;

export interface MockClient {
  // Cast to SupabaseClient at the call site (`as never` / `as any`); vitest does
  // not type-check, and the real param type is a type-only import.
  client: unknown;
  calls: DbCallContext[];
}

export function makeClient(responder: Responder): MockClient {
  const calls: DbCallContext[] = [];

  function from(table: string) {
    const state: DbCallContext = {
      table,
      op: "select",
      payload: undefined,
      filters: [],
      single: false,
    };

    const builder = {
      select(_cols?: string) {
        return builder;
      },
      insert(payload: Record<string, unknown>) {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      eq(key: string, value: unknown) {
        state.filters.push([key, value]);
        return builder;
      },
      gt(key: string, value: unknown) {
        state.filters.push([key, value]);
        return builder;
      },
      gte(key: string, value: unknown) {
        state.filters.push([key, value]);
        return builder;
      },
      lt(key: string, value: unknown) {
        state.filters.push([key, value]);
        return builder;
      },
      order(_key: string, _opts?: unknown) {
        return builder;
      },
      single() {
        state.single = true;
        return builder;
      },
      then(
        onFulfilled: (value: DbResponse) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) {
        let promise: Promise<DbResponse>;
        try {
          const res = responder({ ...state });
          calls.push({ ...state });
          promise = Promise.resolve(res);
        } catch (err) {
          promise = Promise.reject(err);
        }
        return promise.then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  return { client: { from }, calls };
}
