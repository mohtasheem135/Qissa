import { cn } from "@/lib/utils/cn";

/**
 * Tiny pulse primitives used by per-route loading.tsx files.
 * Plain Tailwind; no external dep.
 */

export function TextLine({ className }: { className?: string }) {
  return <div className={cn("bg-muted/60 h-3 animate-pulse rounded", className)} />;
}

export function StoryCardSkeleton() {
  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <div className="bg-muted/60 aspect-[3/2] w-full animate-pulse" />
      <div className="space-y-2 p-4">
        <TextLine className="w-4/5" />
        <TextLine className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}

export function CategoryTileSkeleton() {
  return (
    <div className="bg-card rounded-lg border p-5">
      <div className="bg-muted/60 mb-3 h-8 w-8 animate-pulse rounded" />
      <TextLine className="mb-2 h-4 w-1/2" />
      <TextLine className="h-2.5 w-3/4" />
    </div>
  );
}

export function ReaderParagraphSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <TextLine className="w-full" />
          <TextLine className="w-[97%]" />
          <TextLine className="w-[92%]" />
          <TextLine className="w-2/3" />
        </div>
      ))}
    </div>
  );
}
