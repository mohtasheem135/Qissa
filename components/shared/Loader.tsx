"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

type Size = "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<Size, number> = {
  sm: 48,
  md: 96,
  lg: 160,
  xl: 240,
};

export function Loader({
  size = "md",
  label = "Loading…",
  className,
}: {
  size?: Size;
  label?: string;
  className?: string;
}) {
  const px = SIZE_PX[size];
  return (
    <div
      role="status"
      aria-label={label}
      className={className ?? "inline-flex items-center justify-center"}
      style={{ width: px, height: px }}
    >
      <DotLottieReact
        src="/animations/qissa-loader.lottie"
        loop
        autoplay
        style={{ width: "100%", height: "100%" }}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function PageLoader({ label, size = "lg" }: { label?: string; size?: Size }) {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center">
      <Loader size={size} label={label} />
    </div>
  );
}
