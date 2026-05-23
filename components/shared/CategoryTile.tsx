import Link from "next/link";

export interface CategoryTileData {
  slug: string;
  name: string;
  icon_emoji: string | null;
  description: string | null;
  story_count?: number;
}

interface CategoryTileProps {
  category: CategoryTileData;
}

export function CategoryTile({ category }: CategoryTileProps) {
  return (
    <Link
      href={`/c/${category.slug}`}
      className="bg-card hover:border-primary/40 focus-visible:ring-ring group block rounded-lg border p-5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <div className="mb-3 text-3xl" aria-hidden>
        {category.icon_emoji ?? "📖"}
      </div>
      <h3 className="text-foreground text-base font-medium">{category.name}</h3>
      {category.description ? (
        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{category.description}</p>
      ) : null}
      {typeof category.story_count === "number" ? (
        <p className="text-muted-foreground mt-2 text-[11px] uppercase tracking-wide">
          {category.story_count} {category.story_count === 1 ? "story" : "stories"}
        </p>
      ) : null}
    </Link>
  );
}
