import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Qissa — Stories, translated with soul",
  description:
    "Curated stories translated into Urdu, Hindi, Bengali, Arabic, Tamil and more — in the prose style of legendary writers.",
};

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-muted-foreground mb-3 text-sm tracking-widest uppercase">
        Phase 1 · scaffold
      </p>
      <h1 className="text-foreground text-5xl font-semibold tracking-tight sm:text-6xl">
        Qissa
      </h1>
      <p className="text-muted-foreground mt-6 text-lg leading-relaxed">
        Stories, translated with soul — a multi-language reading platform with literary AI
        translation in the style of legendary writers.
      </p>
      <p className="text-muted-foreground/70 mt-10 text-xs">
        The reader and admin console are built in subsequent phases. See{" "}
        <code className="font-mono">docs/03-implementation-plan.md</code>.
      </p>
    </main>
  );
}
