"use client";

import { useEffect } from "react";

/**
 * Mounts once at the root layout and registers public/sw.js in
 * production. In development we skip registration so HMR and Turbopack
 * don't fight a stale cache.
 *
 * Renders nothing — the SW does its work in the background and the
 * InstallPrompt component handles the install UX separately.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          // Don't crash the app — just log.
          console.warn("Service worker registration failed:", err);
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
