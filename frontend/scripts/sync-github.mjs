import path from "node:path";

import dotenv from "dotenv";
import {
  parseArgs,
  supportedDisplayTypes,
} from "./import-lib.mjs";
import { syncGitHubModule } from "../lib/sync/github.mjs";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

function parseWatchPaths(rawPath) {
  return rawPath
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const moduleSlug = args.module;
  const owner = args.owner;
  const repo = args.repo;
  const branch = args.branch ?? "main";
  const rawPaths = args.path ?? args.paths;
  const workspaceSlug = args.workspace;
  const moduleName = args.name?.trim() || null;
  const displayType = args["display-type"]?.trim() || null;

  if (!moduleSlug || !owner || !repo || !rawPaths) {
    console.error(
      "Usage: npm run sync:github -- --module <module-slug> --owner <owner> --repo <repo> --path <dir[,dir2]> [--workspace workspace-slug] [--branch main] [--purge-missing] [--name module-name --display-type blog|timeline|bookmarks]",
    );
    process.exit(1);
  }

  if (displayType && !supportedDisplayTypes.has(displayType)) {
    console.error(
      `Unsupported display type: ${displayType}. Expected one of: ${Array.from(supportedDisplayTypes).join(", ")}.`,
    );
    process.exit(1);
  }

  const watchPaths = parseWatchPaths(rawPaths);
  const result = await syncGitHubModule({
    moduleSlug,
    moduleName,
    displayType,
    owner,
    repo,
    branch,
    watchPaths,
    purgeMissing: args["purge-missing"] === "true",
    triggerType: "manual",
    targetWorkspaceSlug: workspaceSlug,
  });

  console.log(
    `Synced ${result.importedCount} markdown files from ${owner}/${repo}@${branch} into module "${moduleSlug}" via ${result.authSource}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
