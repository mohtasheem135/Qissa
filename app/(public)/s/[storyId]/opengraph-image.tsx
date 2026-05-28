import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { coverUrl } from "@/lib/imagekit/url";
import { toTitleCase } from "@/lib/utils/title-case";

/**
 * Per-story Open Graph image — 1200×630.
 *
 * Co-locating `opengraph-image.tsx` next to the page auto-wires the
 * `og:image` meta tag for `/s/[storyId]`. The Twitter card meta is wired
 * via the sibling [twitter-image.tsx], which simply re-exports from here.
 *
 * Composition:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  STORY                                                  │
 *   │                                                         │
 *   │  ┌──────────┐   {Title in large}                         │
 *   │  │   cover  │   by {Author}                              │
 *   │  │ 360×480  │                                            │
 *   │  └──────────┘   [HI · UR · TA · +N more]                 │
 *   │                                                         │
 *   │                                              QISSA       │
 *   └─────────────────────────────────────────────────────────┘
 *
 * No custom fonts loaded — relies on Edge runtime's system stack. Cover
 * image is fetched from ImageKit at a 360×480 transform so we never push
 * the full hero image through the renderer.
 */

export const alt = "Qissa — Stories, translated with soul.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ storyId: string }>;
}

export default async function Image({ params }: Props) {
  const { storyId } = await params;

  const supabase = await createClient();
  const { data: story } = await supabase
    .from("stories")
    .select(
      `title_original, author_original, cover_image_url,
       variants:story_variants!inner (
         is_primary,
         language:languages!inner ( name_english )
       )`,
    )
    .eq("id", storyId)
    .eq("status", "published")
    .eq("is_active", true)
    .eq("variants.status", "published")
    .eq("variants.is_active", true)
    .maybeSingle();

  // Fallback OG (unknown story / unpublished) — keep it on-brand so a stale
  // link still produces a clean preview rather than the social platform
  // showing its own broken-image placeholder.
  if (!story) return brandFallback();

  const title = toTitleCase(story.title_original);
  const author = story.author_original ?? null;
  // `c-at_max` fits the source inside the box while preserving its natural
  // aspect — combined with `objectFit: contain` on the <img>, the whole
  // cover renders without cropping regardless of upload aspect (portrait,
  // square, landscape). Slightly larger than the slot for retina sharpness.
  const cover = coverUrl(story.cover_image_url, "w-760,h-1020,c-at_max");

  // Primary first, then alphabetical, deduped, limited to four pills.
  const langSet = new Set<string>();
  const langs: string[] = [];
  const variants = [...(story.variants ?? [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );
  for (const v of variants) {
    const name = v.language?.name_english;
    if (!name || langSet.has(name)) continue;
    langSet.add(name);
    langs.push(name);
  }
  const langsShown = langs.slice(0, 4);
  const langsMoreCount = Math.max(0, langs.length - langsShown.length);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          background: "linear-gradient(135deg, #1a1410 0%, #2a1d12 50%, #3a2818 100%)",
          color: "#f5e6c8",
          padding: "56px",
          gap: 48,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Cover column — full inner height, image fits inside via contain so
            the whole upload renders regardless of source aspect (portrait,
            square, landscape). */}
        <div
          style={{
            display: "flex",
            width: 380,
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {cover ? (
            <img
              src={cover}
              alt=""
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                borderRadius: 12,
                boxShadow: "0 24px 48px rgba(0,0,0,0.45)",
              }}
            />
          ) : (
            <div
              style={{
                width: 380,
                height: 500,
                borderRadius: 12,
                background:
                  "linear-gradient(160deg, rgba(212,165,116,0.18), rgba(212,165,116,0.05))",
                border: "1px solid rgba(245,230,200,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 110,
                color: "rgba(245,230,200,0.35)",
              }}
            >
              ﹆
            </div>
          )}
        </div>

        {/* Text column — STORY label up top, title block centred, wordmark
            pinned to the bottom-right so it never overlaps the cover. */}
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 22,
                letterSpacing: 6,
                color: "#d4a574",
                textTransform: "uppercase",
              }}
            >
              Story
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 28,
                fontSize: clampTitleSize(title),
                lineHeight: 1.1,
                fontWeight: 700,
                letterSpacing: -1,
                color: "#f5e6c8",
              }}
            >
              {title}
            </div>

            {author ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 20,
                  fontSize: 28,
                  color: "rgba(245,230,200,0.7)",
                }}
              >
                by {author}
              </div>
            ) : null}

            {langsShown.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  marginTop: 28,
                }}
              >
                {langsShown.map((name) => (
                  <span
                    key={name}
                    style={{
                      display: "flex",
                      padding: "8px 18px",
                      background: "rgba(212,165,116,0.18)",
                      border: "1px solid rgba(212,165,116,0.4)",
                      borderRadius: 999,
                      fontSize: 22,
                      color: "#f5e6c8",
                    }}
                  >
                    {name}
                  </span>
                ))}
                {langsMoreCount > 0 ? (
                  <span
                    style={{
                      display: "flex",
                      padding: "8px 18px",
                      borderRadius: 999,
                      fontSize: 22,
                      color: "rgba(245,230,200,0.55)",
                    }}
                  >
                    +{langsMoreCount} more
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              fontSize: 22,
              color: "rgba(245,230,200,0.55)",
            }}
          >
            <span style={{ display: "flex" }}>Stories, translated with soul.</span>
            <span
              style={{
                display: "flex",
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: 4,
                color: "#d4a574",
              }}
            >
              QISSA
            </span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

/**
 * Scale title down progressively so a long Hindi/Bengali title doesn't blow
 * out the right column. system-ui in next/og measures roughly 0.55em per
 * character at the chosen size — these thresholds were eyeballed against
 * the 360-cover layout's ~720px text column.
 */
function clampTitleSize(title: string): number {
  const length = title.length;
  if (length <= 28) return 80;
  if (length <= 48) return 64;
  if (length <= 80) return 52;
  return 42;
}

function brandFallback(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1a1410 0%, #3a2818 100%)",
          color: "#f5e6c8",
          fontFamily: "system-ui, sans-serif",
          gap: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 120,
            fontWeight: 700,
            letterSpacing: 12,
            color: "#d4a574",
          }}
        >
          QISSA
        </div>
        <div style={{ display: "flex", fontSize: 36, color: "rgba(245,230,200,0.7)" }}>
          Stories, translated with soul.
        </div>
      </div>
    ),
    size,
  );
}
