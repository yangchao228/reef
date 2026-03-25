import { NextRequest, NextResponse } from "next/server";

import { getRequestOrigin } from "@/lib/request-origin";
import { ensureUserByGithubLogin } from "@/lib/user-repository";
import { resolveUserLogin } from "@/lib/user-session";
import {
  buildWorkspaceDirectoryHref,
  isValidWorkspaceSlug,
  normalizeWorkspaceSlugInput,
  resolveInternalPath,
  resolveWorkspaceNextPath,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspace";
import {
  createWorkspaceForUser,
  WorkspaceCreationError,
} from "@/lib/workspace-repository";

function redirectToDirectory(
  request: NextRequest,
  nextPath: string | null,
  createState: string,
) {
  const url = new URL(
    buildWorkspaceDirectoryHref(nextPath),
    getRequestOrigin(request),
  );
  url.searchParams.set("create", createState);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const nextPath = resolveInternalPath(formData.get("next")?.toString());
  const currentUserLogin = resolveUserLogin(request.headers, request.cookies);

  if (!currentUserLogin) {
    return redirectToDirectory(request, nextPath, "login_required");
  }

  const workspaceSlug = normalizeWorkspaceSlugInput(
    formData.get("workspaceSlug")?.toString(),
  );
  const workspaceName = formData.get("workspaceName")?.toString()?.trim() ?? "";
  const description = formData.get("description")?.toString() ?? null;
  const visibility = formData.get("visibility")?.toString() === "public"
    ? "public"
    : "private";

  if (!workspaceSlug || !isValidWorkspaceSlug(workspaceSlug)) {
    return redirectToDirectory(request, nextPath, "invalid_slug");
  }

  if (!workspaceName) {
    return redirectToDirectory(request, nextPath, "missing_name");
  }

  const owner = await ensureUserByGithubLogin({
    githubLogin: currentUserLogin,
  });

  try {
    const workspace = await createWorkspaceForUser({
      ownerUserId: owner.id,
      workspaceSlug,
      workspaceName,
      description,
      visibility,
    });

    const response = NextResponse.redirect(
      new URL(
        resolveWorkspaceNextPath(nextPath),
        getRequestOrigin(request),
      ),
      { status: 303 },
    );
    response.cookies.set({
      name: WORKSPACE_COOKIE_NAME,
      value: workspace.slug,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });

    return response;
  } catch (error) {
    if (
      error instanceof WorkspaceCreationError &&
      error.code === "WORKSPACE_SLUG_TAKEN"
    ) {
      return redirectToDirectory(request, nextPath, "slug_taken");
    }

    throw error;
  }
}
