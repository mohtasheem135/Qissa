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
  if (input.task === "narrate") return buildNarrationPrompt(input);

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

/**
 * Narration-director prompt (task === "narrate"). The model receives text that
 * is ALREADY in the target language and rewrites it into an expressive script
 * for text-to-speech — same wording and meaning, only delivery is shaped.
 *
 * Crucially it must NOT translate, summarise, or emit bracketed stage
 * directions that a TTS engine would read aloud. Emotion is carried entirely by
 * punctuation, ellipses, em-dashes, paragraph breaks, and `<break time="…"/>`
 * SSML-style pauses — the only tag both Sarvam bulbul:v2 and ElevenLabs
 * multilingual_v2 honour silently.
 */
function buildNarrationPrompt(input: TranslationInput): { system: string; user: string } {
  const sections: string[] = [];

  sections.push(
    `You are a narration director preparing ${input.targetLanguageNameEnglish} (${input.targetLanguageNameNative}) literary text for an audiobook text-to-speech engine. The text is already in ${input.targetLanguageNameEnglish} — do NOT translate it.`,
  );

  sections.push(
    `STYLE INSTRUCTIONS (the voice you are shaping):\n${input.toneFragment.trim()}`,
  );

  sections.push(
    [
      "YOUR TASK:",
      "Rewrite the text into an expressive narration script. Keep every word, name, and meaning faithful — this is the SAME text, only re-punctuated for spoken delivery.",
      "Guide pacing and emotion ONLY with:",
      "- ellipses (…) for hesitation or trailing off,",
      "- em-dashes (—) for sharp breaks or interruptions,",
      "- paragraph breaks for scene/beat changes,",
      "- and `<break time=\"0.6s\"/>` style pause tags where a longer silence helps (use sparingly: 0.3s–1.2s).",
    ].join("\n"),
  );

  sections.push(
    [
      "OUTPUT RULES:",
      "- Do NOT translate or change the language of the text.",
      "- Do NOT add, remove, summarise, or reorder content — keep the wording.",
      "- Do NOT add narrator notes, stage directions, or bracketed cues like [softly] or (pause) that would be read aloud. The ONLY allowed tag is `<break time=\"…\"/>`.",
      "- Preserve the meaning of every sentence; you may adjust punctuation only.",
      "- Output ONLY the narration script, nothing else — no preface or commentary.",
    ].join("\n"),
  );

  return {
    system: sections.join("\n\n"),
    user: input.text,
  };
}
