import { NextRequest, NextResponse } from "next/server";

import { recordView } from "@/lib/content-repository";
import { decodeRouteParam } from "@/lib/route-param";
import { resolveWorkspaceSlug } from "@/lib/workspace";

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const body = (await request.json()) as { fingerprint?: string; isAdmin?: boolean };
  const slug = decodeRouteParam(params.slug);
  const workspaceSlug = resolveWorkspaceSlug(request.headers, request.cookies);
  if (!workspaceSlug) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "WORKSPACE_REQUIRED",
          message: "当前请求缺少 x-reef-workspace，无法识别 workspace 上下文。",
        },
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    data: {
      views: await recordView(
        slug,
        body.fingerprint ?? "",
        body.isAdmin ?? false,
        workspaceSlug,
      ),
    },
    error: null,
  });
}
