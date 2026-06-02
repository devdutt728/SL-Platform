import Image from "next/image";
import Link from "next/link";
import { backendUrl } from "@/lib/backend";
import { getPublicPortalHref } from "@/lib/public-portal";
import { OpeningPublicListItem } from "@/lib/types";
import { filterVisibleRecords } from "@/lib/recruitment-visibility";
import { PublicOpeningsClient } from "./ui";

export const dynamic = "force-dynamic";

async function fetchPublicOpenings() {
  try {
    const res = await fetch(backendUrl("/apply"), { cache: "no-store" });
    if (!res.ok) return [] as OpeningPublicListItem[];
    const payload = (await res.json()) as OpeningPublicListItem[];
    return filterVisibleRecords(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Public openings fetch failed: ${message}`);
    return [] as OpeningPublicListItem[];
  }
}

export default async function PublicApplyIndexPage() {
  const openings = await fetchPublicOpenings();
  const visible = openings.filter((o) => o.is_active !== false);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  const publicPortalHref = getPublicPortalHref();
  const bannerSrc = `${basePath}/careers-team-banner.webp`;
  const logoSrc = `${basePath}/Studio Lotus Logo (TM).png`;

  return (
    <main className="apply-webflow min-h-screen">
      <header className="apply-topbar">
        <div className="apply-topbar-inner">
          <Link href="/" className="apply-topbar-brand" aria-label="Studio Lotus public portal">
            <span className="apply-topbar-logo-wrap">
              <Image src={logoSrc} alt="Studio Lotus" fill sizes="132px" className="object-contain object-left" unoptimized />
            </span>
          </Link>

          <div className="apply-topbar-actions">
            <a href={publicPortalHref} className="apply-topbar-link">
              Back
            </a>
            <a href={publicPortalHref} className="apply-topbar-link">
              Public portal
            </a>
          </div>
        </div>
      </header>
      <PublicOpeningsClient openings={visible} bannerSrc={bannerSrc} />
    </main>
  );
}
