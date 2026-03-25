import { NextRequest } from "next/server";

export function getRequestOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
  const host = request.headers.get("x-forwarded-host")?.trim()
    ?? request.headers.get("host")?.trim();

  if (forwardedProto && host) {
    return `${forwardedProto}://${host}`;
  }

  if (host) {
    return `${request.nextUrl.protocol}//${host}`;
  }

  return request.nextUrl.origin;
}
