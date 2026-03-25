import crypto from "node:crypto";

type GitHubOAuthStatePayload = {
  returnTo: string;
  issuedAt: number;
};

export type GitHubOAuthTokenResult = {
  accessToken: string;
  tokenType: string;
  accessTokenExpiresAt: number | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: number | null;
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

function getGitHubOAuthStateSecret() {
  return process.env.GITHUB_OAUTH_STATE_SECRET?.trim()
    ?? process.env.GITHUB_APP_STATE_SECRET?.trim()
    ?? process.env.NEXTAUTH_SECRET?.trim()
    ?? null;
}

function signStatePayload(encodedPayload: string, secret: string) {
  return encodeBase64Url(
    crypto.createHmac("sha256", secret).update(encodedPayload).digest("hex"),
  );
}

export function buildGitHubOAuthAuthorizeUrl({
  clientId,
  redirectUri,
  returnTo,
}: {
  clientId: string;
  redirectUri: string;
  returnTo: string;
}) {
  const secret = getGitHubOAuthStateSecret();
  if (!secret) {
    return null;
  }

  const payload: GitHubOAuthStatePayload = {
    returnTo,
    issuedAt: Date.now(),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signStatePayload(encodedPayload, secret);
  const state = `${encodedPayload}.${signature}`;

  const searchParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  return `https://github.com/login/oauth/authorize?${searchParams.toString()}`;
}

export function parseGitHubOAuthState(state?: string | null) {
  const normalized = state?.trim();
  const secret = getGitHubOAuthStateSecret();
  if (!normalized || !secret) {
    return null;
  }

  const [encodedPayload, signature] = normalized.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signStatePayload(encodedPayload, secret);
  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(encodedPayload)) as GitHubOAuthStatePayload;
    if (
      !parsed ||
      typeof parsed.returnTo !== "string" ||
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

function getGitHubOAuthClientConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
  };
}

function createGitHubOAuthError(code: string) {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

function resolveExpiryTimestamp(secondsUntilExpiry: unknown) {
  const parsed = Number(secondsUntilExpiry);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Date.now() + (parsed * 1000);
}

async function requestGitHubOAuthToken(
  body: Record<string, string>,
): Promise<GitHubOAuthTokenResult> {
  const config = getGitHubOAuthClientConfig();
  if (!config) {
    throw createGitHubOAuthError("GITHUB_OAUTH_CONFIG_MISSING");
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...body,
  });
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const payload = await response.json();
  if (!response.ok || !payload?.access_token) {
    const errorCode =
      typeof payload?.error === "string"
        ? payload.error
        : body.grant_type === "refresh_token"
        ? "GITHUB_OAUTH_REFRESH_FAILED"
        : "GITHUB_OAUTH_EXCHANGE_FAILED";
    throw createGitHubOAuthError(errorCode);
  }

  return {
    accessToken: String(payload.access_token),
    tokenType: typeof payload.token_type === "string" ? payload.token_type : "bearer",
    accessTokenExpiresAt: resolveExpiryTimestamp(payload.expires_in),
    refreshToken:
      typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    refreshTokenExpiresAt: resolveExpiryTimestamp(payload.refresh_token_expires_in),
  };
}

export async function exchangeGitHubOAuthCode({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}) {
  return requestGitHubOAuthToken({
    code,
    redirect_uri: redirectUri,
  });
}

export async function refreshGitHubOAuthAccessToken(refreshToken: string) {
  const normalizedRefreshToken = refreshToken.trim();
  if (!normalizedRefreshToken) {
    throw createGitHubOAuthError("GITHUB_OAUTH_REFRESH_TOKEN_MISSING");
  }

  return requestGitHubOAuthToken({
    grant_type: "refresh_token",
    refresh_token: normalizedRefreshToken,
  });
}

function buildGitHubApiHeaders(accessToken: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "reef-github-oauth",
  };
}

export async function fetchGitHubViewer(accessToken: string) {
  const [userResponse, emailResponse] = await Promise.all([
    fetch("https://api.github.com/user", {
      headers: buildGitHubApiHeaders(accessToken),
    }),
    fetch("https://api.github.com/user/emails", {
      headers: buildGitHubApiHeaders(accessToken),
    }),
  ]);

  if (!userResponse.ok) {
    throw new Error("GITHUB_VIEWER_FETCH_FAILED");
  }

  const user = await userResponse.json();
  const emails = emailResponse.ok ? await emailResponse.json() : [];
  const primaryEmail = Array.isArray(emails)
    ? emails.find((entry) => entry?.primary)?.email ?? emails[0]?.email ?? null
    : null;

  return {
    githubUserId: typeof user?.id === "number" ? user.id : null,
    githubLogin: typeof user?.login === "string" ? user.login : null,
    name: typeof user?.name === "string" ? user.name : null,
    avatarUrl: typeof user?.avatar_url === "string" ? user.avatar_url : null,
    email: typeof primaryEmail === "string" ? primaryEmail : null,
  };
}

export async function userCanAccessInstallation({
  accessToken,
  installationId,
}: {
  accessToken: string;
  installationId: number;
}) {
  let page = 1;

  while (page <= 5) {
    const response = await fetch(
      `https://api.github.com/user/installations?per_page=100&page=${page}`,
      {
        headers: buildGitHubApiHeaders(accessToken),
      },
    );

    if (!response.ok) {
      throw createGitHubOAuthError(
        response.status === 401
          ? "GITHUB_USER_ACCESS_TOKEN_INVALID"
          : "GITHUB_USER_INSTALLATIONS_FETCH_FAILED",
      );
    }

    const payload = await response.json() as {
      installations?: Array<{ id?: number | string }>;
    };
    const installations = Array.isArray(payload?.installations)
      ? payload.installations
      : [];
    if (
      installations.some(
        (installation) => Number(installation?.id) === installationId,
      )
    ) {
      return true;
    }

    if (installations.length < 100) {
      return false;
    }

    page += 1;
  }

  return false;
}

export function hasGitHubOAuthConfig() {
  return Boolean(getGitHubOAuthClientConfig() && getGitHubOAuthStateSecret());
}
