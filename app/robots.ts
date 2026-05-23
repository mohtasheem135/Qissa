import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep admin out of any index. /api/* is implicitly server-only
        // (no HTML), but explicitly blocking it costs nothing.
        disallow: ["/admin", "/api"],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
