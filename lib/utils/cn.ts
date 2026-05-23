import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Conditionally join Tailwind classes, with later classes overriding earlier ones.
 * Used by all shadcn/ui primitives.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
