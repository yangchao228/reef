import { NextRequest, NextResponse } from "next/server";

import { getRequestOrigin } from "@/lib/request-origin";
import {
  USER_AUTH_SOURCE_COOKIE_NAME,
  USER_ID_COOKIE_NAME,
  USER_LOGIN_COOKIE_NAME,
  clearGitHubOAuthTokenCookies,
  clearLegacyAdminLoginCookie,
} from "@/lib/user-session";
import { resolveInternalPath, WORKSPACE_DIRECTORY_PATH } from "@/lib/workspace";

export async function GET(request: NextRequest) {
  const returnTo = resolveInternalPath(
    request.nextUrl.searchParams.get("returnTo"),
  ) ?? WORKSPACE_DIRECTORY_PATH;
  const redirectUrl = new URL(returnTo, getRequestOrigin(request));
  redirectUrl.searchParams.set("auth", "signed_out");

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set({
    name: USER_LOGIN_COOKIE_NAME,
    value: "",
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 0,
  });
  response.cookies.set({
    name: USER_ID_COOKIE_NAME,
    value: "",
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 0,
  });
  response.cookies.set({
    name: USER_AUTH_SOURCE_COOKIE_NAME,
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
