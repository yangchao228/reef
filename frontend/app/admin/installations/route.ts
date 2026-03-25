import { NextRequest, NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin-auth";
import {
  AdminSettingsError,
  autoBindModulesForInstallation,
  upsertWorkspaceGitHubInstallation,
} from "@/lib/admin-settings-repository";
import { getRequestOrigin } from "@/lib/request-origin";
import { ensureUserByGithubLogin } from "@/lib/user-repository";

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

function parseEvents(value: string | null) {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

export async function POST(request: NextRequest) {
  const adminAccess = await getAdminAccess(request.headers, request.cookies);
  if (!adminAccess.allowed || !adminAccess.workspaceSlug) {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "unauthorized"),
      { status: 303 },
    );
  }

  const formData = await request.formData();
  const installationIdRaw = formData.get("githubInstallationId")?.toString().trim() ?? "";
  const githubAccountLogin = formData.get("githubAccountLogin")?.toString().trim() ?? "";
  const githubAccountType = formData.get("githubAccountType")?.toString() === "organization"
    ? "organization"
    : "user";
  const permissionsRaw = formData.get("permissions")?.toString().trim() ?? "";
  const events = parseEvents(formData.get("events")?.toString() ?? null);
  const githubInstallationId = Number(installationIdRaw);

  if (!Number.isInteger(githubInstallationId) || githubInstallationId <= 0) {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "installation_invalid_id"),
      { status: 303 },
    );
  }

  if (!githubAccountLogin) {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "installation_missing_login"),
      { status: 303 },
    );
  }

  let permissions = {};
  if (permissionsRaw) {
    try {
      const parsed = JSON.parse(permissionsRaw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("PERMISSIONS_NOT_OBJECT");
      }
      permissions = parsed;
    } catch {
      return NextResponse.redirect(
        buildAdminRedirectUrl(request, "installation_invalid_permissions"),
        { status: 303 },
      );
    }
  }

  try {
    const installer = adminAccess.actor.githubLogin
      ? await ensureUserByGithubLogin({
          githubLogin: adminAccess.actor.githubLogin,
        })
      : null;

    const installation = await upsertWorkspaceGitHubInstallation({
      workspaceSlug: adminAccess.workspaceSlug,
      githubInstallationId,
      githubAccountLogin,
      githubAccountType,
      permissions,
      events,
      installedByUserId: installer?.id ?? null,
    });
    const autoBound = await autoBindModulesForInstallation({
      workspaceSlug: adminAccess.workspaceSlug,
      installationRowId: installation.id,
      githubAccountLogin: installation.githubAccountLogin,
    });

    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "installation_saved", autoBound.count),
      { status: 303 },
    );
  } catch (error) {
    if (error instanceof AdminSettingsError) {
      const settings =
        error.code === "INSTALLATION_CONFLICT"
          ? "installation_conflict"
          : "installation_save_failed";
      return NextResponse.redirect(buildAdminRedirectUrl(request, settings), {
        status: 303,
      });
    }

    throw error;
  }
}
