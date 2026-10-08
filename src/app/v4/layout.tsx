import type { Metadata } from "next";
import type { ReactNode } from "react";
import { V4_COPY } from "@/data";
import { V4Provider } from "@/ui/state/V4Provider";

export const metadata: Metadata = {
  title: V4_COPY.appTitle,
  description: V4_COPY.appDescription,
};

// V4 (dual-entry experiment). Its own journey state, storage key and analytics trackers; the redesigned screens are
// shared with V3 through the experience context. `colman-theme` scopes the COLMAN tokens.
export default function V4Layout({ children }: { children: ReactNode }) {
  return (
    <V4Provider>
      <div className="colman-theme">{children}</div>
    </V4Provider>
  );
}
