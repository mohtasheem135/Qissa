import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // ImageKit is the only external image host we use today. Cover URLs
    // come back as https://ik.imagekit.io/<account>/qissa/covers/... and
    // we add ?tr=... transforms in lib/imagekit/url.ts.
    //
    // We pass these through next/image with unoptimized={true} (ImageKit
    // already optimizes), but the remotePattern allowlists the host so
    // any future <Image> usage Just Works.
    remotePatterns: [
      { protocol: "https", hostname: "ik.imagekit.io" },
    ],
  },
};

export default nextConfig;
