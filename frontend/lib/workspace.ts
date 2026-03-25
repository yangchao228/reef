import { cookies, headers } from "next/headers";

export const WORKSPACE_HEADER_NAME = "x-reef-workspace";
export const WORKSPACE_COOKIE_NAME = "reef_workspace";
export const WORKSPACE_DIRECTORY_PATH = "/workspaces";

type HeaderLike = {
  get(name: string): string | null | undefined;
};

type CookieLike = {
  get(name: string): { value: string } | string | undefined;
};

function normalizeWorkspaceSlug(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

function normalizeNextPath(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || !normalized.startsWith("/") || normalized.startsWith("//")) {
    return null;
  }

  return normalized;
}

export function resolveWorkspaceSlug(
  headerStore?: HeaderLike | null,
  cookieStore?: CookieLike | null,
) {
  const fromHeader = normalizeWorkspaceSlug(
    headerStore?.get(WORKSPACE_HEADER_NAME),
  );
  if (fromHeader) {
    return fromHeader;
  }

  const cookieValue = cookieStore?.get(WORKSPACE_COOKIE_NAME);
  const fromCookie = normalizeWorkspaceSlug(
    typeof cookieValue === "string" ? cookieValue : cookieValue?.value,
  );
  if (fromCookie) {
    return fromCookie;
  }

  return null;
}

export function getRequestWorkspaceSlug() {
  return resolveWorkspaceSlug(headers(), cookies());
}

export function buildWorkspaceDirectoryHref(nextPath?: string | null) {
  const normalizedNextPath = normalizeNextPath(nextPath);
  if (!normalizedNextPath) {
    return WORKSPACE_DIRECTORY_PATH;
  }

  const searchParams = new URLSearchParams({
    next: normalizedNextPath,
  });

  return `${WORKSPACE_DIRECTORY_PATH}?${searchParams.toString()}`;
}

export function buildWorkspaceActivationHref(
  workspaceSlug: string,
  nextPath?: string | null,
) {
  const searchParams = new URLSearchParams({
    workspace: workspaceSlug,
  });
  const normalizedNextPath = normalizeNextPath(nextPath);
  if (normalizedNextPath) {
    searchParams.set("next", normalizedNextPath);
  }

  return `${WORKSPACE_DIRECTORY_PATH}/select?${searchParams.toString()}`;
}

export function normalizeWorkspaceSlugInput(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return normalized;
}

export function isValidWorkspaceSlug(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/.test(value);
}

export function resolveInternalPath(value: string | null | undefined) {
  return normalizeNextPath(value);
}

export function resolveWorkspaceNextPath(value: string | null | undefined) {
  return normalizeNextPath(value) ?? "/";
}
