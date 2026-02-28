import { commandExists } from "./shell.js";
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
  const binaries = ["tmux", "nvim", config.alacrittyCmd];
  const missing = binaries.filter((binary) => !commandExists(binary));
  if (missing.length > 0) {
    throw new OpenerError("Missing required binaries", {
      missing,
    });
  }
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
    throw new OpenerError(
      "Unable to resolve worktree for empty open request. Provide --worktree or open a file first.",
    );
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

  const worktree = resolveTargetWorktree(action, config);
  const socketPath = socketPathForWorktree(worktree, config.socketDir);

  const { sessionCreated, window } = ensureWindow({
    sessionName: config.sessionName,
    worktree,
    socketPath,
  });

  if (shouldOpenAlacritty(sessionCreated, config)) {
    logger.debug("Launching Alacritty attach", {
      session: config.sessionName,
      alacritty: config.alacrittyCmd,
    });
    launchAlacritty(config.alacrittyCmd, config.sessionName);
  }

  selectWindow(window.windowId);

  ensureNvimServer(window.windowId, worktree, socketPath);
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
