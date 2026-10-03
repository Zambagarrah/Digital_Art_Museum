import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Digital Art Museum",
    template: "%s | Digital Art Museum",
  },
  description:
    "Explore paintings, sculptures, historical artifacts, and monuments from open museum collections.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:text-[#14120c]"
        >
          Skip to content
        </a>

        <Suspense fallback={<div className="h-17.25 border-b border-border" />}>
          <SiteHeader />
        </Suspense>

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="border-t border-border px-6 py-10 text-xs text-muted">
          <div className="mx-auto max-w-[1600px]">
            Images and metadata courtesy of the Art Institute of Chicago, the
            Metropolitan Museum of Art, the Cleveland Museum of Art and Wikimedia
            Commons. Rights remain with their respective holders.
          </div>
        </footer>
      </body>
    </html>
  );
}
