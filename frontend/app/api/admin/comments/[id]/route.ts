import { NextRequest, NextResponse } from "next/server";

import { canAccessAdmin } from "@/lib/admin-auth";
import { reviewComment } from "@/lib/content-repository";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!canAccessAdmin(request.headers)) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "UNAUTHORIZED",
          message: "当前请求未命中管理员白名单。",
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

  const comment = await reviewComment(params.id, body.decision);

  return NextResponse.json({
    data: comment,
    error: null,
  });
}
