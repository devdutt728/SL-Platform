"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type NavItem = { label: string; href: string };

/**
 * Segmented People nav with an active-page indicator. Primary destinations sit
 * inline; secondary ones collapse into a "More" menu so the bar stays calm.
 */
export function PeopleNav({ primary, more }: { primary: NavItem[]; more: NavItem[] }) {
  const pathname = usePathname();
  const [openMore, setOpenMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const moreActive = more.some((m) => isActive(m.href));

  useEffect(() => {
    if (!openMore) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setOpenMore(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [openMore]);

  return (
    <nav className="ppl-nav">
      {primary.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? "page" : undefined}
          className="ppl-nav__link"
        >
          {item.label}
        </Link>
      ))}

      {more.length ? (
        <div ref={moreRef} className="relative">
          <button
            type="button"
            onClick={() => setOpenMore((v) => !v)}
            aria-current={moreActive ? "page" : undefined}
            className="ppl-nav__link"
          >
            More
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="ml-1">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {openMore ? (
            <div className="absolute right-0 top-full z-30 mt-2 min-w-[10rem] overflow-hidden rounded-xl border border-[var(--border-soft)] bg-white p-1 shadow-[var(--shadow-soft-hover)]">
              {more.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpenMore(false)}
                  className={`block rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold ${
                    isActive(item.href) ? "bg-[var(--brand-color)] text-white" : "text-[rgb(var(--ink))] hover:bg-[rgb(var(--mist))]"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
