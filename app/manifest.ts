import type { MetadataRoute } from "next";

/**
 * PWA manifest. Next.js serves this at /manifest.webmanifest and emits
 * `<link rel="manifest" …>` automatically from the root layout.
 *
 * Icons generated via realfavicongenerator.net and live at public/icons/*.
 * Both sizes are `purpose: "maskable"` — the source artwork includes the
 * 80% safe-zone padding so Android adaptive masks crop cleanly.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Qissa — Stories, translated with soul",
    short_name: "Qissa",
    description:
      "A multi-language story translation platform. Literary AI translation in the prose style of legendary writers.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5d399",
    theme_color: "#f5d399",
    orientation: "portrait",
    categories: ["books", "education", "lifestyle"],
    icons: [
      {
        src: "/icons/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
