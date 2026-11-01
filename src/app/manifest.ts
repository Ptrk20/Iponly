import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Iponly",
    short_name: "Iponly",
    description: "A clear, calm way to track savings, budgets, payments, and travel plans.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f6f1",
    theme_color: "#f3f6f1",
    icons: [
      {
        src: "/icons/iponly-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/iponly-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/iponly-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
