import { NextRequest, NextResponse } from "next/server";

import { getRequestOrigin } from "@/lib/request-origin";
import { getWorkspaceSummary } from "@/lib/workspace-repository";
import {
  resolveWorkspaceNextPath,
  WORKSPACE_COOKIE_NAME,
  WORKSPACE_DIRECTORY_PATH,
} from "@/lib/workspace";

export async function GET(request: NextRequest) {
  const requestOrigin = getRequestOrigin(request);
  const workspaceSlug = request.nextUrl.searchParams.get("workspace")?.trim();
  if (!workspaceSlug) {
    return NextResponse.redirect(new URL(WORKSPACE_DIRECTORY_PATH, requestOrigin));
  }

  const workspace = await getWorkspaceSummary(workspaceSlug);
  if (!workspace) {
    return NextResponse.redirect(new URL(WORKSPACE_DIRECTORY_PATH, requestOrigin));
  }

  const nextPath = resolveWorkspaceNextPath(
    request.nextUrl.searchParams.get("next"),
  );
  const response = NextResponse.redirect(new URL(nextPath, requestOrigin));
  response.cookies.set({
    name: WORKSPACE_COOKIE_NAME,
    value: workspace.slug,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });

  return response;
}
