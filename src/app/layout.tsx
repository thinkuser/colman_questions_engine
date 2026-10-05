import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import type { ReactNode } from "react";
import { copy } from "@/ui/copy.he";
import { ComparisonProvider } from "@/ui/state/ComparisonProvider";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo", display: "swap" });

export const metadata: Metadata = {
  title: copy.appTitle,
  description: copy.appDescription,
};

// Hebrew-first: RTL is the document default. Internal IDs and code stay in English.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <ComparisonProvider>
          <div className="mx-auto max-w-2xl px-4 py-8">
            <p className="mb-6 text-sm font-semibold text-brand">{copy.brand}</p>
            <main>{children}</main>
          </div>
        </ComparisonProvider>
      </body>
    </html>
  );
}
