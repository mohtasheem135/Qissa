import "server-only";
import type {
  DictionaryResult,
  DictionarySection,
  DictionarySense,
} from "./types";

/**
 * Fetches a word's definitions from the English Wiktionary REST API.
 *
 * Endpoint:
 *   GET https://en.wiktionary.org/api/rest_v1/page/definition/<title>
 *
 * Response shape: an object keyed by language code (`en`, `hi`, `ur`, …),
 * each value an array of part-of-speech sections with `definitions[].definition`
 * (an HTML fragment). Example:
 *
 *   {
 *     "en": [{ "partOfSpeech": "Noun", "language": "English",
 *              "definitions": [{ "definition": "..." }] }],
 *     "hi": [...]
 *   }
 *
 * We split the response into `primary` (matching the requested language) and
 * `others` (everything else). Callers render the primary section first and
 * collapse the others.
 */

const ENDPOINT = "https://en.wiktionary.org/api/rest_v1/page/definition";

// Conservative size cap: a single rare word can legitimately return ~80kB
// (lots of senses + examples). Beyond that we treat the response as
// unreasonable and bail rather than buffering arbitrary upstream data.
const MAX_RESPONSE_BYTES = 200_000;

const FETCH_TIMEOUT_MS = 6_000;

type RawSense = {
  definition?: unknown;
  examples?: unknown;
};

type RawSection = {
  partOfSpeech?: unknown;
  language?: unknown;
  definitions?: unknown;
};

type RawResponse = Record<string, unknown>;

export async function fetchWiktionaryDefinition(
  word: string,
  requestedLanguage: string,
): Promise<DictionaryResult> {
  const normalisedWord = word.trim();
  if (normalisedWord.length === 0) {
    throw new Error("word cannot be empty");
  }

  const title = encodeURIComponent(normalisedWord);
  const url = `${ENDPOINT}/${title}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      // Wiktionary's REST API requires a UA. They block anonymous requests
      // that don't identify themselves.
      headers: {
        "user-agent": "QissaReader/1.0 (https://qissa-opal.vercel.app)",
        accept: "application/json",
      },
      signal: controller.signal,
      // Cache for 24h at the edge — definitions don't change often, and the
      // service worker doesn't cover /api/* (network-only).
      next: { revalidate: 60 * 60 * 24 },
    });
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("dictionary lookup timed out");
    }
    throw e;
  }
  clearTimeout(timeout);

  if (response.status === 404) {
    return emptyResult(normalisedWord, requestedLanguage);
  }
  if (!response.ok) {
    throw new Error(`Wiktionary returned ${response.status}`);
  }

  const bodyText = await readWithLimit(response, MAX_RESPONSE_BYTES);

  let parsed: RawResponse;
  try {
    parsed = JSON.parse(bodyText) as RawResponse;
  } catch {
    throw new Error("invalid JSON from Wiktionary");
  }

  const primary: DictionarySection[] = [];
  const others: DictionarySection[] = [];

  for (const [langCode, rawSections] of Object.entries(parsed)) {
    if (!Array.isArray(rawSections)) continue;
    const sections = (rawSections as RawSection[])
      .map((s) => normaliseSection(s, langCode))
      .filter((s): s is DictionarySection => s !== null);
    if (langCode.toLowerCase() === requestedLanguage.toLowerCase()) {
      primary.push(...sections);
    } else {
      others.push(...sections);
    }
  }

  // Stable order for `others`: English first (most useful gloss), then alpha.
  others.sort((a, b) => {
    if (a.languageCode === "en" && b.languageCode !== "en") return -1;
    if (b.languageCode === "en" && a.languageCode !== "en") return 1;
    return a.languageName.localeCompare(b.languageName);
  });

  const empty =
    primary.every((s) => s.senses.length === 0) &&
    others.every((s) => s.senses.length === 0);

  return {
    word: normalisedWord,
    requestedLanguage,
    primary,
    others,
    source: "wiktionary",
    sourceUrl: `https://en.wiktionary.org/wiki/${title}`,
    empty,
  };
}

function normaliseSection(raw: RawSection, langCode: string): DictionarySection | null {
  const partOfSpeech = typeof raw.partOfSpeech === "string" ? raw.partOfSpeech : "";
  const languageName = typeof raw.language === "string" ? raw.language : langCode;
  const senses: DictionarySense[] = [];

  if (Array.isArray(raw.definitions)) {
    for (const rawSense of raw.definitions as RawSense[]) {
      const definition = typeof rawSense.definition === "string" ? rawSense.definition : "";
      if (!definition) continue;
      const examples: string[] = [];
      if (Array.isArray(rawSense.examples)) {
        for (const ex of rawSense.examples) {
          if (typeof ex === "string" && ex.length > 0) examples.push(ex);
        }
      }
      const sense: DictionarySense = { definition };
      if (examples.length > 0) sense.examples = examples;
      senses.push(sense);
    }
  }

  if (senses.length === 0) return null;
  return { languageCode: langCode, languageName, partOfSpeech, senses };
}

function emptyResult(word: string, requestedLanguage: string): DictionaryResult {
  return {
    word,
    requestedLanguage,
    primary: [],
    others: [],
    source: "wiktionary",
    sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
    empty: true,
  };
}

/**
 * Streams a Response body until we hit `maxBytes`, then aborts. Prevents an
 * upstream that ignores `accept` headers from blowing up the route's memory.
 */
async function readWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return await response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("dictionary response exceeded size limit");
    }
    chunks.push(value);
  }
  // Concatenate and decode once at the end.
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(buf);
}
