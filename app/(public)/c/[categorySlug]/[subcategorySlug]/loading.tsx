import { StoryCardSkeleton } from "@/components/shared/skeletons";

export default function SubcategoryLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="space-y-2">
        <div className="bg-muted/60 h-3 w-24 animate-pulse rounded" />
        <div className="bg-muted/60 h-8 w-56 animate-pulse rounded" />
        <div className="bg-muted/60 h-3 w-80 animate-pulse rounded" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <StoryCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
