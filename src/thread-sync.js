import path from "node:path";
import { OpenerError } from "./errors.js";
import { listActiveThreadWorktrees } from "./codex-state.js";

function normalizeWorktrees(worktrees) {
  return [...new Set(
    (worktrees || [])
      .filter(Boolean)
      .map((worktree) => path.resolve(worktree)),
  )];
}

export function syncManagedWorktreesWithThreadState(options = {}) {
  const logger = options.logger || null;
  const cleanupWorktree = options.cleanupWorktree;
  const listManagedWorktrees = options.listManagedWorktrees;
  const activeWorktrees =
    typeof options.listActiveWorktrees === "function"
      ? options.listActiveWorktrees()
      : listActiveThreadWorktrees(options);

  if (typeof cleanupWorktree !== "function") {
    throw new OpenerError("syncManagedWorktreesWithThreadState requires cleanupWorktree callback");
  }

  if (typeof listManagedWorktrees !== "function") {
    throw new OpenerError("syncManagedWorktreesWithThreadState requires listManagedWorktrees callback");
  }

  const managedWorktrees = normalizeWorktrees(listManagedWorktrees());
  if (activeWorktrees === null) {
    return {
      activeThreadStateAvailable: false,
      activeWorktrees: 0,
      managedWorktrees: managedWorktrees.length,
      orphanedWorktrees: 0,
      cleanedWorktrees: 0,
      failedWorktrees: 0,
    };
  }

  const normalizedActiveWorktrees = normalizeWorktrees(activeWorktrees);
  const activeWorktreeSet = new Set(normalizedActiveWorktrees);
  const orphanedWorktrees = managedWorktrees.filter((worktree) => !activeWorktreeSet.has(worktree));

  let cleanedWorktrees = 0;
  let failedWorktrees = 0;
  orphanedWorktrees.forEach((worktree) => {
    try {
      cleanupWorktree(worktree);
      cleanedWorktrees += 1;
    } catch (error) {
      failedWorktrees += 1;
      logger?.error("Failed thread state cleanup for worktree", {
        worktree,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return {
    activeThreadStateAvailable: true,
    activeWorktrees: normalizedActiveWorktrees.length,
    managedWorktrees: managedWorktrees.length,
    orphanedWorktrees: orphanedWorktrees.length,
    cleanedWorktrees,
    failedWorktrees,
  };
}
