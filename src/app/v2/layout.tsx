import type { Metadata } from "next";
import type { ReactNode } from "react";
import { copy } from "@/ui/copy.he";
import { DiscoveryProvider } from "@/ui/state/DiscoveryProvider";

export const metadata: Metadata = {
  title: copy.v2.appTitle,
  description: copy.v2.appDescription,
};

// V2 career-project discovery. Its journey state is separate from the V1 comparison state, and `colman-theme` scopes
// the COLMAN brand tokens to this subtree so V1 styling is untouched.
export default function DiscoveryLayout({ children }: { children: ReactNode }) {
  return (
    <DiscoveryProvider>
      <div className="colman-theme">{children}</div>
    </DiscoveryProvider>
  );
}
