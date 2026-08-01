import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { WarmBackend } from "@/components/WarmBackend";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Castel — Cash on Stellar",
  description: "Fair-rate FX & payments for Bali tourists. No bank account needed.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Castel" },
};

export const viewport: Viewport = {
  themeColor: "#0052FF",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        <WarmBackend />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
