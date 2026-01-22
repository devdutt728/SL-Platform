import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import fs from "node:fs/promises";
import path from "node:path";

type SlotPreview = { label?: string };

type CandidateDetail = {
  name?: string;
  opening_title?: string | null;
};

function renderTemplate(template: string, vars: Record<string, string>) {
  let html = template;
  for (const [key, value] of Object.entries(vars)) {
    html = html.split(`{${key}}`).join(value);
  }
  return html;
}

function buildSlotRows(slots: SlotPreview[]) {
  if (slots.length === 0) {
    return (
      "<tr>" +
      '<td style="padding:14px 0; color:#64748b; font-size:14px;">No available slots in the selected window.</td>' +
      "</tr>"
    );
  }

  return slots
    .map((slot) => {
      const label = slot.label || "Slot";
      return (
        "<tr>" +
        `<td style="padding:12px 0; color:#1e293b; font-weight:600; font-size:15px;">${label}</td>` +
        '<td style="padding:12px 0; text-align:right;">' +
        '<a href="#" style="display:inline-block; padding:10px 18px; border-radius:999px; ' +
        "background:#2563eb; color:#ffffff; text-decoration:none; " +
        'font-weight:700; font-size:13px; letter-spacing:0.02em;">Select slot</a>' +
        "</td>" +
        "</tr>"
      );
    })
    .join("\n");
}

async function loadTemplate(): Promise<string | null> {
  const templatePath = path.resolve(process.cwd(), "../backend/app/templates/email/interview_slot_options.html");
  try {
    return await fs.readFile(templatePath, "utf8");
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const candidateId = url.searchParams.get("candidate_id") || "";
  const roundType = url.searchParams.get("round_type") || "";
  const interviewerEmail = url.searchParams.get("interviewer_email") || "";
  const startDate = url.searchParams.get("start_date") || "";

  const upstream = new URL(backendUrl("/rec/interview-slots/email-preview"));
  if (candidateId) upstream.searchParams.set("candidate_id", candidateId);
  if (roundType) upstream.searchParams.set("round_type", roundType);
  if (interviewerEmail) upstream.searchParams.set("interviewer_email", interviewerEmail);
  if (startDate) upstream.searchParams.set("start_date", startDate);

  const authHeaders = { ...authHeaderFromCookie() };
  const res = await fetch(upstream.toString(), { cache: "no-store", headers: authHeaders });
  if (res.status !== 404) {
    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "text/html" },
    });
  }

  if (!candidateId || !roundType || !interviewerEmail) {
    const data = await res.text();
    return new NextResponse(data || "Missing required parameters", {
      status: 400,
      headers: { "content-type": "text/plain" },
    });
  }

  const candidateUrl = backendUrl(`/rec/candidates/${candidateId}`);
  const slotsUrl = new URL(backendUrl("/rec/interview-slots/preview"));
  slotsUrl.searchParams.set("interviewer_email", interviewerEmail);
  if (startDate) slotsUrl.searchParams.set("start_date", startDate);

  const [candidateRes, slotsRes, template] = await Promise.all([
    fetch(candidateUrl, { cache: "no-store", headers: authHeaders }),
    fetch(slotsUrl.toString(), { cache: "no-store", headers: authHeaders }),
    loadTemplate(),
  ]);

  if (!candidateRes.ok || !slotsRes.ok) {
    return new NextResponse("Unable to build preview from backend data", {
      status: 502,
      headers: { "content-type": "text/plain" },
    });
  }

  const candidate = (await candidateRes.json()) as CandidateDetail;
  const slots = (await slotsRes.json()) as SlotPreview[];
  const slotRows = buildSlotRows(slots || []);

  const html =
    (template
      ? renderTemplate(template, {
          candidate_name: candidate.name || "Candidate",
          round_type: roundType,
          opening_title: candidate.opening_title || "",
          slots_table: slotRows,
        })
      : `<div>${slotRows}</div>`) || `<div>${slotRows}</div>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}
