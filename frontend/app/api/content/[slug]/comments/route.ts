import { NextRequest, NextResponse } from "next/server";

import { createComment, getApprovedComments } from "@/lib/content-repository";
import { decodeRouteParam } from "@/lib/route-param";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const slug = decodeRouteParam(params.slug);
  return NextResponse.json({
    data: await getApprovedComments(slug),
    error: null,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const body = (await request.json()) as {
    nickname?: string;
    body?: string;
    fingerprint?: string;
  };
  const slug = decodeRouteParam(params.slug);

  if (!body.nickname || !body.body || !body.fingerprint) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "INVALID_INPUT",
          message: "昵称、评论内容和指纹不能为空。",
        },
      },
      { status: 400 },
    );
  }

  try {
    await createComment(slug, body.nickname, body.body, body.fingerprint);
  } catch (error) {
    if (error instanceof Error && error.message === "CONTENT_NOT_FOUND") {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: "CONTENT_NOT_FOUND",
            message: "内容不存在。",
          },
        },
        { status: 404 },
      );
    }

    throw error;
  }

  return NextResponse.json({
    data: {
      message: "评论已提交，审核后展示。",
    },
    error: null,
  });
}
