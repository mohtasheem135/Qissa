import { CategoryTileSkeleton } from "@/components/shared/skeletons";

export default function CategoryLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="space-y-2">
        <div className="bg-muted/60 h-3 w-16 animate-pulse rounded" />
        <div className="bg-muted/60 h-8 w-56 animate-pulse rounded" />
        <div className="bg-muted/60 h-3 w-72 animate-pulse rounded" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CategoryTileSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
