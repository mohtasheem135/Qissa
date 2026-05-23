/**
 * One-off smoke test for the Supabase wiring.
 * Run with: npx tsx --env-file=.env.local scripts/smoke-supabase.ts
 *
 * Verifies:
 *   - Anon client can SELECT seeded languages (public read policy)
 *   - Anon client can SELECT seeded tones (public read policy)
 *   - Anon client CANNOT SELECT ai_config (RLS blocks the anon role)
 *   - Service-role client CAN SELECT ai_config (bypasses RLS)
 *   - Types are wired: tones.prompt_fragment is typed as `string`
 *
 * This file is NOT shipped — it's a developer sanity check. Safe to delete.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const anon = createSupabaseClient<Database>(url, anonKey);
const admin = createSupabaseClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  let failed = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "✅" : "❌"} ${label}${detail ? "  " + detail : ""}`);
    if (!ok) failed++;
  };

  // 1. Anon read languages
  {
    const { data, error } = await anon
      .from("languages")
      .select("code, name_native, direction")
      .order("display_order");
    check(
      "anon: read languages",
      !error && (data?.length ?? 0) >= 13,
      error ? error.message : `(${data?.length} rows; first=${data?.[0]?.code})`,
    );
  }

  // 2. Anon read tones
  {
    const { data, error } = await anon
      .from("tones")
      .select("name, language_code, prompt_fragment")
      .eq("language_code", "hi")
      .limit(1);
    const tone = data?.[0];
    const promptIsString: boolean = typeof tone?.prompt_fragment === "string";
    check(
      "anon: read tones (Hindi)",
      !error && promptIsString,
      error ? error.message : `(${tone?.name}: ${tone?.prompt_fragment?.slice(0, 60)}…)`,
    );
  }

  // 3. Anon BLOCKED from ai_config (no SELECT policy => 0 rows under RLS)
  {
    const { data, error } = await anon.from("ai_config").select("*");
    check(
      "anon: ai_config blocked by RLS",
      !error && (data?.length ?? 0) === 0,
      error ? error.message : `(${data?.length} rows visible — expected 0)`,
    );
  }

  // 4. Service role CAN read ai_config
  {
    const { data, error } = await admin.from("ai_config").select("*");
    check(
      "service-role: ai_config visible",
      !error && (data?.length ?? 0) === 1,
      error ? error.message : `(provider=${data?.[0]?.default_provider})`,
    );
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll Supabase smoke checks passed.");
}

main().catch((err) => {
  console.error("Smoke test threw:", err);
  process.exit(1);
});
