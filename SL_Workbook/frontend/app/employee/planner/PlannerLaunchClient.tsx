"use client";

import { useEffect } from "react";

export function PlannerLaunchClient() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.assign("/planner");
    }, 150);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
