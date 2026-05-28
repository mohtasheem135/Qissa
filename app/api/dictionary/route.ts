import { NextResponse } from "next/server";
import { fetchWiktionaryDefinition } from "@/lib/dictionary/wiktionary";

/**
 * GET /api/dictionary?word=<word>&lang=<isoCode>
 *
 * Proxies the English Wiktionary REST API so the browser doesn't have to
 * worry about CORS or response-size policing. Returns a normalised
 * [DictionaryResult] split into `primary` (matching `lang`) and `others`
 * (other languages found for the same word).
 *
 * Inputs are clamped: words >40 chars and unknown language codes are
 * rejected before any network call. This is an anonymous, idempotent
 * endpoint — no auth, no DB writes — so it leans on Wiktionary's own rate
 * limits and Vercel's edge cache. We also set `Cache-Control` so a popular
 * word served from the same edge hits cache for the rest of the day.
 */

const MAX_WORD_LENGTH = 40;
const LANG_CODE_RE = /^[a-z]{2,3}(-[a-z]{2,4})?$/i;

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const word = (searchParams.get("word") ?? "").trim();
  const lang = (searchParams.get("lang") ?? "en").trim();

  if (word.length === 0) {
    return NextResponse.json({ error: "Missing 'word' query parameter." }, { status: 400 });
  }
  if (word.length > MAX_WORD_LENGTH) {
    return NextResponse.json(
      { error: `Word too long (max ${MAX_WORD_LENGTH} characters).` },
      { status: 400 },
    );
  }
  if (!LANG_CODE_RE.test(lang)) {
    return NextResponse.json({ error: "Invalid language code." }, { status: 400 });
  }

  try {
    const result = await fetchWiktionaryDefinition(word, lang);
    return NextResponse.json(result, {
      headers: {
        // Browsers + intermediaries: cache for 24h, allow 7d stale-while-revalidate.
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lookup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
