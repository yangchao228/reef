import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";
import matter from "gray-matter";
import {
  createSqlClient,
  ensureRepoRecord,
  moduleDefaults,
  parseArgs,
  purgeMissingEntries,
  supportedDisplayTypes,
  upsertMarkdownEntries,
} from "./import-lib.mjs";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

async function collectMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectMarkdownFiles(fullPath);
      }
      return fullPath.endsWith(".md") ? [fullPath] : [];
    }),
  );

  return files.flat();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const moduleSlug = args.module;
  const sourceDir = args.dir;
  const workspaceSlug = args.workspace;
  const customName = args.name?.trim();
  const customDisplayType = args["display-type"]?.trim();

  if (!moduleSlug || !sourceDir) {
    console.error(
      "Usage: npm run import:markdown -- --module <module-slug> --dir <markdown-directory> [--workspace workspace-slug] [--purge-missing] [--name module-name --display-type blog|timeline|bookmarks]",
    );
    process.exit(1);
  }

  const preset = moduleDefaults[moduleSlug];
  if (!preset && (!customName || !customDisplayType)) {
    console.error(
      `Module "${moduleSlug}" 没有内置 preset。请补充 --name 和 --display-type，或使用内置示例模块：${Object.keys(moduleDefaults).join(", ")}。`,
    );
    process.exit(1);
  }

  if (customDisplayType && !supportedDisplayTypes.has(customDisplayType)) {
    console.error(
      `Unsupported display type: ${customDisplayType}. Expected one of: ${Array.from(supportedDisplayTypes).join(", ")}.`,
    );
    process.exit(1);
  }

  const defaults = preset ?? {
    name: customName,
    displayType: customDisplayType,
  };

  const sql = createSqlClient();

  const markdownFiles = await collectMarkdownFiles(path.resolve(sourceDir));
  const { repoId, workspaceId } = await ensureRepoRecord(
    sql,
    moduleSlug,
    defaults,
    {
      githubOwner: "local",
      githubRepo: moduleSlug,
      watchPaths: [path.resolve(sourceDir)],
      meta: {
        source: "local",
      },
    },
    workspaceSlug,
  );

  const entries = [];

  for (const absolutePath of markdownFiles) {
    const file = await fs.readFile(absolutePath, "utf8");
    const parsed = matter(file);
    entries.push({
      filePath: path.relative(path.resolve(sourceDir), absolutePath),
      frontmatter: parsed.data,
      body: parsed.content,
      rawFile: file,
      githubSha: crypto.createHash("sha1").update(file).digest("hex"),
    });
  }

  const importedPaths = await upsertMarkdownEntries(sql, repoId, entries, workspaceId);

  if (args["purge-missing"] === "true" && importedPaths.length > 0) {
    await purgeMissingEntries(sql, repoId, importedPaths);
  }

  await sql.end();

  console.log(
    `Imported ${markdownFiles.length} markdown files into module "${moduleSlug}".`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
