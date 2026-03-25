import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const workspaceHeaderName = "x-reef-workspace";
const workspaceCookieName = "reef_workspace";
const userLoginHeaderName = "x-reef-user-login";
const userLoginCookieName = "reef_user_login";

export function middleware(request: NextRequest) {
  const workspaceSlug = request.headers.get(workspaceHeaderName)?.trim();
  const userLogin = request.headers.get(userLoginHeaderName)?.trim();
  if (!workspaceSlug && !userLogin) {
    return NextResponse.next();
  }

  const currentWorkspaceCookie = request.cookies.get(workspaceCookieName)?.value;
  const currentUserCookie = request.cookies.get(userLoginCookieName)?.value;
  if (
    (!workspaceSlug || currentWorkspaceCookie === workspaceSlug) &&
    (!userLogin || currentUserCookie === userLogin)
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  if (workspaceSlug) {
    response.cookies.set({
      name: workspaceCookieName,
      value: workspaceSlug,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
  }

  if (userLogin) {
    response.cookies.set({
      name: userLoginCookieName,
      value: userLogin,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
