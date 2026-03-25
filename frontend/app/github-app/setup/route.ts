import { NextRequest, NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin-auth";
import {
  AdminSettingsError,
  autoBindModulesForInstallation,
  upsertWorkspaceGitHubInstallation,
} from "@/lib/admin-settings-repository";
import { parseGitHubAppState } from "@/lib/github-app";
import {
  GitHubOAuthTokenResult,
  refreshGitHubOAuthAccessToken,
  userCanAccessInstallation,
} from "@/lib/github-oauth";
import { getRequestOrigin } from "@/lib/request-origin";
import { ensureUserByGithubLogin } from "@/lib/user-repository";
import {
  isTimestampExpired,
  resolveUserAccessToken,
  resolveUserAccessTokenExpiresAt,
  resolveUserAuthSource,
  resolveUserLogin,
  resolveUserRefreshToken,
  resolveUserRefreshTokenExpiresAt,
  setGitHubOAuthTokenCookies,
} from "@/lib/user-session";
import { fetchGitHubAppInstallationDetails } from "@/lib/sync/github.mjs";

function buildAdminRedirectUrl(
  request: NextRequest,
  settings: string,
  autoBound?: number,
) {
  const url = new URL("/admin", getRequestOrigin(request));
  url.searchParams.set("settings", settings);
  if (typeof autoBound === "number") {
    url.searchParams.set("autoBound", String(autoBound));
  }
  return url;
}

function createHeaderStore(workspaceSlug: string, githubLogin: string) {
  return {
    get(name: string) {
      if (name === "x-reef-workspace") {
        return workspaceSlug;
      }

      if (name === "x-reef-user-login") {
        return githubLogin;
      }

      return null;
    },
  };
}

export async function GET(request: NextRequest) {
  const state = parseGitHubAppState(request.nextUrl.searchParams.get("state"));
  const setupAction = request.nextUrl.searchParams.get("setup_action")?.trim() ?? "";
  const installationIdRaw = request.nextUrl.searchParams.get("installation_id")?.trim() ?? "";
  const currentUserLogin = resolveUserLogin(request.headers, request.cookies);
  const currentUserAccessToken = resolveUserAccessToken(request.cookies);
  const currentUserRefreshToken = resolveUserRefreshToken(request.cookies);
  const currentUserAccessTokenExpiresAt = resolveUserAccessTokenExpiresAt(request.cookies);
  const currentUserRefreshTokenExpiresAt = resolveUserRefreshTokenExpiresAt(
    request.cookies,
  );
  const authSource = resolveUserAuthSource(request.cookies);

  if (!state || !currentUserLogin || currentUserLogin !== state.actorLogin) {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "installation_state_invalid"),
      { status: 303 },
    );
  }

  const adminAccess = await getAdminAccess(
    createHeaderStore(state.workspaceSlug, currentUserLogin),
    request.cookies,
  );
  if (!adminAccess.allowed || !adminAccess.workspaceSlug) {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "unauthorized"),
      { status: 303 },
    );
  }

  if (setupAction === "request") {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "installation_request_pending"),
      { status: 303 },
    );
  }

  const installationId = Number(installationIdRaw);
  if (!Number.isInteger(installationId) || installationId <= 0) {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "installation_invalid_id"),
      { status: 303 },
    );
  }

  if (authSource !== "github_oauth") {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "installation_oauth_required"),
      { status: 303 },
    );
  }

  let refreshedTokenResult: GitHubOAuthTokenResult | null = null;
  const buildRedirectResponse = (settings: string, autoBound?: number) => {
    const response = NextResponse.redirect(
      buildAdminRedirectUrl(request, settings, autoBound),
      { status: 303 },
    );
    if (refreshedTokenResult) {
      setGitHubOAuthTokenCookies(response.cookies, refreshedTokenResult);
    }
    return response;
  };

  try {
    let accessToken = currentUserAccessToken;
    const needsTokenRefresh =
      !accessToken || isTimestampExpired(currentUserAccessTokenExpiresAt, 60 * 1000);

    if (needsTokenRefresh) {
      if (
        !currentUserRefreshToken ||
        isTimestampExpired(currentUserRefreshTokenExpiresAt, 60 * 1000)
      ) {
        return buildRedirectResponse("installation_oauth_expired");
      }

      refreshedTokenResult = await refreshGitHubOAuthAccessToken(currentUserRefreshToken);
      accessToken = refreshedTokenResult.accessToken;
    }

    if (!accessToken) {
      return buildRedirectResponse("installation_oauth_expired");
    }

    let canAccessInstallation: boolean;
    try {
      canAccessInstallation = await userCanAccessInstallation({
        accessToken,
        installationId,
      });
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? String(error.code) : null;
      if (
        code === "GITHUB_USER_ACCESS_TOKEN_INVALID" &&
        currentUserRefreshToken &&
        !refreshedTokenResult &&
        !isTimestampExpired(currentUserRefreshTokenExpiresAt, 60 * 1000)
      ) {
        refreshedTokenResult = await refreshGitHubOAuthAccessToken(currentUserRefreshToken);
        canAccessInstallation = await userCanAccessInstallation({
          accessToken: refreshedTokenResult.accessToken,
          installationId,
        });
      } else {
        throw error;
      }
    }

    if (!canAccessInstallation) {
      return buildRedirectResponse("installation_not_accessible");
    }

    const [installer, installation] = await Promise.all([
      ensureUserByGithubLogin({
        githubLogin: currentUserLogin,
      }),
      fetchGitHubAppInstallationDetails(installationId),
    ]);

    if (!installation.accountLogin) {
      return buildRedirectResponse("installation_metadata_missing");
    }

    const installationRecord = await upsertWorkspaceGitHubInstallation({
      workspaceSlug: adminAccess.workspaceSlug,
      githubInstallationId: Number(installation.id),
      githubAccountLogin: installation.accountLogin,
      githubAccountType: installation.accountType,
      permissions: installation.permissions,
      events: installation.events,
      installedByUserId: installer.id,
    });
    const autoBound = await autoBindModulesForInstallation({
      workspaceSlug: adminAccess.workspaceSlug,
      installationRowId: installationRecord.id,
      githubAccountLogin: installationRecord.githubAccountLogin,
    });

    return buildRedirectResponse("installation_saved", autoBound.count);
  } catch (error) {
    if (error instanceof AdminSettingsError) {
      return buildRedirectResponse("installation_conflict");
    }

    if (error instanceof Error) {
      const code = "code" in error ? error.code : null;
      const settings =
        code === "GITHUB_INSTALLATION_NOT_FOUND"
          ? "installation_lookup_failed"
          : code === "GITHUB_APP_CONFIG_INVALID"
          ? "installation_app_config_missing"
          : code === "GITHUB_OAUTH_REFRESH_FAILED" ||
            code === "GITHUB_OAUTH_REFRESH_TOKEN_MISSING"
          ? "installation_oauth_expired"
          : code === "GITHUB_USER_ACCESS_TOKEN_INVALID"
          ? "installation_oauth_expired"
          : code === "GITHUB_USER_INSTALLATIONS_FETCH_FAILED"
          ? "installation_access_check_failed"
          : "installation_save_failed";
      return buildRedirectResponse(settings);
    }

    throw error;
  }
}
