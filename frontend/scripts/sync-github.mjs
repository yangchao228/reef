import path from "node:path";

import dotenv from "dotenv";
import {
  parseArgs,
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

  if (!moduleSlug || !owner || !repo || !rawPaths) {
    console.error(
      "Usage: npm run sync:github -- --module <human30|openclaw|bookmarks> --owner <owner> --repo <repo> --path <dir[,dir2]> [--branch main] [--purge-missing]",
    );
    process.exit(1);
  }

  const watchPaths = parseWatchPaths(rawPaths);
  const result = await syncGitHubModule({
    moduleSlug,
    owner,
    repo,
    branch,
    watchPaths,
    purgeMissing: args["purge-missing"] === "true",
    triggerType: "manual",
  });

  console.log(
    `Synced ${result.importedCount} markdown files from ${owner}/${repo}@${branch} into module "${moduleSlug}".`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
