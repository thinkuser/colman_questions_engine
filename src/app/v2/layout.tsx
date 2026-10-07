import type { Metadata } from "next";
import type { ReactNode } from "react";
import { copy } from "@/ui/copy.he";
import { DiscoveryProvider } from "@/ui/state/DiscoveryProvider";

export const metadata: Metadata = {
  title: copy.v2.appTitle,
  description: copy.v2.appDescription,
};

// V2 career-project discovery. Its journey state is separate from the V1 comparison state.
export default function DiscoveryLayout({ children }: { children: ReactNode }) {
  return <DiscoveryProvider>{children}</DiscoveryProvider>;
}
