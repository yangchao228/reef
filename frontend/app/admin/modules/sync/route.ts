import { NextRequest, NextResponse } from "next/server";

import {
  AdminSettingsError,
  getWorkspaceModuleSyncTarget,
} from "@/lib/admin-settings-repository";
import { getAdminAccess } from "@/lib/admin-auth";
import { getRequestOrigin } from "@/lib/request-origin";
import { syncGitHubModule } from "@/lib/sync/github.mjs";

function buildAdminRedirectUrl(
  request: NextRequest,
  settings: string,
  extra?: Record<string, string>,
) {
  const url = new URL("/admin", getRequestOrigin(request));
  url.searchParams.set("settings", settings);
  for (const [key, value] of Object.entries(extra ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

function getSyncErrorCode(error: unknown) {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code;
  }

  return "SYNC_FAILED";
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
  const moduleSlug = formData.get("moduleSlug")?.toString().trim() ?? "";

  if (!moduleSlug) {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "module_sync_missing_module"),
      { status: 303 },
    );
  }

  try {
    const target = await getWorkspaceModuleSyncTarget({
      workspaceSlug: adminAccess.workspaceSlug,
      moduleSlug,
    });
    const result = await syncGitHubModule({
      moduleSlug: target.moduleSlug,
      owner: target.githubOwner,
      repo: target.githubRepo,
      branch: target.branch,
      watchPaths: target.watchPaths,
      existingRepoId: target.repoId,
      existingWorkspaceId: target.workspaceId,
      targetWorkspaceSlug: adminAccess.workspaceSlug,
      triggerType: "manual",
      purgeMissing: true,
    });

    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "module_sync_completed", {
        module: result.moduleSlug,
        count: String(result.importedCount),
        authSource: result.authSource,
      }),
      { status: 303 },
    );
  } catch (error) {
    if (error instanceof AdminSettingsError) {
      const settings =
        error.code === "MODULE_NOT_FOUND"
          ? "module_sync_missing_module"
          : error.code === "MODULE_SYNC_CONFIG_INVALID"
          ? "module_sync_invalid_config"
          : "module_sync_failed";
      return NextResponse.redirect(
        buildAdminRedirectUrl(request, settings, {
          module: moduleSlug,
        }),
        { status: 303 },
      );
    }

    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "module_sync_failed", {
        module: moduleSlug,
        errorCode: getSyncErrorCode(error),
      }),
      { status: 303 },
    );
  }
}
