import { NextRequest, NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin-auth";
import {
  AdminSettingsError,
  updateModuleInstallationBinding,
} from "@/lib/admin-settings-repository";
import { getRequestOrigin } from "@/lib/request-origin";

function buildAdminRedirectUrl(request: NextRequest, settings: string) {
  const url = new URL("/admin", getRequestOrigin(request));
  url.searchParams.set("settings", settings);
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
  const moduleSlug = formData.get("moduleSlug")?.toString().trim() ?? "";
  const installationRowId = formData.get("installationRowId")?.toString().trim() ?? "";

  if (!moduleSlug) {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "binding_missing_module"),
      { status: 303 },
    );
  }

  try {
    await updateModuleInstallationBinding({
      workspaceSlug: adminAccess.workspaceSlug,
      moduleSlug,
      installationRowId: installationRowId || null,
    });

    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "binding_saved"),
      { status: 303 },
    );
  } catch (error) {
    if (error instanceof AdminSettingsError) {
      const settings =
        error.code === "INSTALLATION_NOT_FOUND"
          ? "binding_installation_missing"
          : error.code === "MODULE_NOT_FOUND"
          ? "binding_module_missing"
          : "binding_failed";
      return NextResponse.redirect(buildAdminRedirectUrl(request, settings), {
        status: 303,
      });
    }

    throw error;
  }
}
