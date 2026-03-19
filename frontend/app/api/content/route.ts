import { NextRequest, NextResponse } from "next/server";

import { listAllContent, listModuleContent } from "@/lib/content-repository";
import { ModuleSlug } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category") ?? undefined;
  const tag = request.nextUrl.searchParams.get("tag") ?? undefined;
  const module = request.nextUrl.searchParams.get("module") as ModuleSlug | null;

  const data = module
    ? await listModuleContent(module, {
        category,
        tag,
      })
    : (await listAllContent()).filter((item) => {
        if (category && item.category !== category) {
          return false;
        }
        if (tag && !item.tags.includes(tag)) {
          return false;
        }
        return true;
      });

  return NextResponse.json({
    data,
    error: null,
  });
}
