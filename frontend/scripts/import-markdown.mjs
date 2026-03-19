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

  if (!moduleSlug || !sourceDir) {
    console.error(
      "Usage: npm run import:markdown -- --module <human30|openclaw|bookmarks> --dir <markdown-directory> [--purge-missing]",
    );
    process.exit(1);
  }

  const defaults = moduleDefaults[moduleSlug];
  if (!defaults) {
    console.error(`Unsupported module: ${moduleSlug}`);
    process.exit(1);
  }

  const sql = createSqlClient();

  const markdownFiles = await collectMarkdownFiles(path.resolve(sourceDir));
  const repoId = await ensureRepoRecord(sql, moduleSlug, defaults, {
    githubOwner: "local",
    githubRepo: moduleSlug,
    watchPaths: [path.resolve(sourceDir)],
    meta: {
      source: "local",
    },
  });

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

  const importedPaths = await upsertMarkdownEntries(sql, repoId, entries);

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
