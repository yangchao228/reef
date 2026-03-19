import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

type HeaderSource = Headers | { get(name: string): string | null };

function getAllowedIps() {
  const raw = process.env.ADMIN_IP_ALLOWLIST ?? "127.0.0.1,::1";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getRequestIp(headers: HeaderSource) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "";
  }

  return headers.get("x-real-ip") ?? "";
}

export function canAccessAdmin(headers: HeaderSource) {
  const ip = getRequestIp(headers);
  const allowedIps = getAllowedIps();

  if (!ip && process.env.NODE_ENV !== "production") {
    return true;
  }

  return allowedIps.includes(ip);
}
