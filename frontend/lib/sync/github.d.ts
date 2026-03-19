declare module "@/lib/sync/github.mjs" {
  export interface GitHubSyncOptions {
    moduleSlug: "human30" | "openclaw" | "bookmarks";
    owner: string;
    repo: string;
    branch?: string;
    watchPaths: string[];
    purgeMissing?: boolean;
    triggerType?: "webhook" | "cron" | "manual";
    commitSha?: string | null;
    fileCounts?: {
      added?: number;
      modified?: number;
      removed?: number;
    };
    sqlClient?: {
      end(): Promise<void>;
    };
  }

  export interface GitHubSyncResult {
    moduleSlug: "human30" | "openclaw" | "bookmarks";
    importedCount: number;
    branch: string;
    watchPaths: string[];
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
}
