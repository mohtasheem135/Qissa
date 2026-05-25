export default function StoryLandingLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <div className="bg-muted/60 h-3 w-32 animate-pulse rounded" />
      <div className="bg-muted/60 aspect-[16/9] w-full animate-pulse rounded-lg" />
      <div className="space-y-3">
        <div className="bg-muted/60 h-9 w-3/4 animate-pulse rounded" />
        <div className="bg-muted/60 h-3 w-1/3 animate-pulse rounded" />
        <div className="bg-muted/60 h-2.5 w-1/5 animate-pulse rounded" />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="bg-muted/60 h-10 w-40 animate-pulse rounded-md" />
        <div className="bg-muted/60 h-10 w-10 animate-pulse rounded-md" />
        <div className="bg-muted/60 h-10 w-10 animate-pulse rounded-md" />
      </div>
      <div className="space-y-3">
        <div className="bg-muted/60 h-5 w-32 animate-pulse rounded" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card space-y-2 rounded-md border p-4">
              <div className="bg-muted/60 h-5 w-1/3 animate-pulse rounded" />
              <div className="bg-muted/60 h-4 w-3/4 animate-pulse rounded" />
              <div className="bg-muted/60 h-3 w-1/2 animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
