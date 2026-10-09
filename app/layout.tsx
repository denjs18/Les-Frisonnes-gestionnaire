import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/AppProvider";
import { ServiceWorkerRegistration } from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Prépa Commandes", template: "%s · Prépa Commandes" },
  description: "Préparation de commandes de produits laitiers, guidée à la voix : le total à sortir, puis la quantité pour chaque client.",
  applicationName: "Prépa Commandes",
  appleWebApp: { capable: true, title: "Prépa Commandes", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#080d17" },
  ],
};

/**
 * Pose le thème et la taille du texte avant le premier affichage (pas de flash blanc en mode sombre).
 * Le script lit les réglages enregistrés ; sans stockage, il suit le réglage du téléphone.
 */
const APPEARANCE_SCRIPT = `(function(){var e=document.documentElement,t='auto',z='normal';try{var s=JSON.parse(localStorage.getItem('prepa-commandes:v1:settings')||'{}');t=s.theme||t;z=s.textScale||z}catch(_){}var d=t==='dark'||(t!=='light'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);e.setAttribute('data-theme',d?'dark':'light');e.setAttribute('data-scale',z)})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
        <AppProvider>{children}</AppProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
