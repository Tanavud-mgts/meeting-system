import { defineConfig } from "vitest/config";

// Unit tests target the Deno-flavored shared modules in supabase/functions.
// Those files use `import type { SupabaseClient } from "npm:..."` (type-only,
// stripped at transform time so the npm: specifier is never resolved) and
// relative imports with explicit `.ts` extensions, both of which Vite/esbuild
// handle. The app tsconfig excludes supabase/functions from typecheck; vitest
// runs its own transform, so there is no conflict.
export default defineConfig({
  test: {
    environment: "node",
    include: ["supabase/functions/**/*.test.ts"],
  },
});
