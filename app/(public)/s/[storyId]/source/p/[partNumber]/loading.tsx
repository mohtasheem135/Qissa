import { ReaderParagraphSkeleton } from "@/components/shared/skeletons";

export default function SourceReaderLoading() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="bg-background/80 fixed inset-x-0 top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[680px] items-center justify-between px-3 sm:px-5">
          <div className="bg-muted/60 h-6 w-6 animate-pulse rounded" />
          <div className="bg-muted/60 h-3 w-24 animate-pulse rounded" />
          <div className="bg-muted/60 h-6 w-6 animate-pulse rounded" />
        </div>
      </header>

      <article className="mx-auto max-w-[680px] px-5 pt-20 pb-24 sm:px-8">
        <header className="mb-8 space-y-2">
          <div className="bg-muted/60 h-3 w-20 animate-pulse rounded" />
          <div className="bg-muted/60 h-7 w-3/4 animate-pulse rounded" />
        </header>
        <ReaderParagraphSkeleton count={8} />
      </article>

      <nav
        aria-label="Part navigation"
        className="bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur"
      >
        <div className="mx-auto flex h-14 max-w-[680px] items-center justify-between px-3 sm:px-5">
          <div className="bg-muted/60 h-8 w-8 animate-pulse rounded-md" />
          <div className="bg-muted/60 h-3 w-12 animate-pulse rounded" />
          <div className="bg-muted/60 h-8 w-8 animate-pulse rounded-md" />
        </div>
      </nav>
    </div>
  );
}
