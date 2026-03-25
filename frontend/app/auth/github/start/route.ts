import { NextRequest, NextResponse } from "next/server";

import {
  buildGitHubOAuthAuthorizeUrl,
  hasGitHubOAuthConfig,
} from "@/lib/github-oauth";
import { getRequestOrigin } from "@/lib/request-origin";
import { resolveInternalPath, WORKSPACE_DIRECTORY_PATH } from "@/lib/workspace";

export async function GET(request: NextRequest) {
  if (!hasGitHubOAuthConfig()) {
    const fallback = new URL(WORKSPACE_DIRECTORY_PATH, getRequestOrigin(request));
    fallback.searchParams.set("auth", "github_oauth_config_missing");
    return NextResponse.redirect(fallback, { status: 303 });
  }

  const returnTo = resolveInternalPath(
    request.nextUrl.searchParams.get("returnTo"),
  ) ?? WORKSPACE_DIRECTORY_PATH;
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  if (!clientId) {
    const fallback = new URL(WORKSPACE_DIRECTORY_PATH, getRequestOrigin(request));
    fallback.searchParams.set("auth", "github_oauth_config_missing");
    return NextResponse.redirect(fallback, { status: 303 });
  }

  const redirectUri = new URL(
    "/auth/github/callback",
    getRequestOrigin(request),
  ).toString();
  const authorizeUrl = buildGitHubOAuthAuthorizeUrl({
    clientId,
    redirectUri,
    returnTo,
  });

  if (!authorizeUrl) {
    const fallback = new URL(WORKSPACE_DIRECTORY_PATH, getRequestOrigin(request));
    fallback.searchParams.set("auth", "github_oauth_config_missing");
    return NextResponse.redirect(fallback, { status: 303 });
  }

  return NextResponse.redirect(authorizeUrl, { status: 303 });
}
