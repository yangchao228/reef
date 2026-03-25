import { cookies, headers } from "next/headers";

export const USER_LOGIN_HEADER_NAME = "x-reef-user-login";
export const USER_LOGIN_COOKIE_NAME = "reef_user_login";
export const USER_ID_COOKIE_NAME = "reef_user_id";
export const USER_ACCESS_TOKEN_COOKIE_NAME = "reef_user_access_token";
export const USER_REFRESH_TOKEN_COOKIE_NAME = "reef_user_refresh_token";
export const USER_ACCESS_TOKEN_EXPIRES_AT_COOKIE_NAME =
  "reef_user_access_token_expires_at";
export const USER_REFRESH_TOKEN_EXPIRES_AT_COOKIE_NAME =
  "reef_user_refresh_token_expires_at";
export const USER_AUTH_SOURCE_COOKIE_NAME = "reef_user_auth_source";

const LEGACY_ADMIN_LOGIN_COOKIE_NAME = "reef_admin_login";

type HeaderLike = {
  get(name: string): string | null | undefined;
};

type CookieLike = {
  get(name: string): { value: string } | string | undefined;
};

type MutableCookieLike = {
  set(options: {
    name: string;
    value: string;
    path: string;
    sameSite: "lax" | "strict" | "none";
    httpOnly: boolean;
    expires?: Date;
    maxAge?: number;
  }): void;
};

export function normalizeGithubLogin(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return normalized;
}

export function isValidGithubLogin(value: string) {
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(value);
}

export function resolveUserLogin(
  headerStore?: HeaderLike | null,
  cookieStore?: CookieLike | null,
) {
  const fromUserHeader = normalizeGithubLogin(
    headerStore?.get(USER_LOGIN_HEADER_NAME),
  );
  if (fromUserHeader) {
    return fromUserHeader;
  }

  const userCookieValue = cookieStore?.get(USER_LOGIN_COOKIE_NAME);
  const fromUserCookie = normalizeGithubLogin(
    typeof userCookieValue === "string" ? userCookieValue : userCookieValue?.value,
  );
  if (fromUserCookie) {
    return fromUserCookie;
  }

  return null;
}

export function getRequestUserLogin() {
  return resolveUserLogin(headers(), cookies());
}

export function resolveUserId(cookieStore?: CookieLike | null) {
  const cookieValue = cookieStore?.get(USER_ID_COOKIE_NAME);
  const normalized = typeof cookieValue === "string" ? cookieValue : cookieValue?.value;
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

export function resolveUserAccessToken(cookieStore?: CookieLike | null) {
  const cookieValue = cookieStore?.get(USER_ACCESS_TOKEN_COOKIE_NAME);
  const normalized = typeof cookieValue === "string" ? cookieValue : cookieValue?.value;
  return normalized?.trim() || null;
}

export function resolveUserRefreshToken(cookieStore?: CookieLike | null) {
  const cookieValue = cookieStore?.get(USER_REFRESH_TOKEN_COOKIE_NAME);
  const normalized = typeof cookieValue === "string" ? cookieValue : cookieValue?.value;
  return normalized?.trim() || null;
}

function resolveNumericCookieValue(
  cookieStore: CookieLike | null | undefined,
  cookieName: string,
) {
  const cookieValue = cookieStore?.get(cookieName);
  const normalized = typeof cookieValue === "string" ? cookieValue : cookieValue?.value;
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveUserAccessTokenExpiresAt(cookieStore?: CookieLike | null) {
  return resolveNumericCookieValue(
    cookieStore,
    USER_ACCESS_TOKEN_EXPIRES_AT_COOKIE_NAME,
  );
}

export function resolveUserRefreshTokenExpiresAt(cookieStore?: CookieLike | null) {
  return resolveNumericCookieValue(
    cookieStore,
    USER_REFRESH_TOKEN_EXPIRES_AT_COOKIE_NAME,
  );
}

export function isTimestampExpired(
  timestamp: number | null | undefined,
  clockSkewMs = 0,
) {
  if (!timestamp) {
    return false;
  }

  return timestamp <= Date.now() + clockSkewMs;
}

function setSessionCookie(
  cookieStore: MutableCookieLike,
  name: string,
  value: string,
  expiresAt?: number | null,
) {
  cookieStore.set({
    name,
    value,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    expires:
      typeof expiresAt === "number" && Number.isFinite(expiresAt)
        ? new Date(expiresAt)
        : undefined,
  });
}

function clearSessionCookie(cookieStore: MutableCookieLike, name: string) {
  cookieStore.set({
    name,
    value: "",
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 0,
  });
}

export function setGitHubOAuthTokenCookies(
  cookieStore: MutableCookieLike,
  {
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
  }: {
    accessToken: string;
    refreshToken?: string | null;
    accessTokenExpiresAt?: number | null;
    refreshTokenExpiresAt?: number | null;
  },
) {
  setSessionCookie(
    cookieStore,
    USER_ACCESS_TOKEN_COOKIE_NAME,
    accessToken,
    accessTokenExpiresAt,
  );

  if (typeof accessTokenExpiresAt === "number" && Number.isFinite(accessTokenExpiresAt)) {
    setSessionCookie(
      cookieStore,
      USER_ACCESS_TOKEN_EXPIRES_AT_COOKIE_NAME,
      String(accessTokenExpiresAt),
      accessTokenExpiresAt,
    );
  } else {
    clearSessionCookie(cookieStore, USER_ACCESS_TOKEN_EXPIRES_AT_COOKIE_NAME);
  }

  if (refreshToken) {
    setSessionCookie(
      cookieStore,
      USER_REFRESH_TOKEN_COOKIE_NAME,
      refreshToken,
      refreshTokenExpiresAt,
    );
  } else {
    clearSessionCookie(cookieStore, USER_REFRESH_TOKEN_COOKIE_NAME);
  }

  if (typeof refreshTokenExpiresAt === "number" && Number.isFinite(refreshTokenExpiresAt)) {
    setSessionCookie(
      cookieStore,
      USER_REFRESH_TOKEN_EXPIRES_AT_COOKIE_NAME,
      String(refreshTokenExpiresAt),
      refreshTokenExpiresAt,
    );
  } else {
    clearSessionCookie(cookieStore, USER_REFRESH_TOKEN_EXPIRES_AT_COOKIE_NAME);
  }
}

export function clearGitHubOAuthTokenCookies(cookieStore: MutableCookieLike) {
  clearSessionCookie(cookieStore, USER_ACCESS_TOKEN_COOKIE_NAME);
  clearSessionCookie(cookieStore, USER_REFRESH_TOKEN_COOKIE_NAME);
  clearSessionCookie(cookieStore, USER_ACCESS_TOKEN_EXPIRES_AT_COOKIE_NAME);
  clearSessionCookie(cookieStore, USER_REFRESH_TOKEN_EXPIRES_AT_COOKIE_NAME);
}

export function clearLegacyAdminLoginCookie(cookieStore: MutableCookieLike) {
  clearSessionCookie(cookieStore, LEGACY_ADMIN_LOGIN_COOKIE_NAME);
}

export function resolveUserAuthSource(cookieStore?: CookieLike | null) {
  const cookieValue = cookieStore?.get(USER_AUTH_SOURCE_COOKIE_NAME);
  const normalized = typeof cookieValue === "string" ? cookieValue : cookieValue?.value;
  if (normalized === "github_oauth" || normalized === "manual") {
    return normalized;
  }

  return null;
}
