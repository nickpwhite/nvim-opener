import test from "node:test";
import assert from "node:assert/strict";
import {
  listActiveThreadWorktrees,
  getActiveThreadCountForWorktree,
} from "../src/codex-state.js";

test("list active thread worktrees parses sqlite rows", () => {
  const worktrees = listActiveThreadWorktrees({
    queryRunner: () => ({
      ok: true,
      stdout: ["/tmp/worktree-a", "/tmp/worktree-b", "/tmp/worktree-a"].join("\n"),
    }),
  });

  assert.deepEqual(worktrees, ["/tmp/worktree-a", "/tmp/worktree-b"]);
});

test("list active thread worktrees returns null when thread state is unavailable", () => {
  const worktrees = listActiveThreadWorktrees({
    queryRunner: () => ({
      ok: false,
      stdout: "",
    }),
  });

  assert.equal(worktrees, null);
});

test("get active thread count parses sqlite count", () => {
  const count = getActiveThreadCountForWorktree("/tmp/worktree", {
    queryRunner: () => ({
      ok: true,
      stdout: "2\n",
    }),
  });

  assert.equal(count, 2);
});

test("get active thread count escapes worktree path for sqlite", () => {
  let capturedSql = null;
  const count = getActiveThreadCountForWorktree("/tmp/nick's-worktree", {
    queryRunner: (sql) => {
      capturedSql = sql;
      return {
        ok: true,
        stdout: "0\n",
      };
    },
  });

  assert.equal(count, 0);
  assert.match(capturedSql, /nick''s-worktree/);
});
