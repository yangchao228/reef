import { NextRequest, NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin-auth";
import { getRequestOrigin } from "@/lib/request-origin";
import { runWorkspaceCompensationSync } from "@/lib/sync/compensation.mjs";

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

export async function POST(request: NextRequest) {
  const adminAccess = await getAdminAccess(request.headers, request.cookies);
  if (!adminAccess.allowed || !adminAccess.workspaceSlug) {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "unauthorized"),
      { status: 303 },
    );
  }

  const formData = await request.formData();
  const scope = formData.get("scope")?.toString().trim() ?? "failed";
  const moduleSlug = formData.get("moduleSlug")?.toString().trim() || null;
  const onlyFailed = scope !== "all";

  try {
    const summary = await runWorkspaceCompensationSync({
      workspaceSlug: adminAccess.workspaceSlug,
      moduleSlug,
      onlyFailed,
      purgeMissing: true,
      limit: 100,
    });

    if (summary.scanned === 0) {
      return NextResponse.redirect(
        buildAdminRedirectUrl(request, "compensate_sync_no_targets", {
          scope,
          module: moduleSlug ?? "",
        }),
        { status: 303 },
      );
    }

    const settings = summary.failed > 0
      ? "compensate_sync_partial"
      : "compensate_sync_completed";

    return NextResponse.redirect(
        buildAdminRedirectUrl(request, settings, {
          scope,
          module: moduleSlug ?? "",
          attempted: String(summary.attempted),
          completed: String(summary.completed),
          failed: String(summary.failed),
          skipped: String(summary.skipped),
          compensationRunId: summary.compensationRunId,
        }),
        { status: 303 },
      );
  } catch (error) {
    const errorCode =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : "SYNC_FAILED";
    const details =
      error instanceof Error && "details" in error && error.details && typeof error.details === "object"
        ? error.details
        : null;

    const settings =
      errorCode === "COMPENSATION_ALREADY_RUNNING"
        ? "compensate_sync_running"
        : errorCode === "COMPENSATION_RECENT_DUPLICATE"
        ? "compensate_sync_recent_duplicate"
        : "compensate_sync_failed";

    return NextResponse.redirect(
      buildAdminRedirectUrl(request, settings, {
        scope,
        module: moduleSlug ?? "",
        errorCode,
        compensationRunId:
          details && "compensationRunId" in details && typeof details.compensationRunId === "string"
            ? details.compensationRunId
            : "",
      }),
      { status: 303 },
    );
  }
}
