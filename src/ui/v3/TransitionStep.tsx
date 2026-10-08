"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useV3, useV3Guard } from "@/ui/state/V3Provider";
import { ProgressHeader, v3Primary } from "./shared";

/** The phase shift between choosing projects and answering: how the questions work, before the first one. */
export function TransitionStep() {
  const { markIntroSeen, pathFor, ui } = useV3();
  const copy = ui.transition;
  const router = useRouter();
  const allowed = useV3Guard("ready");
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (allowed) heading.current?.focus();
  }, [allowed]);

  if (!allowed) return null;

  return (
    <section className="space-y-8 pt-2" data-testid="v3-transition">
      <ProgressHeader stage={2} />
      <div className="colman-wash space-y-4 rounded-3xl border border-colman-border p-6">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-2xl leading-snug font-extrabold text-colman-blue-dark outline-none sm:text-3xl"
        >
          {copy.headline}
        </h1>
        <p className="text-lg leading-relaxed text-slate-800">{copy.body}</p>
      </div>
      <button
        type="button"
        className={v3Primary}
        data-testid="transition-cta"
        onClick={() => {
          markIntroSeen();
          router.push(pathFor("questions"));
        }}
      >
        {copy.cta}
      </button>
    </section>
  );
}
