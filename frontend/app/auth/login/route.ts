import { NextRequest, NextResponse } from "next/server";

import { getRequestOrigin } from "@/lib/request-origin";
import { ensureUserByGithubLogin } from "@/lib/user-repository";
import {
  clearGitHubOAuthTokenCookies,
  clearLegacyAdminLoginCookie,
  isValidGithubLogin,
  normalizeGithubLogin,
  USER_AUTH_SOURCE_COOKIE_NAME,
  USER_ID_COOKIE_NAME,
  USER_LOGIN_COOKIE_NAME,
} from "@/lib/user-session";
import { resolveInternalPath, WORKSPACE_DIRECTORY_PATH } from "@/lib/workspace";

function buildRedirectUrl(
  request: NextRequest,
  returnTo: string,
  authState?: string,
) {
  const url = new URL(returnTo, getRequestOrigin(request));
  if (authState) {
    url.searchParams.set("auth", authState);
  }

  return url;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const githubLogin = normalizeGithubLogin(formData.get("githubLogin")?.toString());
  const name = formData.get("name")?.toString() ?? null;
  const returnTo = resolveInternalPath(formData.get("returnTo")?.toString())
    ?? WORKSPACE_DIRECTORY_PATH;

  if (!githubLogin || !isValidGithubLogin(githubLogin)) {
    return NextResponse.redirect(
      buildRedirectUrl(request, returnTo, "invalid_login"),
      { status: 303 },
    );
  }

  await ensureUserByGithubLogin({
    githubLogin,
    name,
  });

  const response = NextResponse.redirect(buildRedirectUrl(request, returnTo), {
    status: 303,
  });
  response.cookies.set({
    name: USER_LOGIN_COOKIE_NAME,
    value: githubLogin,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
  response.cookies.set({
    name: USER_AUTH_SOURCE_COOKIE_NAME,
    value: "manual",
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
  response.cookies.set({
    name: USER_ID_COOKIE_NAME,
    value: "",
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 0,
  });
  clearGitHubOAuthTokenCookies(response.cookies);
  clearLegacyAdminLoginCookie(response.cookies);

  return response;
}
