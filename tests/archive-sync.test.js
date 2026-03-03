import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  extractArchivedSessionWorktree,
  syncArchivedWorktrees,
} from "../src/archive-sync.js";

function makeCodexFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nvim-opener-archive-sync-"));
  const codexHome = path.join(root, ".codex");
  const archiveDir = path.join(codexHome, "archived_sessions");
  const worktreesDir = path.join(codexHome, "worktrees");
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.mkdirSync(worktreesDir, { recursive: true });
  return {
    root,
    codexHome,
    archiveDir,
    worktreesDir,
  };
}

function writeArchiveFile(archiveDir, name, firstLine, mtimeMs) {
  const filePath = path.join(archiveDir, name);
  fs.writeFileSync(filePath, `${firstLine}\n{"type":"extra"}`);
  const mtimeSeconds = mtimeMs / 1000;
  fs.utimesSync(filePath, mtimeSeconds, mtimeSeconds);
  return filePath;
}

function cleanupFixture(root) {
  fs.rmSync(root, {
    recursive: true,
    force: true,
  });
}

test("extract worktree from archived session first line", () => {
  const line = JSON.stringify({
    type: "session_meta",
    payload: {
      cwd: "/Users/nick/.codex/worktrees/1234/repo",
    },
  });
  assert.equal(
    extractArchivedSessionWorktree(line),
    "/Users/nick/.codex/worktrees/1234/repo",
  );
});

test("sync archives cleans worktree from valid session_meta cwd", () => {
  const fixture = makeCodexFixture();
  try {
    const worktree = path.join(fixture.worktreesDir, "1234", "repo");
    fs.mkdirSync(worktree, { recursive: true });
    writeArchiveFile(
      fixture.archiveDir,
      "rollout-2026-03-03T10-00-00-1.jsonl",
      JSON.stringify({
        type: "session_meta",
        payload: { cwd: worktree },
      }),
      Date.now(),
    );

    const cleaned = [];
    const summary = syncArchivedWorktrees({
      codexHome: fixture.codexHome,
      cleanupWorktree: (cwd) => cleaned.push(cwd),
    });

    assert.equal(summary.cleanedWorktrees, 1);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0], path.resolve(worktree));
  } finally {
    cleanupFixture(fixture.root);
  }
});

test("sync archives ignores non-codex-worktree cwd", () => {
  const fixture = makeCodexFixture();
  try {
    writeArchiveFile(
      fixture.archiveDir,
      "rollout-2026-03-03T10-00-00-2.jsonl",
      JSON.stringify({
        type: "session_meta",
        payload: { cwd: "/Users/nick/src/not-a-codex-worktree" },
      }),
      Date.now(),
    );

    const cleaned = [];
    const summary = syncArchivedWorktrees({
      codexHome: fixture.codexHome,
      cleanupWorktree: (cwd) => cleaned.push(cwd),
    });

    assert.equal(summary.cleanedWorktrees, 0);
    assert.equal(summary.skippedWorktrees, 1);
    assert.equal(cleaned.length, 0);
  } finally {
    cleanupFixture(fixture.root);
  }
});

test("sync archives processes only files after checkpoint", () => {
  const fixture = makeCodexFixture();
  try {
    const worktreeA = path.join(fixture.worktreesDir, "aaaa", "repo");
    const worktreeB = path.join(fixture.worktreesDir, "bbbb", "repo");
    fs.mkdirSync(worktreeA, { recursive: true });
    fs.mkdirSync(worktreeB, { recursive: true });

    const baseTime = Date.now();
    const fileA = "rollout-2026-03-03T10-00-00-a.jsonl";
    const fileB = "rollout-2026-03-03T10-00-00-b.jsonl";
    writeArchiveFile(
      fixture.archiveDir,
      fileA,
      JSON.stringify({ type: "session_meta", payload: { cwd: worktreeA } }),
      baseTime,
    );
    writeArchiveFile(
      fixture.archiveDir,
      fileB,
      JSON.stringify({ type: "session_meta", payload: { cwd: worktreeB } }),
      baseTime + 1000,
    );

    const statePath = path.join(fixture.codexHome, "tmp", "nvim-opener-archive-sync-state.json");
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        lastMtimeMs: baseTime,
        lastFileName: fileA,
      }),
    );

    const cleaned = [];
    const summary = syncArchivedWorktrees({
      codexHome: fixture.codexHome,
      cleanupWorktree: (cwd) => cleaned.push(cwd),
    });

    assert.equal(summary.processedFiles, 1);
    assert.equal(summary.cleanedWorktrees, 1);
    assert.deepEqual(cleaned, [path.resolve(worktreeB)]);
  } finally {
    cleanupFixture(fixture.root);
  }
});

test("sync archives handles malformed files and continues", () => {
  const fixture = makeCodexFixture();
  try {
    const worktree = path.join(fixture.worktreesDir, "cccc", "repo");
    fs.mkdirSync(worktree, { recursive: true });

    const baseTime = Date.now();
    writeArchiveFile(
      fixture.archiveDir,
      "rollout-2026-03-03T10-00-00-bad.jsonl",
      "{not-json",
      baseTime,
    );
    writeArchiveFile(
      fixture.archiveDir,
      "rollout-2026-03-03T10-00-00-good.jsonl",
      JSON.stringify({ type: "session_meta", payload: { cwd: worktree } }),
      baseTime + 1000,
    );

    const cleaned = [];
    const summary = syncArchivedWorktrees({
      codexHome: fixture.codexHome,
      cleanupWorktree: (cwd) => cleaned.push(cwd),
    });

    assert.equal(summary.processedFiles, 2);
    assert.equal(summary.cleanedWorktrees, 1);
    assert.equal(cleaned.length, 1);
  } finally {
    cleanupFixture(fixture.root);
  }
});

test("sync archives deduplicates repeated worktrees", () => {
  const fixture = makeCodexFixture();
  try {
    const worktree = path.join(fixture.worktreesDir, "dddd", "repo");
    fs.mkdirSync(worktree, { recursive: true });

    const baseTime = Date.now();
    writeArchiveFile(
      fixture.archiveDir,
      "rollout-2026-03-03T10-00-00-1.jsonl",
      JSON.stringify({ type: "session_meta", payload: { cwd: worktree } }),
      baseTime,
    );
    writeArchiveFile(
      fixture.archiveDir,
      "rollout-2026-03-03T10-00-00-2.jsonl",
      JSON.stringify({ type: "session_meta", payload: { cwd: worktree } }),
      baseTime + 1000,
    );

    const cleaned = [];
    const summary = syncArchivedWorktrees({
      codexHome: fixture.codexHome,
      cleanupWorktree: (cwd) => cleaned.push(cwd),
    });

    assert.equal(summary.processedFiles, 2);
    assert.equal(summary.queuedWorktrees, 1);
    assert.equal(summary.cleanedWorktrees, 1);
    assert.equal(cleaned.length, 1);
  } finally {
    cleanupFixture(fixture.root);
  }
});
