import type { TranslationInput } from "./types";

const CONTEXT_TAIL_CHARS = 1500;

/**
 * Build the (system, user) pair that every provider receives. Providers
 * that don't support a separate system message (Gemini) concatenate them
 * internally — the structure here is the source of truth.
 *
 * Order matters: putting OUTPUT RULES last is intentional, so the model
 * sees the formatting constraints right before it sees the user text.
 */
export function buildTranslationPrompt(input: TranslationInput): {
  system: string;
  user: string;
} {
  const sections: string[] = [];

  sections.push(
    `You are a literary translator. Translate the user's text into ${input.targetLanguageNameEnglish} (${input.targetLanguageNameNative}).`,
  );

  sections.push(`STYLE INSTRUCTIONS:\n${input.toneFragment.trim()}`);

  sections.push(`COMPLEXITY:\n${input.complexityFragment.trim()}`);

  if (input.customInstructions && input.customInstructions.trim().length > 0) {
    sections.push(`ADDITIONAL INSTRUCTIONS:\n${input.customInstructions.trim()}`);
  }

  if (input.previousPartContext && input.previousPartContext.trim().length > 0) {
    const tail = input.previousPartContext.slice(-CONTEXT_TAIL_CHARS).trim();
    sections.push(
      `PREVIOUS PART CONTEXT (for consistency in character names, terminology, and tone):\n"""\n${tail}\n"""\n\nMaintain consistency with the above. Use the same translations for character names, place names, and recurring phrases.`,
    );
  }

  if (input.glossary && input.glossary.length > 0) {
    const lines = input.glossary
      .map((entry) => `- "${entry.original}" → "${entry.translated}"`)
      .join("\n");
    sections.push(
      `GLOSSARY (use these exact translations for the listed terms):\n${lines}`,
    );
  }

  sections.push(
    [
      "OUTPUT RULES:",
      "- Preserve paragraph breaks exactly (one paragraph in = one paragraph out).",
      "- Do not add any commentary, preface, or explanation.",
      "- Do not include the original text in your response.",
      "- Output ONLY the translation, nothing else.",
      "- If the input is short, the output should be short.",
      "- Keep dialogue marked as dialogue in the target language's convention.",
    ].join("\n"),
  );

  return {
    system: sections.join("\n\n"),
    user: input.text,
  };
}
