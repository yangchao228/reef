import { NextRequest, NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin-auth";
import { listPendingComments } from "@/lib/content-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const adminAccess = await getAdminAccess(request.headers, request.cookies);
  if (!adminAccess.allowed) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "UNAUTHORIZED",
          message:
            adminAccess.reason === "MISSING_WORKSPACE"
              ? "当前请求缺少 x-reef-workspace，无法识别 workspace 上下文。"
              : adminAccess.reason === "MISSING_IDENTITY"
              ? "当前请求缺少登录身份，无法识别当前用户。"
              : `当前账号 ${
                  adminAccess.actor.githubLogin ?? "unknown"
                } 不是 workspace ${adminAccess.workspaceSlug} 的管理员。`,
        },
      },
      { status: 403 },
    );
  }

  return NextResponse.json({
    data: await listPendingComments(adminAccess.workspaceSlug),
    error: null,
  });
}
