import type { Metadata } from "next";
import Script from "next/script";
import { themeInitScript } from "@/app/theme-init";
import "./globals.css";

export const metadata: Metadata = {
  title: "StatBomb Collector Management",
  description: "Operations console for StatBomb match-data collectors.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
