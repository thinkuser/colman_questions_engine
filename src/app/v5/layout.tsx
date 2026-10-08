import type { Metadata } from "next";
import type { ReactNode } from "react";
import { V5_COPY } from "@/data";
import { GtmLoader } from "@/ui/analytics/GtmLoader";
import { V5Provider } from "@/ui/state/V5Provider";

export const metadata: Metadata = {
  title: V5_COPY.appTitle,
  description: V5_COPY.appDescription,
};

// V5 (dual entry with balanced project-led discovery, DEC-037). Its own journey state, storage key and analytics
// trackers; the redesigned screens (and V4's method screen) are shared through the experience context.
// `colman-theme` scopes the COLMAN tokens.
export default function V5Layout({ children }: { children: ReactNode }) {
  return (
    <V5Provider>
      <div className="colman-theme">{children}</div>
      {/* V5 pilot (DEC-038): GTM only when NEXT_PUBLIC_GTM_ID is set; nothing otherwise. */}
      <GtmLoader />
    </V5Provider>
  );
}
