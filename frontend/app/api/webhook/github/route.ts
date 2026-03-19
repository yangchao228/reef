import crypto from "node:crypto";
import path from "node:path";

import dotenv from "dotenv";
import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { syncGitHubModule } from "@/lib/sync/github.mjs";
import { ModuleSlug } from "@/lib/types";

export const dynamic = "force-dynamic";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

type RepoRegistryMeta = {
  branch?: string;
};

type RepoRegistryRow = {
  id: string;
  slug: ModuleSlug;
  watch_paths: string[];
  meta: RepoRegistryMeta | null;
};

type SyncRouteError = Error & {
  code?: string;
  status?: number;
  details?: unknown;
};

function verifySignature(rawBody: string, signature: string | null) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("GITHUB_WEBHOOK_SECRET_MISSING");
  }

  if (!signature?.startsWith("sha256=")) {
    return false;
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expected = `sha256=${digest}`;
  if (signature.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function parseBranch(ref: string) {
  return ref.replace(/^refs\/heads\//, "");
}

function shouldSyncModule(changedFiles: string[], watchPaths: string[]) {
  if (changedFiles.length === 0) {
    return true;
  }

  return watchPaths.some((watchPath) =>
    changedFiles.some(
      (file) => file === watchPath || file.startsWith(`${watchPath}/`),
    ),
  );
}

function mapSyncError(error: unknown) {
  const normalized = error as SyncRouteError;

  return {
    status: normalized.status ?? 500,
    code: normalized.code ?? "SYNC_FAILED",
    message: normalized.message || "GitHub 同步失败。",
    details: normalized.details ?? null,
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event");

  try {
    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: "WEBHOOK_SIGNATURE_INVALID",
            message: "GitHub Webhook 签名校验失败。",
          },
        },
        { status: 401 },
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === "GITHUB_WEBHOOK_SECRET_MISSING") {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: "CONFIG_MISSING",
            message: "服务端未配置 GITHUB_WEBHOOK_SECRET。",
          },
        },
        { status: 500 },
      );
    }

    throw error;
  }

  if (event === "ping") {
    return NextResponse.json({
      data: {
        ok: true,
      },
      error: null,
    });
  }

  if (event !== "push") {
    return NextResponse.json({
      data: {
        ignored: true,
        reason: `unsupported_event:${event ?? "unknown"}`,
      },
      error: null,
    });
  }

  const payload = JSON.parse(rawBody) as {
    ref: string;
    after?: string;
    repository: {
      name: string;
      owner: {
        login?: string;
        name?: string;
      };
    };
    commits?: Array<{
      added?: string[];
      modified?: string[];
      removed?: string[];
    }>;
  };

  const owner = payload.repository.owner.login ?? payload.repository.owner.name;
  const repo = payload.repository.name;
  const branch = parseBranch(payload.ref);
  const changedFiles = Array.from(
    new Set(
      (payload.commits ?? []).flatMap((commit) => [
        ...(commit.added ?? []),
        ...(commit.modified ?? []),
        ...(commit.removed ?? []),
      ]),
    ),
  );
  const fileCounts = {
    added: (payload.commits ?? []).reduce(
      (count, commit) => count + (commit.added?.length ?? 0),
      0,
    ),
    modified: (payload.commits ?? []).reduce(
      (count, commit) => count + (commit.modified?.length ?? 0),
      0,
    ),
    removed: (payload.commits ?? []).reduce(
      (count, commit) => count + (commit.removed?.length ?? 0),
      0,
    ),
  };
  const commitSha = payload.after?.slice(0, 40) ?? null;

  if (!owner || !repo) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "WEBHOOK_PAYLOAD_INVALID",
          message: "GitHub Webhook payload 缺少仓库信息。",
        },
      },
      { status: 400 },
    );
  }

  const sql = getSql();
  const rows = await sql.unsafe<RepoRegistryRow[]>(
    `
      SELECT id, slug, watch_paths, meta
      FROM repo_registry
      WHERE github_owner = $1
        AND github_repo = $2
    `,
    [owner, repo],
  );

  const candidates = rows.filter((row) => {
    const configuredBranch = row.meta?.branch;
    if (configuredBranch && configuredBranch !== branch) {
      return false;
    }

    return shouldSyncModule(changedFiles, row.watch_paths ?? []);
  });

  if (candidates.length === 0) {
    return NextResponse.json({
      data: {
        synced: [],
        ignored: true,
        reason: "no_matching_module",
      },
      error: null,
    });
  }

  const results = [];
  try {
    for (const candidate of candidates) {
      results.push(
        await syncGitHubModule({
          moduleSlug: candidate.slug,
          owner,
          repo,
          branch,
          watchPaths: candidate.watch_paths,
          purgeMissing: true,
          triggerType: "webhook",
          commitSha,
          fileCounts,
          sqlClient: sql,
        }),
      );
    }
  } catch (error) {
    const mapped = mapSyncError(error);

    return NextResponse.json(
      {
        data: null,
        error: {
          code: mapped.code,
          message: mapped.message,
          details: mapped.details,
        },
      },
      { status: mapped.status },
    );
  }

  return NextResponse.json({
    data: {
      synced: results,
      branch,
      changedFiles,
    },
    error: null,
  });
}
