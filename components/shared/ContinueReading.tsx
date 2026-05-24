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
 * Reads the variant-scoped last-read pointer from localStorage on mount,
 * fetches the matching story + variant (RLS-gated to published+active), and
 * renders a Resume card. State transitions only happen in async callbacks
 * so React 19's `react-hooks/set-state-in-effect` lint stays happy.
 */
export function ContinueReading() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const stored = getLastRead();

    if (!stored) {
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
        `id, title_original, cover_image_url, total_parts,
         variants:story_variants!inner (
           slug, title_translated, estimated_reading_minutes,
           language:languages!inner ( name_english, font_family, font_family_reading ),
           tone:tones!inner ( name )
         )`,
      )
      .eq("id", stored.storyId)
      .eq("variants.slug", stored.variantSlug)
      .eq("variants.status", "published")
      .eq("variants.is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const variant = data?.variants?.[0];
        if (!data || !variant) {
          setState({ kind: "none" });
          return;
        }
        const story: StoryCardData = {
          id: data.id,
          variant_slug: variant.slug,
          title_original: data.title_original,
          title_translated: variant.title_translated,
          cover_image_url: data.cover_image_url,
          total_parts: data.total_parts,
          estimated_reading_minutes: variant.estimated_reading_minutes,
          language_name_english: variant.language?.name_english ?? "",
          language_font_family: variant.language?.font_family ?? null,
          language_font_family_reading: variant.language?.font_family_reading ?? null,
          tone_name: variant.tone?.name ?? null,
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
          <Link
            href={`/s/${state.story.id}/${state.lastRead.variantSlug}/p/${state.lastRead.partNumber}`}
          >
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
