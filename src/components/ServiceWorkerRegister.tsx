"use client";

import { useEffect } from "react";

// Registers the PWA service worker once, client-side. Kept tiny and failure-tolerant —
// a browser without service workers just skips it.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
