/**
 * SSR-safe Web Speech (speechSynthesis) helper — the free narration fallback
 * used by [ListenButton](../../components/reader/ListenButton.tsx) when no
 * pre-generated R2 audio exists for a part.
 *
 * Two quirks this works around:
 *   1. Voices load asynchronously (the `voiceschanged` event), so we resolve
 *      the voice at play() time rather than at module load.
 *   2. Chromium stops long utterances after ~15s. We chunk the text into
 *      short sentence-sized utterances and queue them so narration runs to
 *      the end regardless of length.
 *
 * Availability and voice coverage differ per platform — iOS Safari and
 * Android Chrome expose different voice sets, and some languages have none.
 * Callers should hide the fallback when no voice matches the language.
 */

/** Approximate per-utterance char budget — keeps each chunk well under the bug threshold. */
const CHUNK_TARGET = 200;

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Current voice list (may be empty until `voiceschanged` fires). */
function getVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return [];
  return window.speechSynthesis.getVoices();
}

/** True when at least one installed voice matches the app language code. */
export function hasVoiceForLanguage(languageCode: string | null): boolean {
  if (!languageCode || !isSpeechSupported()) return false;
  const voices = getVoices();
  // Voices may not be loaded yet; treat "unknown" as "maybe available" so we
  // don't hide the control prematurely on first paint.
  if (voices.length === 0) return true;
  return voices.some((v) => v.lang.toLowerCase().startsWith(languageCode.toLowerCase()));
}

/**
 * Every installed voice matching the language code (prefix or base-language
 * match), for the reader's "Narration voice" picker. Empty until voices load.
 */
export function listVoicesForLanguage(languageCode: string | null): SpeechSynthesisVoice[] {
  if (!languageCode) return [];
  const code = languageCode.toLowerCase();
  return getVoices().filter((v) => {
    const lang = v.lang.toLowerCase();
    return lang.startsWith(code) || lang.split(/[-_]/)[0] === code;
  });
}

/**
 * Resolve the voice to narrate with. A `preferredVoiceURI` (the reader's saved
 * per-language choice) wins when it still exists; otherwise we fall back to the
 * first installed voice that matches the language.
 */
function pickVoice(
  languageCode: string | null,
  preferredVoiceURI?: string | null,
): SpeechSynthesisVoice | null {
  if (!languageCode) return null;
  const code = languageCode.toLowerCase();
  const voices = getVoices();
  if (preferredVoiceURI) {
    const preferred = voices.find((v) => v.voiceURI === preferredVoiceURI);
    if (preferred) return preferred;
  }
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(code)) ??
    voices.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === code) ??
    null
  );
}

/** Split text into short, sentence-aware chunks for reliable playback. */
function chunkText(text: string): string[] {
  const pieces = text
    .replace(/\s+/g, " ")
    .split(/(?<=[।.!?…॥])\s+/) // includes Devanagari danda / double danda
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current.length + piece.length + 1 > CHUNK_TARGET && current) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export interface SpeechController {
  play(): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export interface SpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

/**
 * Build a controller that narrates `text` in `languageCode`. The controller
 * owns its own utterance queue; call stop() before discarding it (e.g. on
 * unmount or part change) to cancel any in-flight speech.
 */
export function createSpeechController(
  text: string,
  languageCode: string | null,
  callbacks: SpeechCallbacks = {},
  rate = 1,
  preferredVoiceURI?: string | null,
): SpeechController {
  const chunks = chunkText(text);
  let index = 0;
  let stopped = false;

  function speakNext() {
    if (stopped || !isSpeechSupported()) return;
    if (index >= chunks.length) {
      callbacks.onEnd?.();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    const voice = pickVoice(languageCode, preferredVoiceURI);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else if (languageCode) {
      utterance.lang = languageCode;
    }
    utterance.rate = rate;
    utterance.onend = () => {
      index += 1;
      speakNext();
    };
    utterance.onerror = (event) => {
      // "interrupted"/"canceled" are expected on stop() — don't surface them.
      if (event.error && event.error !== "interrupted" && event.error !== "canceled") {
        callbacks.onError?.(event.error);
      }
    };
    window.speechSynthesis.speak(utterance);
  }

  return {
    play() {
      if (!isSpeechSupported()) {
        callbacks.onError?.("Speech synthesis is not available on this device.");
        return;
      }
      stopped = false;
      index = 0;
      window.speechSynthesis.cancel(); // clear any prior queue
      callbacks.onStart?.();
      speakNext();
    },
    pause() {
      if (isSpeechSupported()) window.speechSynthesis.pause();
    },
    resume() {
      if (isSpeechSupported()) window.speechSynthesis.resume();
    },
    stop() {
      stopped = true;
      if (isSpeechSupported()) window.speechSynthesis.cancel();
    },
  };
}
