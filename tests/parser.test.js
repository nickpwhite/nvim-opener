import test from "node:test";
import assert from "node:assert/strict";

import {
  parseCliArgs,
  parseCodeInsidersArgs,
  parsePathWithLineCol,
  parseVsCodeInsidersUri,
} from "../src/parse.js";
import {
  extractCodexWorktreeRoot,
  resolveWorktreeFromPath,
} from "../src/worktree.js";

test("parse vscode-insiders URI with encoded spaces and line/col", () => {
  const parsed = parseVsCodeInsidersUri(
    "vscode-insiders://file/Users/nick/.codex/worktrees/1234/repo/src/My%20File.ts:12:3",
  );

  assert.equal(parsed.kind, "open-path");
  assert.equal(parsed.path, "/Users/nick/.codex/worktrees/1234/repo/src/My File.ts");
  assert.equal(parsed.line, 12);
  assert.equal(parsed.col, 3);
});

test("parse vscode-insiders URI with encoded square brackets", () => {
  const parsed = parseVsCodeInsidersUri(
    "vscode-insiders://file/Users/nick/project/src/routes/%5Bslug%5D.tsx:12:3",
  );

  assert.equal(parsed.kind, "open-path");
  assert.equal(parsed.path, "/Users/nick/project/src/routes/[slug].tsx");
  assert.equal(parsed.line, 12);
  assert.equal(parsed.col, 3);
});

test("parse code-insiders --goto path:line:col", () => {
  const parsed = parseCodeInsidersArgs([
    "--reuse-window",
    "--goto",
    "/Users/nick/project/src/index.ts:99:7",
  ]);

  assert.equal(parsed.kind, "open-path");
  assert.equal(parsed.path, "/Users/nick/project/src/index.ts");
  assert.equal(parsed.line, 99);
  assert.equal(parsed.col, 7);
});

test("parse code-insiders no args as open-empty", () => {
  const parsed = parseCodeInsidersArgs([]);
  assert.equal(parsed.kind, "open-empty");
  assert.equal(parsed.source, "code-insiders");
  assert.equal(parsed.worktree, process.cwd());
});

test("parse code-insiders --file-uri file:// path", () => {
  const parsed = parseCodeInsidersArgs([
    "--file-uri",
    "file:///Users/nick/.codex/worktrees/1234/repo/src/main.ts",
  ]);

  assert.equal(parsed.kind, "open-path");
  assert.equal(parsed.path, "/Users/nick/.codex/worktrees/1234/repo/src/main.ts");
  assert.equal(parsed.line, null);
  assert.equal(parsed.col, null);
});

test("parse code-insiders --file-uri with encoded square brackets", () => {
  const parsed = parseCodeInsidersArgs([
    "--file-uri",
    "file:///Users/nick/project/src/routes/%5Bslug%5D.tsx",
  ]);

  assert.equal(parsed.kind, "open-path");
  assert.equal(parsed.path, "/Users/nick/project/src/routes/[slug].tsx");
  assert.equal(parsed.line, null);
  assert.equal(parsed.col, null);
});

test("parse code-insiders positional file:// path", () => {
  const parsed = parseCodeInsidersArgs([
    "file:///Users/nick/.codex/worktrees/1234/repo/src/main.ts",
  ]);

  assert.equal(parsed.kind, "open-path");
  assert.equal(parsed.path, "/Users/nick/.codex/worktrees/1234/repo/src/main.ts");
});

test("parse path with line and column", () => {
  const parsed = parsePathWithLineCol("/tmp/example.ts:1:2");
  assert.deepEqual(parsed, {
    path: "/tmp/example.ts",
    line: 1,
    col: 2,
  });
});

test("extract codex worktree root", () => {
  const root = extractCodexWorktreeRoot(
    "/Users/nick/.codex/worktrees/49b2/circleback/apps/web/index.ts",
  );

  assert.equal(root, "/Users/nick/.codex/worktrees/49b2/circleback");
});

test("resolve worktree from codex worktree file path", () => {
  const worktree = resolveWorktreeFromPath(
    "/Users/nick/.codex/worktrees/49b2/circleback/apps/web/index.ts",
    () => null,
  );

  assert.equal(worktree, "/Users/nick/.codex/worktrees/49b2/circleback");
});

test("resolve worktree from regular directory path", () => {
  const worktree = resolveWorktreeFromPath("/Users/nick/src/nvim-opener", () => null);
  assert.equal(worktree, "/Users/nick/src/nvim-opener");
});

test("parse cli --from-code-insiders passthrough", () => {
  const parsed = parseCliArgs(["--from-code-insiders", "--goto", "/tmp/a.ts:5:1"]);
  assert.equal(parsed.command, "from-code-insiders");
  assert.deepEqual(parsed.args, ["--goto", "/tmp/a.ts:5:1"]);
});

test("parse cli --sync-thread-state", () => {
  const parsed = parseCliArgs(["--sync-thread-state"]);
  assert.equal(parsed.kind, "sync-thread-state");
  assert.equal(parsed.source, "cli");
});

test("parse cli sync-thread-state must be standalone", () => {
  assert.throws(
    () => parseCliArgs(["--sync-thread-state", "--path", "/tmp/a.ts"]),
    /--sync-thread-state must be used without other arguments/,
  );
});
