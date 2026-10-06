"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { observeViewOnce } from "@/analytics";

/** Calls `onView` the first time the block is actually visible (not merely mounted). Renders a plain wrapper. */
export function ViewOnce({
  onView,
  className,
  children,
  ...rest
}: {
  onView: () => void;
  className?: string;
  children: ReactNode;
  "data-reality-check"?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onViewRef = useRef(onView);
  useEffect(() => {
    onViewRef.current = onView;
  });
  useEffect(() => observeViewOnce(ref.current, () => onViewRef.current()), []);
  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  );
}
