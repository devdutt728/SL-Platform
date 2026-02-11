"use client";

import Link from "next/link";
import Image from "next/image";
import { OpeningPublicListItem } from "@/lib/types";

const CULTURE_COPY =
  "We are looking for the brightest and the best talent to work with us. We believe in the idea of Collective Genius. Working in a highly collaborative setting within a hub-and-spoke organisational model, team leaders operate mini-studios within the larger studio. Democracy and transparency are key to our design process.";

function inferDiscipline(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("architect")) return "ARCHITECTURE";
  if (lower.includes("interior")) return "INTERIOR DESIGN";
  if (lower.includes("comms") || lower.includes("media")) return "MEDIA & COMMS";
  return "ARCH. & INTERIORS";
}

function inferExperience(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("group lead")) return "12+ Years";
  if (lower.includes("associate")) return "9+ years";
  if (lower.includes("project designer")) return "6 to 9 years";
  if (lower.includes("sr") || lower.includes("senior")) return "3 to 6 years";
  if (lower.includes("intern")) return "0 years";
  return "1 to 3 years";
}

export function PublicOpeningsClient({
  openings,
  bannerSrc,
}: {
  openings: OpeningPublicListItem[];
  bannerSrc: string;
}) {
  const filtered = openings;

  return (
    <section className="body-section">
      <div className="header-image">
        <div className="porftfolio-container">
          <div className="careers-hero-wrap">
            <Image src={bannerSrc} alt="Studio Lotus team" fill className="careers-hero" sizes="100vw" unoptimized />
          </div>
        </div>
      </div>

      <div className="statis-pages-body-div">
        <div className="text-container-about">
          <h3 className="heading-16">{CULTURE_COPY}</h3>
        </div>

        <div className="join-us-container">
          <div className="join-us-jobs-div">
            <div className="collection-list-wrapper-6">
              <div className="collection-list-7">
                {filtered.map((o) => {
                  const title = (o.opening_title || "Job opening").trim();
                  const discipline = inferDiscipline(title);
                  const experience = inferExperience(title);
                  return (
                    <article key={`${o.opening_code}-card`} className="div-block-53">
                      <div className="div-block-56">
                        <h1 className="heading-9">{title}</h1>
                        <div className="text-block-16">{discipline}</div>
                        <div className="_1rembottom" />
                        <div className="div-block-55">
                          <div className="experience">EXPERIENCE</div>
                          <div className="experience">{experience}</div>
                        </div>
                        <div className="div-block-55-copy">
                          <Link href={`/apply/${encodeURIComponent(o.opening_code)}`} className="link-block-3">
                            <div className="text-block-19">Job Description</div>
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="apply-empty-state">No matching roles. Try a different keyword.</div>
        ) : null}
      </div>
    </section>
  );
}
