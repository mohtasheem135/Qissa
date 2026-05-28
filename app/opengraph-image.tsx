import { ImageResponse } from "next/og";

/**
 * Root Open Graph image — used by `/`, `/c/*`, `/search`, etc. Any deeper
 * route can override by dropping its own `opengraph-image.tsx`. The
 * per-story image lives at [s/[storyId]/opengraph-image.tsx].
 *
 * Same 1200×630 brand mark + tagline as the per-story fallback so a shared
 * link without story context still feels on-brand instead of generic.
 */

export const alt = "Qissa — Stories, translated with soul.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 30% 20%, #3a2818 0%, #1a1410 70%)",
          color: "#f5e6c8",
          fontFamily: "system-ui, sans-serif",
          gap: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 140,
            fontWeight: 700,
            letterSpacing: 14,
            color: "#d4a574",
          }}
        >
          QISSA
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 38,
            color: "rgba(245,230,200,0.78)",
          }}
        >
          Stories, translated with soul.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 22,
            letterSpacing: 4,
            color: "rgba(245,230,200,0.45)",
            textTransform: "uppercase",
          }}
        >
          Urdu · Hindi · Bengali · Arabic · Tamil
        </div>
      </div>
    ),
    size,
  );
}
