import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { Shell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local Orbit",
  description: "Local-first memory and control plane for your AI agents.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Applies the saved theme before first paint so a light-mode user never sees a dark flash.
const THEME_SCRIPT = `try{var t=localStorage.getItem("orbit-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Shell>
          <Suspense>{children}</Suspense>
        </Shell>
      </body>
    </html>
  );
}
