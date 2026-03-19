import { NextRequest, NextResponse } from "next/server";

import { canAccessAdmin } from "@/lib/admin-auth";
import { listRecentSyncLogs } from "@/lib/content-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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

  return NextResponse.json({
    data: await listRecentSyncLogs(),
    error: null,
  });
}
