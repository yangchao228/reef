import { NextResponse } from "next/server";

import { listCategories } from "@/lib/content-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    data: await listCategories(),
    error: null,
  });
}
