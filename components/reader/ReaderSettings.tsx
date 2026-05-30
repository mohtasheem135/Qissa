"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { listVoicesForLanguage } from "@/lib/reader/speech";
import { THEMES, THEME_KEYS, type ReaderTheme } from "@/lib/reader/themes";
import type {
  Alignment,
  FontVariant,
  LineHeight,
  ReaderSettings,
} from "@/lib/reader/reader-settings";

/** Sentinel Select value for "no preference" (empty string isn't allowed). */
const AUTO_VOICE = "__auto__";

interface ReaderSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ReaderSettings;
  onChange: (next: ReaderSettings) => void;
  /** True when the part actually has an original text we can show. */
  originalAvailable: boolean;
  /** ISO code of the translated text — scopes the narration-voice picker. */
  targetLanguage: string | null;
}

/**
 * Modal sheet of reader preferences. Uses a Dialog (not a Sheet) for
 * simplicity — the dialog auto-centers and works well on mobile too.
 */
export function ReaderSettingsSheet({
  open,
  onOpenChange,
  settings,
  onChange,
  originalAvailable,
  targetLanguage,
}: ReaderSettingsSheetProps) {
  function update<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  // Installed device voices for this language. Voices load asynchronously, so
  // re-read when `voiceschanged` fires (and only while the sheet is open).
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!open || !targetLanguage) return;
    let cancelled = false;
    const refresh = () => {
      if (!cancelled) setVoices(listVoicesForLanguage(targetLanguage));
    };
    Promise.resolve().then(refresh);
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (synth && "onvoiceschanged" in synth) {
      synth.addEventListener("voiceschanged", refresh);
      return () => {
        cancelled = true;
        synth.removeEventListener("voiceschanged", refresh);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [open, targetLanguage]);

  const selectedVoiceURI = targetLanguage
    ? settings.narrationVoiceByLang[targetLanguage] ?? AUTO_VOICE
    : AUTO_VOICE;

  function handleVoiceChange(value: string) {
    if (!targetLanguage) return;
    const next = { ...settings.narrationVoiceByLang };
    if (value === AUTO_VOICE) {
      delete next[targetLanguage];
    } else {
      next[targetLanguage] = value;
    }
    update("narrationVoiceByLang", next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reader settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Theme */}
          <section className="space-y-3">
            <Label>Theme</Label>
            <div className="grid grid-cols-5 gap-2">
              {THEME_KEYS.map((key) => (
                <ThemeSwatch
                  key={key}
                  theme={key}
                  active={settings.theme === key}
                  onClick={() => update("theme", key)}
                />
              ))}
            </div>
          </section>

          {/* Line height */}
          <section className="space-y-2">
            <Label>Line spacing</Label>
            <SegmentedControl<LineHeight>
              value={settings.lineHeight}
              onChange={(v) => update("lineHeight", v)}
              options={[
                { value: "compact", label: "Compact" },
                { value: "normal", label: "Normal" },
                { value: "relaxed", label: "Relaxed" },
              ]}
            />
          </section>

          {/* Alignment */}
          <section className="space-y-2">
            <Label>Alignment</Label>
            <SegmentedControl<Alignment>
              value={settings.alignment}
              onChange={(v) => update("alignment", v)}
              options={[
                { value: "left", label: "Left" },
                { value: "justify", label: "Justify" },
              ]}
            />
          </section>

          {/* Font */}
          <section className="space-y-2">
            <Label>Font</Label>
            <SegmentedControl<FontVariant>
              value={settings.fontVariant}
              onChange={(v) => update("fontVariant", v)}
              options={[
                { value: "serif", label: "Serif" },
                { value: "sans", label: "Sans" },
              ]}
            />
          </section>

          {/* Show original */}
          <section className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="show-original">Show original text</Label>
              <p className="text-muted-foreground text-xs">
                {originalAvailable
                  ? "Display each original paragraph below its translation."
                  : "Original not available for this part."}
              </p>
            </div>
            <Switch
              id="show-original"
              checked={settings.showOriginal && originalAvailable}
              onCheckedChange={(checked) => update("showOriginal", checked)}
              disabled={!originalAvailable}
            />
          </section>

          {/* Narration voice (Web Speech fallback only) */}
          {targetLanguage && voices.length > 0 ? (
            <section className="space-y-2">
              <Label>Narration voice</Label>
              <Select value={selectedVoiceURI} onValueChange={handleVoiceChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_VOICE}>Auto (default)</SelectItem>
                  {voices.map((v) => (
                    <SelectItem key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Used for device narration when a part has no studio audio.
              </p>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ThemeSwatch({
  theme,
  active,
  onClick,
}: {
  theme: ReaderTheme;
  active: boolean;
  onClick: () => void;
}) {
  const vars = THEMES[theme].vars;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${THEMES[theme].label} theme`}
      className={`flex aspect-square flex-col items-stretch overflow-hidden rounded-md border-2 transition-all ${
        active ? "border-primary scale-105" : "border-transparent"
      }`}
      style={{ backgroundColor: vars["--reader-bg"] }}
    >
      <span className="flex flex-1 items-center justify-center text-xl" style={{ color: vars["--reader-text"] }}>
        Aa
      </span>
      <span
        className="block py-0.5 text-center text-[9px] font-medium"
        style={{
          backgroundColor: vars["--reader-chrome-bg"],
          color: vars["--reader-text-muted"],
        }}
      >
        {THEMES[theme].label}
      </span>
    </button>
  );
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}

function SegmentedControl<T extends string>({ value, onChange, options }: SegmentedControlProps<T>) {
  return (
    <div className="bg-muted/40 inline-flex w-full rounded-md border p-0.5">
      {options.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          variant={value === opt.value ? "default" : "ghost"}
          size="sm"
          onClick={() => onChange(opt.value)}
          className="flex-1"
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
