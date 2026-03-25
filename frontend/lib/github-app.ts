import crypto from "node:crypto";

export const GITHUB_APP_SETUP_PATH = "/github-app/setup";

type GitHubAppStatePayload = {
  workspaceSlug: string;
  actorLogin: string;
  issuedAt: number;
};

function encodeBase64Url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function getGitHubAppStateSecret() {
  const secret = process.env.GITHUB_APP_STATE_SECRET?.trim()
    ?? process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    return null;
  }

  return secret;
}

export function getGitHubAppInstallUrl({
  workspaceSlug,
  actorLogin,
}: {
  workspaceSlug: string;
  actorLogin: string;
}) {
  const appName = process.env.GITHUB_APP_NAME?.trim();
  const secret = getGitHubAppStateSecret();
  if (!appName || !secret) {
    return null;
  }

  const payload: GitHubAppStatePayload = {
    workspaceSlug,
    actorLogin,
    issuedAt: Date.now(),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = encodeBase64Url(
    crypto.createHmac("sha256", secret).update(encodedPayload).digest("hex"),
  );
  const state = `${encodedPayload}.${signature}`;

  return `https://github.com/apps/${encodeURIComponent(appName)}/installations/new?state=${encodeURIComponent(state)}`;
}

export function parseGitHubAppState(state?: string | null) {
  const normalized = state?.trim();
  const secret = getGitHubAppStateSecret();
  if (!normalized || !secret) {
    return null;
  }

  const [encodedPayload, signature] = normalized.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = encodeBase64Url(
    crypto.createHmac("sha256", secret).update(encodedPayload).digest("hex"),
  );

  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(encodedPayload)) as GitHubAppStatePayload;
    if (
      !parsed ||
      typeof parsed.workspaceSlug !== "string" ||
      typeof parsed.actorLogin !== "string" ||
      typeof parsed.issuedAt !== "number"
    ) {
      return null;
    }

    if (Date.now() - parsed.issuedAt > 30 * 60 * 1000) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
