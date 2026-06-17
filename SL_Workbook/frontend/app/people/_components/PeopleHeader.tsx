import Image from "next/image";
import Link from "next/link";
import { getPeopleUser, isPeopleSuperadmin } from "../_lib/access-server";
import { PeopleNav, type NavItem } from "./PeopleNav";

/**
 * Shared People topbar: back affordance + breadcrumb on the left, segmented
 * nav with an active-page indicator in the centre, Workbook as the one
 * outbound action on the right. Refined/minimal — lotus is the only accent.
 */
export async function PeopleHeader({
  crumb,
  back,
}: {
  crumb?: { label: string; href?: string }[];
  back?: string;
}) {
  const [canSeeEmployees, user] = await Promise.all([isPeopleSuperadmin(), getPeopleUser()]);

  const primary: NavItem[] = [
    { label: "Org", href: "/people/org" },
    ...(canSeeEmployees ? [{ label: "Directory", href: "/people/employees" }] : []),
    { label: "Licenses", href: "/people/licenses" },
    { label: "Systems", href: "/people/systems" },
  ];
  const more: NavItem[] = [
    { label: "Peripherals", href: "/people/peripherals" },
    { label: "Groups", href: "/people/groups" },
    ...(canSeeEmployees ? [{ label: "Bulk", href: "/people/bulk" }] : []),
  ];

  return (
    <header className="ppl-topbar">
      <div className="ppl-brand">
        {back ? (
          <Link href={back} className="ppl-back" aria-label="Back">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
        ) : null}
        <Link href="/people" className="relative h-9 w-36 shrink-0">
          <Image src="/studio-lotus-logo.png" alt="Studio Lotus" fill sizes="144px" className="object-contain object-left" priority />
        </Link>
        <nav className="ppl-crumb hidden sm:flex">
          <Link href="/people">People</Link>
          {(crumb || []).map((c) => (
            <span key={c.label} className="flex items-center gap-1">
              <span className="ppl-crumb__sep">/</span>
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span className="ppl-crumb__current">{c.label}</span>}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2.5">
        <PeopleNav primary={primary} more={more} />
        <span className="hidden h-5 w-px bg-[var(--border-soft)] md:block" aria-hidden />

        {/* Apps switcher — jump back to the Workbook / other modules */}
        <details className="employee-menu hidden md:block">
          <summary className="ppl-btn ppl-btn--ghost cursor-pointer">
            Apps
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </summary>
          <div className="employee-menu__panel">
            <Link href="/employee" className="employee-menu__item">Workbook</Link>
            <Link href="/" className="employee-menu__item">Public portal</Link>
          </div>
        </details>

        {/* User identity + sign out */}
        <details className="employee-menu">
          <summary className="employee-user">
            <div className="employee-avatar">{user.initials}</div>
            <div className="hidden text-left sm:block">
              <p className="employee-name">Hi {user.firstName},</p>
              <p className="employee-role">{user.role}</p>
            </div>
            <span className="employee-caret" aria-hidden="true" />
          </summary>
          <div className="employee-menu__panel">
            <div className="px-3 pb-1.5 pt-1">
              <p className="text-[0.78rem] font-semibold text-[rgb(var(--ink))]">{user.displayName}</p>
              <p className="text-[0.68rem] text-[rgb(var(--steel))]">{user.role}</p>
            </div>
            <div className="my-1 h-px bg-[var(--border-soft)]" aria-hidden />
            <Link href="/people" className="employee-menu__item">People home</Link>
            <Link href="/employee" className="employee-menu__item">Workbook</Link>
            <a href="/api/auth/logout" className="employee-menu__item text-[var(--brand-color)]">Sign out</a>
          </div>
        </details>
      </div>
    </header>
  );
}
