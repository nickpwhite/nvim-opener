import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OpenerError } from "./errors.js";

function defaultCodexHome() {
  return path.join(os.homedir(), ".codex");
}

function readCheckpoint(statePath) {
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      lastMtimeMs: Number(parsed.lastMtimeMs) || 0,
      lastFileName: typeof parsed.lastFileName === "string" ? parsed.lastFileName : "",
    };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return {
        lastMtimeMs: 0,
        lastFileName: "",
      };
    }

    return {
      lastMtimeMs: 0,
      lastFileName: "",
    };
  }
}

function writeCheckpoint(statePath, checkpoint) {
  fs.mkdirSync(path.dirname(statePath), {
    recursive: true,
  });
  fs.writeFileSync(
    statePath,
    JSON.stringify(
      {
        lastMtimeMs: checkpoint.lastMtimeMs,
        lastFileName: checkpoint.lastFileName,
      },
      null,
      2,
    ),
  );
}

function isAfterCheckpoint(fileInfo, checkpoint) {
  if (fileInfo.mtimeMs > checkpoint.lastMtimeMs) {
    return true;
  }
  if (fileInfo.mtimeMs < checkpoint.lastMtimeMs) {
    return false;
  }
  return fileInfo.name > checkpoint.lastFileName;
}

function isPathInsideDirectory(candidatePath, directoryPath) {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedDirectory = path.resolve(directoryPath);
  return (
    resolvedCandidate === resolvedDirectory ||
    resolvedCandidate.startsWith(`${resolvedDirectory}${path.sep}`)
  );
}

function readFirstLine(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const newlineIndex = raw.indexOf("\n");
  if (newlineIndex === -1) {
    return raw.trim();
  }
  return raw.slice(0, newlineIndex).trim();
}

export function extractArchivedSessionWorktree(firstLine) {
  if (!firstLine) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(firstLine);
  } catch {
    return null;
  }

  if (parsed.type !== "session_meta") {
    return null;
  }

  const cwd = parsed.payload && typeof parsed.payload.cwd === "string" ? parsed.payload.cwd : null;
  return cwd || null;
}

export function syncArchivedWorktrees(options = {}) {
  const codexHome = options.codexHome || defaultCodexHome();
  const archiveDir = options.archiveDir || path.join(codexHome, "archived_sessions");
  const statePath = options.statePath || path.join(codexHome, "tmp", "nvim-opener-archive-sync-state.json");
  const codexWorktreesRoot = path.join(codexHome, "worktrees");
  const logger = options.logger || null;
  const cleanupWorktree = options.cleanupWorktree;

  if (typeof cleanupWorktree !== "function") {
    throw new OpenerError("syncArchivedWorktrees requires cleanupWorktree callback");
  }

  if (!fs.existsSync(archiveDir)) {
    return {
      archiveDir,
      statePath,
      scannedFiles: 0,
      processedFiles: 0,
      queuedWorktrees: 0,
      cleanedWorktrees: 0,
      failedWorktrees: 0,
      skippedWorktrees: 0,
    };
  }

  const checkpoint = readCheckpoint(statePath);
  const files = [];
  for (const name of fs.readdirSync(archiveDir)) {
    if (!/^rollout-.*\.jsonl$/.test(name)) {
      continue;
    }

    const filePath = path.join(archiveDir, name);
    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch (error) {
      logger?.warn("Failed to stat archived session file", {
        filePath,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    files.push({
      name,
      filePath,
      mtimeMs: stats.mtimeMs,
    });
  }

  files.sort((a, b) => {
    if (a.mtimeMs !== b.mtimeMs) {
      return a.mtimeMs - b.mtimeMs;
    }
    return a.name.localeCompare(b.name);
  });

  const nextCheckpoint = {
    lastMtimeMs: checkpoint.lastMtimeMs,
    lastFileName: checkpoint.lastFileName,
  };
  const queuedWorktrees = new Set();

  let processedFiles = 0;
  let skippedWorktrees = 0;
  for (const fileInfo of files) {
    if (!isAfterCheckpoint(fileInfo, checkpoint)) {
      continue;
    }

    processedFiles += 1;
    nextCheckpoint.lastMtimeMs = fileInfo.mtimeMs;
    nextCheckpoint.lastFileName = fileInfo.name;

    let firstLine;
    try {
      firstLine = readFirstLine(fileInfo.filePath);
    } catch (error) {
      logger?.warn("Failed to read archived session file", {
        filePath: fileInfo.filePath,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const worktree = extractArchivedSessionWorktree(firstLine);
    if (!worktree) {
      continue;
    }

    if (!isPathInsideDirectory(worktree, codexWorktreesRoot)) {
      skippedWorktrees += 1;
      continue;
    }

    queuedWorktrees.add(path.resolve(worktree));
  }

  let cleanedWorktrees = 0;
  let failedWorktrees = 0;
  for (const worktree of queuedWorktrees) {
    try {
      cleanupWorktree(worktree);
      cleanedWorktrees += 1;
    } catch (error) {
      failedWorktrees += 1;
      logger?.error("Failed archive cleanup for worktree", {
        worktree,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (processedFiles > 0) {
    try {
      writeCheckpoint(statePath, nextCheckpoint);
    } catch (error) {
      logger?.error("Failed to persist archive sync checkpoint", {
        statePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    archiveDir,
    statePath,
    scannedFiles: files.length,
    processedFiles,
    queuedWorktrees: queuedWorktrees.size,
    cleanedWorktrees,
    failedWorktrees,
    skippedWorktrees,
  };
}
