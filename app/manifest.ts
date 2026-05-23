import type { MetadataRoute } from "next";

/**
 * PWA manifest. Next.js serves this at /manifest.webmanifest and emits
 * `<link rel="manifest" …>` automatically from the root layout.
 *
 * Icons live at public/icons/* as SVGs — modern Chrome/Android accept
 * SVG icons; PNG variants are a Phase 1.5 polish item via
 * realfavicongenerator.net.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Qissa — Stories, translated with soul",
    short_name: "Qissa",
    description:
      "A multi-language story translation platform. Literary AI translation in the prose style of legendary writers.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#4F46E5",
    orientation: "portrait",
    categories: ["books", "education", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
