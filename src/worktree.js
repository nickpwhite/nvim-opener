import fs from "node:fs";
import path from "node:path";
import { tryCommand } from "./shell.js";

export function canonicalizePath(inputPath) {
  const absolutePath = path.resolve(inputPath);

  let probe = absolutePath;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) {
      return absolutePath;
    }
    probe = parent;
  }

  const realExisting = fs.realpathSync.native(probe);
  if (probe === absolutePath) {
    return realExisting;
  }

  return path.join(realExisting, path.relative(probe, absolutePath));
}

export function resolveGitTopLevel(startDir) {
  const result = tryCommand("git", ["-C", startDir, "rev-parse", "--show-toplevel"]);
  if (!result.ok) {
    return null;
  }
  return result.stdout.trim() || null;
}

export function extractCodexWorktreeRoot(absolutePath) {
  const normalized = path.resolve(absolutePath);
  const marker = `${path.sep}.codex${path.sep}worktrees${path.sep}`;
  const markerIndex = normalized.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const afterMarker = normalized.slice(markerIndex + marker.length);
  const parts = afterMarker.split(path.sep).filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const root = path.join(
    normalized.slice(0, markerIndex + marker.length),
    parts[0],
    parts[1],
  );
  return root;
}

export function resolveWorktreeFromPath(inputPath, gitTopLevelResolver = resolveGitTopLevel) {
  const absolutePath = canonicalizePath(inputPath);

  const codexWorktree = extractCodexWorktreeRoot(absolutePath);
  if (codexWorktree) {
    return canonicalizePath(codexWorktree);
  }

  let stat = null;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    stat = null;
  }

  const candidateDir = stat && stat.isDirectory() ? absolutePath : path.dirname(absolutePath);
  const gitTopLevel = gitTopLevelResolver(candidateDir);

  if (gitTopLevel) {
    return canonicalizePath(gitTopLevel);
  }

  if (stat && stat.isDirectory()) {
    return absolutePath;
  }

  return canonicalizePath(path.dirname(absolutePath));
}

export function resolveAbsolutePath(inputPath) {
  return canonicalizePath(inputPath);
}
