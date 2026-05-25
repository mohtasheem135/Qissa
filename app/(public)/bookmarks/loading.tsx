import { StoryCardSkeleton } from "@/components/shared/skeletons";

export default function BookmarksLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Bookmarks</h1>
        <div className="bg-muted/60 h-3 w-48 animate-pulse rounded" />
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <StoryCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
