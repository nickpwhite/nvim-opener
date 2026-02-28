import test from "node:test";
import assert from "node:assert/strict";

import {
  findWindowByWorktree,
  parseWindowRows,
  pickMostRecentManagedWindow,
} from "../src/tmux-selection.js";

test("parse tmux window rows", () => {
  const rows = parseWindowRows(
    [
      "@1\t0\t/Users/nick/.codex/worktrees/49b2/circleback\t1710000000\t0",
      "@2\t1\t/Users/nick/.codex/worktrees/8780/circleback\t1710000010\t1",
    ].join("\n"),
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].windowId, "@1");
  assert.equal(rows[1].active, true);
});

test("find window by worktree", () => {
  const rows = parseWindowRows(
    ["@2\t1\t/Users/nick/.codex/worktrees/8780/circleback\t1710000010\t1"].join("\n"),
  );

  const found = findWindowByWorktree(rows, "/Users/nick/.codex/worktrees/8780/circleback");
  assert.ok(found);
  assert.equal(found.windowId, "@2");
});

test("pick most recent managed window", () => {
  const rows = parseWindowRows(
    [
      "@1\t0\t/Users/nick/.codex/worktrees/49b2/circleback\t1710000000\t0",
      "@2\t1\t/Users/nick/.codex/worktrees/8780/circleback\t1710000010\t0",
      "@3\t2\t\t1710000020\t1",
    ].join("\n"),
  );

  const selected = pickMostRecentManagedWindow(rows);
  assert.ok(selected);
  assert.equal(selected.windowId, "@2");
});
