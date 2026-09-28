import { RigSprite, ScreenFrame } from "@darthsaul/outerworld-ai-ui";
import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { THEME_INIT_SCRIPT } from "./components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outerworld AI",
  description:
    "A map of your Claude Code Routines: teams, permissions, handoffs, and one overseer.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  // data-theme comes from the ThemeToggle; the inline script applies the stored choice before paint.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body>
        <RigSprite />
        <ScreenFrame label="Outerworld AI">{children}</ScreenFrame>
      </body>
    </html>
  );
}
