import test from "node:test";
import assert from "node:assert/strict";
import { syncManagedWorktreesWithThreadState } from "../src/thread-sync.js";

test("thread state sync cleans managed worktrees without active threads", () => {
  const cleaned = [];
  const summary = syncManagedWorktreesWithThreadState({
    listActiveWorktrees: () => ["/tmp/worktree-a"],
    listManagedWorktrees: () => ["/tmp/worktree-a", "/tmp/worktree-b"],
    cleanupWorktree: (worktree) => cleaned.push(worktree),
  });

  assert.deepEqual(cleaned, ["/tmp/worktree-b"]);
  assert.deepEqual(summary, {
    activeThreadStateAvailable: true,
    activeWorktrees: 1,
    managedWorktrees: 2,
    orphanedWorktrees: 1,
    cleanedWorktrees: 1,
    failedWorktrees: 0,
  });
});

test("thread state sync skips cleanup when thread state is unavailable", () => {
  const cleaned = [];
  const summary = syncManagedWorktreesWithThreadState({
    listActiveWorktrees: () => null,
    listManagedWorktrees: () => ["/tmp/worktree-a"],
    cleanupWorktree: (worktree) => cleaned.push(worktree),
  });

  assert.deepEqual(cleaned, []);
  assert.deepEqual(summary, {
    activeThreadStateAvailable: false,
    activeWorktrees: 0,
    managedWorktrees: 1,
    orphanedWorktrees: 0,
    cleanedWorktrees: 0,
    failedWorktrees: 0,
  });
});

test("thread state sync continues after cleanup failures", () => {
  const cleaned = [];
  const summary = syncManagedWorktreesWithThreadState({
    listActiveWorktrees: () => [],
    listManagedWorktrees: () => ["/tmp/worktree-a", "/tmp/worktree-b"],
    cleanupWorktree: (worktree) => {
      if (worktree.endsWith("worktree-a")) {
        throw new Error("boom");
      }
      cleaned.push(worktree);
    },
  });

  assert.deepEqual(cleaned, ["/tmp/worktree-b"]);
  assert.deepEqual(summary, {
    activeThreadStateAvailable: true,
    activeWorktrees: 0,
    managedWorktrees: 2,
    orphanedWorktrees: 2,
    cleanedWorktrees: 1,
    failedWorktrees: 1,
  });
});
