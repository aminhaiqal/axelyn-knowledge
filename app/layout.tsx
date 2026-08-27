import "@fontsource-variable/newsreader";
import "@fontsource-variable/public-sans";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Axelyn Knowledge", template: "%s · Axelyn Knowledge" },
  description: "Provenance-aware associative memory administration.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
