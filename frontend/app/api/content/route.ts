import { NextRequest, NextResponse } from "next/server";

import { listAllContent, listModuleContent } from "@/lib/content-repository";
import { resolveWorkspaceSlug } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category") ?? undefined;
  const tag = request.nextUrl.searchParams.get("tag") ?? undefined;
  const module = request.nextUrl.searchParams.get("module");
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

  const data = module
    ? await listModuleContent(module, {
        category,
        tag,
      }, workspaceSlug)
    : (await listAllContent(workspaceSlug)).filter((item) => {
        if (category && item.category !== category) {
          return false;
        }
        if (tag && !item.tags.includes(tag)) {
          return false;
        }
        return true;
      });

  return NextResponse.json({
    data,
    error: null,
  });
}
