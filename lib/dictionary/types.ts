/**
 * Shared types for the dictionary feature. Lives in its own file so both
 * the server-only fetcher and the client popover can import shapes without
 * the client picking up a `server-only` taint.
 */

export type DictionarySource = "wiktionary";

export interface DictionarySense {
  /** Single definition / gloss line. May contain inline `<a>` tags from Wiktionary. */
  definition: string;
  /** Optional example sentences associated with this sense. */
  examples?: string[];
}

export interface DictionarySection {
  /** ISO 639-1 (or similar) language code returned by the source. */
  languageCode: string;
  /** Human-readable language name from the source (e.g. "Hindi", "English"). */
  languageName: string;
  /** "Noun", "Verb", "Adjective" — passed through from the source. */
  partOfSpeech: string;
  senses: DictionarySense[];
}

export interface DictionaryResult {
  word: string;
  /** ISO code the caller asked for; sections are split into primary / others. */
  requestedLanguage: string;
  /** Sections for the language the caller asked for. */
  primary: DictionarySection[];
  /** Sections from other languages — useful for loanwords / cognates. */
  others: DictionarySection[];
  source: DictionarySource;
  /** External URL the popover links to (the Wiktionary page). */
  sourceUrl: string;
  /** True when neither primary nor others has any senses. */
  empty: boolean;
}

export interface DictionaryErrorResponse {
  error: string;
}
