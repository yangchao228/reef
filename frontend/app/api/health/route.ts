import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    data: {
      status: "ok",
      mode: "next-only",
    },
    error: null,
  });
}
