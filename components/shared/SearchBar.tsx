"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

interface SearchBarProps {
  initialValue?: string;
  className?: string;
  placeholder?: string;
}

/**
 * Server-rendered search form that navigates to /search?q=… on submit.
 * Used both as the hero search on the home page and inside /search.
 */
export function SearchBar({
  initialValue,
  className,
  placeholder = "Search stories…",
}: SearchBarProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initialValue ?? params.get("q") ?? "");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = value.trim();
    if (!q) {
      router.push("/search");
      return;
    }
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form
      action="/search"
      onSubmit={handleSubmit}
      role="search"
      className={cn("flex w-full items-center gap-2", className)}
    >
      <Input
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label="Search stories"
        className="h-11 flex-1 text-base"
      />
    </form>
  );
}
