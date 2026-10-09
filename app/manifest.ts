import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prépa Commandes",
    short_name: "Prépa",
    description: "Préparation de commandes de produits laitiers, guidée à la voix.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "fr",
    background_color: "#eef2f7",
    theme_color: "#1d4ed8",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
