import { toSlug } from "@/lib/utils/slug";

/** Reader URL for a specific (story, variant, part). */
export function variantPartUrl(storyId: string, variantSlug: string, partNumber: number): string {
  return `/s/${storyId}/${variantSlug}/p/${partNumber}`;
}

/** Story landing URL — always at /s/<id>, variants are picked there. */
export function storyLandingUrl(storyId: string): string {
  return `/s/${storyId}`;
}

/**
 * Compose the canonical slug for a variant from its language code + tone name.
 * Mirrors the SQL backfill expression used in 20260524120000_variants_and_requests.sql
 * so any new variant created by the app produces the same shape.
 */
export function composeVariantSlug(targetLanguage: string, toneName: string): string {
  const langPart = targetLanguage.toLowerCase().trim();
  const tonePart = toSlug(toneName);
  return tonePart ? `${langPart}-${tonePart}` : langPart;
}
