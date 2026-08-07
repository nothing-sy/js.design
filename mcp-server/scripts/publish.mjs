#!/usr/bin/env node
/**
 * Read mcp-server/.npm-token (gitignored) and publish to npmjs.org.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokenFile = join(root, ".npm-token");

if (!existsSync(tokenFile)) {
  console.error(
    "[publish] 缺少 .npm-token。请在 mcp-server/.npm-token 写入 npm access token（已 gitignore）。",
  );
  process.exit(1);
}

const token = readFileSync(tokenFile, "utf8").trim();
if (!token) {
  console.error("[publish] .npm-token 为空");
  process.exit(1);
}

const result = spawnSync(
  "npm",
  ["publish", "--access", "public", "--registry", "https://registry.npmjs.org/"],
  {
    cwd: root,
    env: {
      ...process.env,
      NPM_TOKEN: token,
      NODE_AUTH_TOKEN: token,
    },
    stdio: "inherit",
    shell: true,
  },
);

process.exit(result.status ?? 1);
