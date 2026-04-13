import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
  });
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
