/**
 * Smoke test for the AI provider adapter system.
 * Run with: npx tsx --env-file=.env.local scripts/smoke-translate.ts
 *
 * Hits every configured provider with the same Premchand/Hindi prompt and
 * prints the translation, model used, tokens, and wall-clock latency.
 *
 * No DB writes — purely lib/ai/. Safe to delete.
 */

import { getConfiguredProviders } from "../lib/ai/registry";
import { translate } from "../lib/ai/translate";
import { getComplexityMeta } from "../lib/ai/complexity";

const TEST_INPUT = {
  text: "She walked through the village at dusk, the air heavy with the smell of wet earth and woodsmoke. An old man called out a greeting from his doorway, and she answered without looking back.",
  targetLanguage: "hi",
  targetLanguageNameEnglish: "Hindi",
  targetLanguageNameNative: "हिन्दी",
  toneFragment:
    "Write in the style of Munshi Premchand: simple yet emotionally rich Hindi rooted in rural Indian life, with vivid character portraits, moral undertones, and natural dialogue. Use everyday Hindi-Urdu vocabulary; avoid heavy Sanskrit-derived words.",
  complexityFragment: getComplexityMeta("standard")!.fragment,
};

async function main() {
  const providers = getConfiguredProviders();
  console.log(`Configured providers: ${providers.map((p) => p.name).join(", ") || "(none)"}\n`);

  let failed = 0;
  for (const meta of providers) {
    process.stdout.write(`▸ ${meta.name} (${meta.defaultModel}) ... `);
    const start = performance.now();
    try {
      const result = await translate(meta.id, TEST_INPUT, {
        retry: { delays: [] }, // no retry — fast feedback
      });
      const elapsed = Math.round(performance.now() - start);
      console.log(
        `✅ ${elapsed}ms · tokens=${result.tokensUsed?.input ?? "?"}→${result.tokensUsed?.output ?? "?"}`,
      );
      console.log(`   ${result.translatedText.slice(0, 240)}${result.translatedText.length > 240 ? "…" : ""}\n`);
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      console.log(`❌ ${elapsed}ms`);
      console.log(`   ${err instanceof Error ? err.message : String(err)}\n`);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`${failed} provider(s) failed.`);
    process.exit(1);
  }
  console.log("All configured providers translated successfully.");
}

main().catch((err) => {
  console.error("Smoke test threw:", err);
  process.exit(1);
});
