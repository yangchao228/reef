import { NextRequest, NextResponse } from "next/server";

import { recordView } from "@/lib/content-repository";
import { decodeRouteParam } from "@/lib/route-param";

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const body = (await request.json()) as { fingerprint?: string; isAdmin?: boolean };
  const slug = decodeRouteParam(params.slug);

  return NextResponse.json({
    data: {
      views: await recordView(
        slug,
        body.fingerprint ?? "",
        body.isAdmin ?? false,
      ),
    },
    error: null,
  });
}
