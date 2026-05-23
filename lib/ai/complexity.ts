/**
 * The five fixed complexity levels (docs/01-requirements.md §3.5).
 *
 * Kept as a const map — not a database table — because it is small, stable,
 * and tightly coupled to the prompt structure.
 */

export type ComplexityKey = "daily" | "simple" | "standard" | "advanced" | "scholarly";

export interface ComplexityMeta {
  key: ComplexityKey;
  label: string;
  /** Fragment injected into the AI prompt's COMPLEXITY section. */
  fragment: string;
}

export const COMPLEXITY_LEVELS: ReadonlyArray<ComplexityMeta> = [
  {
    key: "daily",
    label: "Daily / Conversational",
    fragment:
      "Use everyday spoken vocabulary that any literate adult uses in conversation. Avoid literary or archaic words.",
  },
  {
    key: "simple",
    label: "Simple Literary",
    fragment:
      "Use clear, accessible literary language. Sentences should flow naturally. Avoid jargon and rare words.",
  },
  {
    key: "standard",
    label: "Standard Literary",
    fragment:
      "Use rich literary vocabulary appropriate for educated readers. Balance accessibility with depth.",
  },
  {
    key: "advanced",
    label: "Advanced / Classical",
    fragment:
      "Use sophisticated, classical vocabulary including less common words. Embrace literary register and complex sentence structures.",
  },
  {
    key: "scholarly",
    label: "Scholarly / Archaic",
    fragment:
      "Use the most refined, scholarly vocabulary including rare, archaic, and Sanskrit/Persian/Arabic-derived words as appropriate. Aim for the register of classical literature.",
  },
];

export function getComplexityMeta(key: string): ComplexityMeta | undefined {
  return COMPLEXITY_LEVELS.find((c) => c.key === key);
}
