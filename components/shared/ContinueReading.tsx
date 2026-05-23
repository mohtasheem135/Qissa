"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StoryCard, type StoryCardData } from "@/components/shared/StoryCard";
import { createClient } from "@/lib/supabase/client";
import { getLastRead, type LastRead } from "@/lib/reader/progress";

type State =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "loaded"; story: StoryCardData; lastRead: LastRead };

/**
 * Reads the last-read pointer from localStorage on mount, fetches the
 * matching story (RLS-gated to published), and renders a Resume card.
 * State transitions only happen in async callbacks so React 19's
 * `react-hooks/set-state-in-effect` lint stays happy.
 */
export function ContinueReading() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const stored = getLastRead();

    if (!stored) {
      // No last-read — flip to `none` via a microtask so the setState is
      // not synchronous within the effect body.
      Promise.resolve().then(() => {
        if (!cancelled) setState({ kind: "none" });
      });
      return () => {
        cancelled = true;
      };
    }

    const supabase = createClient();
    supabase
      .from("stories")
      .select(
        `id, title_original, title_translated, cover_image_url, total_parts,
         estimated_reading_minutes,
         language:languages!inner ( name_english, font_family, font_family_reading ),
         tone:tones!inner ( name )`,
      )
      .eq("id", stored.storyId)
      .eq("status", "published")
      .eq("is_active", true)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) {
          setState({ kind: "none" });
          return;
        }
        const story: StoryCardData = {
          id: data.id,
          title_original: data.title_original,
          title_translated: data.title_translated,
          cover_image_url: data.cover_image_url,
          total_parts: data.total_parts,
          estimated_reading_minutes: data.estimated_reading_minutes,
          language_name_english: data.language?.name_english ?? "",
          language_font_family: data.language?.font_family ?? null,
          language_font_family_reading: data.language?.font_family_reading ?? null,
          tone_name: data.tone?.name ?? null,
        };
        setState({ kind: "loaded", story, lastRead: stored });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind !== "loaded") return null;

  return (
    <section aria-labelledby="continue-reading" className="space-y-3">
      <div className="flex items-end justify-between">
        <h2 id="continue-reading" className="text-lg font-semibold tracking-tight">
          Continue reading
        </h2>
        <Button asChild variant="link" size="sm" className="text-muted-foreground">
          <Link href={`/s/${state.story.id}/p/${state.lastRead.partNumber}`}>
            Resume Part {state.lastRead.partNumber} →
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        <StoryCard story={state.story} />
      </div>
    </section>
  );
}
