import { CategoryTileSkeleton } from "@/components/shared/skeletons";

export default function BrowseLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:py-12">
      <header className="space-y-2">
        <div className="bg-muted/60 h-7 w-48 animate-pulse rounded" />
        <div className="bg-muted/60 h-3 w-72 animate-pulse rounded" />
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CategoryTileSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
