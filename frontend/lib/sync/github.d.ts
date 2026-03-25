declare module "@/lib/sync/github.mjs" {
  export interface GitHubAccessResolution {
    token: string;
    source: "github_app_installation" | "manual_global_token" | "dev_global_token";
    installationId: string | null;
    githubAccountLogin: string | null;
  }

  export function fetchGitHubAppInstallationDetails(installationId: string | number): Promise<{
    id: number;
    accountLogin: string | null;
    accountType: "user" | "organization";
    permissions: Record<string, unknown>;
    events: string[];
  }>;

  export interface GitHubSyncOptions {
    moduleSlug: string;
    owner: string;
    repo: string;
    branch?: string;
    watchPaths: string[];
    purgeMissing?: boolean;
    triggerType?: "webhook" | "cron" | "manual";
    triggerScope?: string | null;
    commitSha?: string | null;
    fileCounts?: {
      added?: number;
      modified?: number;
      removed?: number;
    };
    existingRepoId?: string | null;
    existingWorkspaceId?: string | null;
    targetWorkspaceSlug?: string;
    compensationRunId?: string | null;
    sqlClient?: {
      end(): Promise<void>;
    };
  }

  export interface GitHubSyncResult {
    moduleSlug: string;
    importedCount: number;
    branch: string;
    watchPaths: string[];
    authSource: "github_app_installation" | "manual_global_token" | "dev_global_token";
  }

  export function listMarkdownFiles(
    owner: string,
    repo: string,
    repoPath: string,
    branch: string,
  ): Promise<Array<{ path: string; sha: string }>>;

  export function fetchMarkdownFile(
    owner: string,
    repo: string,
    filePath: string,
    branch: string,
  ): Promise<{
    filePath: string;
    frontmatter: Record<string, unknown>;
    body: string;
    rawFile: string;
    githubSha: string;
  }>;

  export function syncGitHubModule(
    options: GitHubSyncOptions,
  ): Promise<GitHubSyncResult>;

  export function resolveGitHubAccessForSync(options: {
    sql: {
      [key: string]: unknown;
    };
    repoId?: string | null;
    workspaceId?: string | null;
    moduleSlug?: string | null;
    targetWorkspaceSlug?: string | null;
    triggerType?: "webhook" | "cron" | "manual";
  }): Promise<GitHubAccessResolution>;
}
