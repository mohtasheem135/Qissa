import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { thumbnailUrl } from "@/lib/imagekit/url";
import { languageFontStyle } from "@/lib/i18n/fonts";

export interface StoryCardData {
  id: string;
  title_original: string;
  title_translated: string | null;
  cover_image_url: string | null;
  total_parts: number;
  estimated_reading_minutes: number | null;
  language_name_english: string;
  language_font_family: string | null;
  language_font_family_reading: string | null;
  tone_name: string | null;
}

interface StoryCardProps {
  story: StoryCardData;
  /** Tighter layout for grids. Default is "default". */
  variant?: "default" | "compact";
}

/**
 * The canonical story card. Shows cover + translated title (in the target
 * language's reading font) + meta. Used on home, category, subcategory,
 * search, and bookmarks pages.
 */
export function StoryCard({ story, variant = "default" }: StoryCardProps) {
  const cover = thumbnailUrl(story.cover_image_url);
  const titleFontStyle = languageFontStyle(
    {
      font_family: story.language_font_family,
      font_family_reading: story.language_font_family_reading,
    },
    "reading",
  );

  return (
    <Link
      href={`/s/${story.id}`}
      className="bg-card group focus-visible:ring-ring block overflow-hidden rounded-lg border transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <div className="bg-muted/40 relative aspect-[3/2] w-full overflow-hidden">
        {cover ? (
          <Image
            src={cover}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            unoptimized
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            no cover
          </div>
        )}
        <Badge
          variant="secondary"
          className="absolute top-2 right-2 text-[10px] tracking-wide uppercase"
        >
          {story.language_name_english}
        </Badge>
      </div>
      <div className={variant === "compact" ? "space-y-1 p-3" : "space-y-1.5 p-4"}>
        <h3
          className="text-foreground line-clamp-2 text-base leading-snug font-medium"
          style={titleFontStyle}
        >
          {story.title_translated ?? story.title_original}
        </h3>
        {story.title_translated ? (
          <p className="text-muted-foreground line-clamp-1 text-xs">{story.title_original}</p>
        ) : null}
        <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
          {story.tone_name ? (
            <span className="truncate">{story.tone_name}</span>
          ) : null}
          {story.tone_name && story.total_parts > 0 ? <span aria-hidden>·</span> : null}
          {story.total_parts > 0 ? (
            <span>
              {story.total_parts} part{story.total_parts === 1 ? "" : "s"}
            </span>
          ) : null}
          {story.estimated_reading_minutes ? (
            <>
              <span aria-hidden>·</span>
              <span>{story.estimated_reading_minutes} min</span>
            </>
          ) : null}
        </p>
      </div>
    </Link>
  );
}
