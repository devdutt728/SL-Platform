import Image from "next/image";
import Link from "next/link";
import { backendUrl } from "@/lib/backend";
import { OpeningPublicListItem } from "@/lib/types";
import { PublicOpeningsClient } from "./ui";

async function fetchPublicOpenings() {
  const res = await fetch(backendUrl("/apply"), { cache: "no-store" });
  if (!res.ok) return [] as OpeningPublicListItem[];
  return (await res.json()) as OpeningPublicListItem[];
}

export default async function PublicApplyIndexPage() {
  const openings = await fetchPublicOpenings();
  const visible = openings.filter((o) => o.is_active !== false);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
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
            <Link href="/" className="apply-topbar-link">
              Back
            </Link>
            <Link href="/" className="apply-topbar-link">
              Public portal
            </Link>
          </div>
        </div>
      </header>
      <PublicOpeningsClient openings={visible} bannerSrc={bannerSrc} />
    </main>
  );
}
