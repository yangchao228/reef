import { NextRequest, NextResponse } from "next/server";

import { toggleLike } from "@/lib/content-repository";
import { decodeRouteParam } from "@/lib/route-param";

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const body = (await request.json()) as { fingerprint?: string };
  const slug = decodeRouteParam(params.slug);

  return NextResponse.json({
    data: await toggleLike(slug, body.fingerprint ?? ""),
    error: null,
  });
}
