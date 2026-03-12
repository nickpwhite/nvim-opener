import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { commandExists, resolveExecutable } from "./shell.js";
import { OpenerError } from "./errors.js";
import { syncManagedWorktreesWithThreadState } from "./thread-sync.js";
import {
  cleanupWindowForWorktree,
  ensureNvimServer,
  ensureSocketDir,
  ensureWindow,
  focusAlacritty,
  getMostRecentManagedWorktree,
  hasAlacrittyClient,
  listManagedWindows,
  launchAlacritty,
  openFileInServer,
  setServerCwd,
  selectWindow,
  socketPathForWorktree,
} from "./tmux.js";
import { resolveAbsolutePath, resolveWorktreeFromPath } from "./worktree.js";

export function ensureDependencies(config) {
  const binaries = ["tmux", "nvim"];
  const missing = binaries.filter((binary) => !commandExists(binary));
  if (missing.length > 0) {
    throw new OpenerError("Missing required binaries", {
      missing,
    });
  }
}

function resolveAlacrittyCommand(config) {
  const candidates = [];
  if (config.alacrittyCmd) {
    candidates.push(config.alacrittyCmd);
  }
  if (config.alacrittyCmd !== "alacritty") {
    candidates.push("alacritty");
  }
  candidates.push(
    "/Applications/Alacritty.app/Contents/MacOS/alacritty",
    path.join(os.homedir(), "Applications/Alacritty.app/Contents/MacOS/alacritty"),
  );

  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);

    if (commandExists(candidate)) {
      return candidate;
    }
  }

  throw new OpenerError("Missing required Alacritty binary", {
    configured: config.alacrittyCmd,
    checked: candidates,
  });
}

function resolveTargetWorktree(action, config) {
  if (action.worktree) {
    return resolveWorktreeFromPath(action.worktree);
  }

  if (action.kind === "open-path") {
    return resolveWorktreeFromPath(action.path);
  }

  const fallback = getMostRecentManagedWorktree(config.sessionName);
  if (!fallback) {
    return resolveWorktreeFromPath(process.cwd());
  }

  return fallback;
}

function shouldOpenAlacritty(sessionCreated, config) {
  if (sessionCreated) {
    return true;
  }
  return !hasAlacrittyClient(config.sessionName);
}

function cleanupWorktreeState(inputWorktree, config) {
  const worktree = resolveWorktreeFromPath(inputWorktree);
  const socketPath = socketPathForWorktree(worktree, config.socketDir);
  const windowCleanup = cleanupWindowForWorktree(config.sessionName, worktree);

  const socketExisted = fs.existsSync(socketPath);
  try {
    fs.rmSync(socketPath, {
      force: true,
    });
  } catch (error) {
    throw new OpenerError("Failed to remove nvim socket for archived worktree", {
      worktree,
      socketPath,
      cause: error,
    });
  }

  return {
    worktree,
    socketPath,
    socketRemoved: socketExisted,
    windowCleanup,
  };
}

export function executeOpenAction(action, config, logger) {
  ensureDependencies(config);
  ensureSocketDir(config.socketDir);
  const nvimCommand = resolveExecutable("nvim");
  const alacrittyCmd = resolveAlacrittyCommand(config);

  const worktree = resolveTargetWorktree(action, config);
  const socketPath = socketPathForWorktree(worktree, config.socketDir);

  const { sessionCreated, window } = ensureWindow({
    sessionName: config.sessionName,
    worktree,
    socketPath,
    nvimCommand,
  });

  if (shouldOpenAlacritty(sessionCreated, config)) {
    logger.debug("Launching Alacritty attach", {
      session: config.sessionName,
      alacritty: alacrittyCmd,
    });
    launchAlacritty(alacrittyCmd, config.sessionName);
  }

  selectWindow(window.windowId);

  ensureNvimServer(window.windowId, worktree, socketPath, nvimCommand);
  setServerCwd(socketPath, worktree);

  let openedPath = null;
  if (action.kind === "open-path") {
    const absolutePath = resolveAbsolutePath(action.path);
    try {
      if (fs.statSync(absolutePath).isFile()) {
        openFileInServer(socketPath, absolutePath, action.line, action.col);
        openedPath = absolutePath;
      }
    } catch {
      openFileInServer(socketPath, absolutePath, action.line, action.col);
      openedPath = absolutePath;
    }
  }

  focusAlacritty(alacrittyCmd);

  logger.info("Open handled", {
    source: action.source,
    kind: action.kind,
    worktree,
    windowId: window.windowId,
    path: openedPath,
  });
}

export function executeSyncThreadStateAction(action, config, logger) {
  ensureDependencies(config);

  const summary = syncManagedWorktreesWithThreadState({
    logger,
    listManagedWorktrees: () =>
      listManagedWindows(config.sessionName)
        .map((window) => window.worktree)
        .filter(Boolean),
    cleanupWorktree: (worktree) => cleanupWorktreeState(worktree, config),
  });

  logger.info("Thread state sync handled", {
    source: action.source,
    kind: action.kind,
    activeThreadStateAvailable: summary.activeThreadStateAvailable,
    activeWorktrees: summary.activeWorktrees,
    managedWorktrees: summary.managedWorktrees,
    orphanedWorktrees: summary.orphanedWorktrees,
    cleanedWorktrees: summary.cleanedWorktrees,
    failedWorktrees: summary.failedWorktrees,
  });
}
