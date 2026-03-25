import { NextRequest, NextResponse } from "next/server";

import {
  exchangeGitHubOAuthCode,
  fetchGitHubViewer,
  parseGitHubOAuthState,
} from "@/lib/github-oauth";
import { getRequestOrigin } from "@/lib/request-origin";
import { ensureUserByGithubLogin } from "@/lib/user-repository";
import {
  clearLegacyAdminLoginCookie,
  USER_AUTH_SOURCE_COOKIE_NAME,
  USER_ID_COOKIE_NAME,
  USER_LOGIN_COOKIE_NAME,
  setGitHubOAuthTokenCookies,
} from "@/lib/user-session";
import { WORKSPACE_DIRECTORY_PATH } from "@/lib/workspace";

function buildRedirectUrl(request: NextRequest, returnTo: string, authState?: string) {
  const url = new URL(returnTo, getRequestOrigin(request));
  if (authState) {
    url.searchParams.set("auth", authState);
  }

  return url;
}

export async function GET(request: NextRequest) {
  const state = parseGitHubOAuthState(request.nextUrl.searchParams.get("state"));
  if (!state) {
    return NextResponse.redirect(
      buildRedirectUrl(request, WORKSPACE_DIRECTORY_PATH, "github_oauth_state_invalid"),
      { status: 303 },
    );
  }

  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.redirect(
      buildRedirectUrl(request, state.returnTo, "github_oauth_failed"),
      { status: 303 },
    );
  }

  try {
    const redirectUri = new URL(
      "/auth/github/callback",
      getRequestOrigin(request),
    ).toString();
    const tokenResult = await exchangeGitHubOAuthCode({
      code,
      redirectUri,
    });
    const viewer = await fetchGitHubViewer(tokenResult.accessToken);
    if (!viewer.githubLogin || !viewer.githubUserId) {
      return NextResponse.redirect(
        buildRedirectUrl(request, state.returnTo, "github_oauth_failed"),
        { status: 303 },
      );
    }

    await ensureUserByGithubLogin({
      githubLogin: viewer.githubLogin,
      githubUserId: viewer.githubUserId,
      name: viewer.name,
      avatarUrl: viewer.avatarUrl,
      email: viewer.email,
    });

    const response = NextResponse.redirect(
      buildRedirectUrl(request, state.returnTo),
      { status: 303 },
    );
    response.cookies.set({
      name: USER_LOGIN_COOKIE_NAME,
      value: viewer.githubLogin.toLowerCase(),
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
    response.cookies.set({
      name: USER_ID_COOKIE_NAME,
      value: String(viewer.githubUserId),
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
    setGitHubOAuthTokenCookies(response.cookies, tokenResult);
    response.cookies.set({
      name: USER_AUTH_SOURCE_COOKIE_NAME,
      value: "github_oauth",
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
    clearLegacyAdminLoginCookie(response.cookies);

    return response;
  } catch {
    return NextResponse.redirect(
      buildRedirectUrl(request, state.returnTo, "github_oauth_failed"),
      { status: 303 },
    );
  }
}
