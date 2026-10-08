import type { Metadata } from "next";
import type { ReactNode } from "react";
import { V3_COPY } from "@/data";
import { V3Provider } from "@/ui/state/V3Provider";

export const metadata: Metadata = {
  title: V3_COPY.appTitle,
  description: V3_COPY.appDescription,
};

// V3 (UX redesign). Its own journey state, storage key and analytics version; `colman-theme` scopes the COLMAN tokens.
export default function V3Layout({ children }: { children: ReactNode }) {
  return (
    <V3Provider>
      <div className="colman-theme">{children}</div>
    </V3Provider>
  );
}
