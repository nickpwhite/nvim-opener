import os from "node:os";
import path from "node:path";
import { commandExists, resolveExecutable } from "./shell.js";
import { OpenerError } from "./errors.js";
import {
  ensureNvimServer,
  ensureSocketDir,
  ensureWindow,
  getMostRecentManagedWorktree,
  hasAlacrittyClient,
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

export function executeOpenAction(action, config, logger) {
  ensureDependencies(config);
  ensureSocketDir(config.socketDir);
  const nvimCommand = resolveExecutable("nvim");

  const worktree = resolveTargetWorktree(action, config);
  const socketPath = socketPathForWorktree(worktree, config.socketDir);

  const { sessionCreated, window } = ensureWindow({
    sessionName: config.sessionName,
    worktree,
    socketPath,
    nvimCommand,
  });

  if (shouldOpenAlacritty(sessionCreated, config)) {
    const alacrittyCmd = resolveAlacrittyCommand(config);
    logger.debug("Launching Alacritty attach", {
      session: config.sessionName,
      alacritty: alacrittyCmd,
    });
    launchAlacritty(alacrittyCmd, config.sessionName);
  }

  selectWindow(window.windowId);

  ensureNvimServer(window.windowId, worktree, socketPath, nvimCommand);
  setServerCwd(socketPath, worktree);

  if (action.kind === "open-path") {
    const absolutePath = resolveAbsolutePath(action.path);
    openFileInServer(socketPath, absolutePath, action.line, action.col);
  }

  logger.info("Open handled", {
    source: action.source,
    kind: action.kind,
    worktree,
    windowId: window.windowId,
    path: action.kind === "open-path" ? action.path : null,
  });
}
