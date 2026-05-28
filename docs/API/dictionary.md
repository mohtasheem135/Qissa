# `/api/dictionary`

> Tap-to-define lookup. Proxies the English Wiktionary REST API so the reader can offer a one-tap definition popover without dealing with CORS, response-size policing, or upstream UA headers from the browser.

**Anonymous · idempotent · cacheable.** No auth, no DB writes — leans on Wiktionary's rate limits and Vercel's edge cache.

---

## Endpoint

```
GET /api/dictionary?word=<word>&lang=<isoCode>
```

| Param | Type | Required | Notes |
|---|---|---|---|
| `word` | string | yes | Trimmed; max 40 chars |
| `lang` | string | no (default `en`) | ISO 639-1-ish (`hi`, `ur`, `ar`, `bn-IN`); must match `^[a-z]{2,3}(-[a-z]{2,4})?$` (case-insensitive) |

**Response cache:** `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` — popular words served from the same edge stay cached for the day, with a week of SWR.

---

## Response

Success — `200 OK`:

```ts
type DictionaryResult = {
  word: string;
  requestedLanguage: string;
  primary: DictionarySection[];   // sections matching `lang`
  others: DictionarySection[];    // sections from other languages (English first, then alpha)
  source: "wiktionary";
  sourceUrl: string;              // https://en.wiktionary.org/wiki/<word>
  empty: boolean;                 // true when primary + others have no senses
};

type DictionarySection = {
  languageCode: string;
  languageName: string;           // e.g. "Hindi", "English"
  partOfSpeech: string;           // e.g. "Noun"
  senses: { definition: string; examples?: string[] }[];
};
```

Shape lives in [lib/dictionary/types.ts](../../lib/dictionary/types.ts) (client-safe, no `server-only` taint) so [DefinitionPopover](../../components/reader/DefinitionPopover.tsx) imports it directly.

**Empty result (Wiktionary 404 or no senses):** `{ ..., empty: true }` with `sourceUrl` still set so the popover can offer a "Search Wiktionary" link. The endpoint **does not 404** — clients treat `empty: true` as "no definition found."

---

## Error codes

| Status | Reason |
|---|---|
| 400 | Missing `word`, word too long (>40 chars), or invalid `lang` code |
| 502 | Upstream Wiktionary failure (timeout, non-200 that isn't 404, oversized response) |

Error body: `{ error: string }`.

---

## Upstream details

- **Endpoint:** `https://en.wiktionary.org/api/rest_v1/page/definition/<title>`
- **UA header:** `QissaReader/1.0 (https://qissa-opal.vercel.app)` — Wikimedia blocks anonymous requests that don't identify.
- **Timeout:** 6s via `AbortController`.
- **Size cap:** 200 kB — streamed via `getReader()` and aborted past the cap so an unbounded upstream can't blow up memory.
- **HTML in definitions:** the popover strips tags client-side (see `stripHtml` in [DefinitionPopover.tsx](../../components/reader/DefinitionPopover.tsx)). v0 renders plain text; future polish can render a small allowlist of `<a>` / `<i>` / `<b>`.

Source file: [lib/dictionary/wiktionary.ts](../../lib/dictionary/wiktionary.ts).

---

## How the reader calls it

1. Reader taps a word in [ReaderBody](../../components/reader/ReaderBody.tsx).
2. `Intl.Segmenter(targetLanguage, { granularity: 'word' })` resolves the word at the tap point — handles Devanagari / Arabic / Tamil etc. correctly.
3. The resolved word + variant's `target_language` are sent to this endpoint.
4. Response opens in [DefinitionPopover](../../components/reader/DefinitionPopover.tsx) anchored to the word's bounding rect.
5. "Save word" stores `{ word, languageCode, savedAt, storyId, variantSlug, partNumber }` in `qissa:vocab` localStorage — surfaced at [`/my-words`](../../app/(public)/my-words/page.tsx).

See [UI/reader.md](../UI/reader.md) for the reader-side details and [INTERNALS/reader-state.md](../INTERNALS/reader-state.md) for the vocab store shape.
