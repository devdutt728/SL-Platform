import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    console.info("[ux-metric]", JSON.stringify(payload));
  } catch {
    // Ignore malformed metric payloads.
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
