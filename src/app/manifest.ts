import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest; Next auto-links it. start_url is the wallet, so an
// installed Castel opens straight into the app, not the marketing home.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Castel — Cash on Stellar",
    short_name: "Castel",
    description: "Fair-rate FX & payments for Bali tourists. No bank account needed.",
    start_url: "/wallet",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0052FF",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
