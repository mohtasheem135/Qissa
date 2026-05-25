import { SearchBar } from "@/components/shared/SearchBar";
import { StoryCardSkeleton } from "@/components/shared/skeletons";

export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <SearchBar />
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <StoryCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
