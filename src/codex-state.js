import os from "node:os";
import path from "node:path";
import { tryCommand } from "./shell.js";

function defaultCodexHome() {
  return path.join(os.homedir(), ".codex");
}

function sqlQuote(value) {
  return String(value).replace(/'/g, "''");
}

function runThreadStateQuery(sql, options = {}) {
  const statePath = options.statePath || path.join(options.codexHome || defaultCodexHome(), "state_5.sqlite");
  const queryRunner = options.queryRunner;

  if (queryRunner) {
    return queryRunner(sql, statePath);
  }

  return tryCommand("sqlite3", [statePath, sql]);
}

export function listActiveThreadWorktrees(options = {}) {
  const sql = "SELECT DISTINCT cwd FROM threads WHERE archived = 0 AND cwd != '';";
  const result = runThreadStateQuery(sql, options);

  if (!result.ok) {
    return null;
  }

  return [...new Set(
    result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((worktree) => path.resolve(worktree)),
  )];
}

export function getActiveThreadCountForWorktree(worktree, options = {}) {
  const resolvedWorktree = path.resolve(worktree);
  const sql = `SELECT COUNT(*) FROM threads WHERE archived = 0 AND cwd = '${sqlQuote(resolvedWorktree)}';`;
  const result = runThreadStateQuery(sql, options);

  if (!result.ok) {
    return null;
  }

  const count = Number.parseInt(result.stdout.trim(), 10);
  return Number.isFinite(count) ? count : null;
}
