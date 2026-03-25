import { NextRequest, NextResponse } from "next/server";

import { listCategories } from "@/lib/content-repository";
import { resolveWorkspaceSlug } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
    data: await listCategories(workspaceSlug),
    error: null,
  });
}
