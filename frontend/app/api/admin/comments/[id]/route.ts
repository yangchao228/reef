import { NextRequest, NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin-auth";
import { reviewComment } from "@/lib/content-repository";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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

  const body = (await request.json()) as { decision?: "approved" | "rejected" };

  if (!body.decision) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "INVALID_INPUT",
          message: "缺少审核结果。",
        },
      },
      { status: 400 },
    );
  }

  const comment = await reviewComment(
    params.id,
    body.decision,
    adminAccess.workspaceSlug,
  );

  if (!comment) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "COMMENT_NOT_FOUND",
          message: "评论不存在，或已经被处理。",
        },
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: comment,
    error: null,
  });
}
