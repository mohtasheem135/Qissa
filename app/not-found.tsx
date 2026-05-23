import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Top-level 404. Lives at app/not-found.tsx so it catches misses across
 * both public and admin areas (admin routes still apply their own
 * auth gate; if you're signed-out and hit a missing admin URL you're
 * redirected to /admin/login by the layout before this renders).
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-muted-foreground mb-3 text-xs tracking-widest uppercase">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground mt-3 text-sm">
        The page you&rsquo;re looking for doesn&rsquo;t exist or has been removed.
      </p>
      <div className="mt-8">
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}
