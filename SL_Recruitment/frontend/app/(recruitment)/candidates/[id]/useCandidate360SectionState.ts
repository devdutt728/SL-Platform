"use client";

import { useState } from "react";

type Candidate360SectionKey = "overview" | "timeline" | "screening" | "documents" | "interviews" | "sprint" | "offer";

export function useCandidate360SectionState() {
  const [collapsedSections, setCollapsedSections] = useState<Record<Candidate360SectionKey, boolean>>({
    overview: false,
    timeline: true,
    screening: true,
    documents: true,
    interviews: true,
    sprint: true,
    offer: true,
  });

  function toggleSection(key: Candidate360SectionKey) {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setAllSections(collapsed: boolean) {
    setCollapsedSections({
      overview: false,
      timeline: collapsed,
      screening: collapsed,
      documents: collapsed,
      interviews: collapsed,
      sprint: collapsed,
      offer: collapsed,
    });
  }

  function focusSection(key: Candidate360SectionKey, ref: React.RefObject<HTMLDivElement>) {
    setCollapsedSections((prev) => ({ ...prev, [key]: false }));
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return {
    collapsedSections,
    toggleSection,
    setAllSections,
    focusSection,
  };
}
