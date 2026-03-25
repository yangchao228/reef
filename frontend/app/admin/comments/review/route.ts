import { NextRequest, NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin-auth";
import { reviewComment } from "@/lib/content-repository";
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
  const commentId = formData.get("commentId")?.toString().trim() ?? "";
  const decision = formData.get("decision")?.toString().trim() ?? "";

  if (!commentId) {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "comment_missing_id"),
      { status: 303 },
    );
  }

  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "comment_invalid_decision"),
      { status: 303 },
    );
  }

  const comment = await reviewComment(commentId, decision, adminAccess.workspaceSlug);
  if (!comment) {
    return NextResponse.redirect(
      buildAdminRedirectUrl(request, "comment_review_missing"),
      { status: 303 },
    );
  }

  return NextResponse.redirect(
    buildAdminRedirectUrl(
      request,
      decision === "approved" ? "comment_approved" : "comment_rejected",
    ),
    { status: 303 },
  );
}
