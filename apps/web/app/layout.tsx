import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outerworld AI",
  description:
    "A map of your Claude Code Routines: teams, permissions, handoffs, and one overseer.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  // data-theme is set by the theme toggle in the web step; until then the OS preference applies.
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
