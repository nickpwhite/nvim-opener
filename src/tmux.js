import fs from "node:fs";
import path from "node:path";
import { shortHash } from "./hash.js";
import {
  runCommand,
  tryCommand,
  spawnDetached,
  shellQuote,
  sleepMs,
} from "./shell.js";
import {
  findWindowByWorktree,
  parseWindowRows,
  pickMostRecentManagedWindow,
} from "./tmux-selection.js";
import { OpenerError } from "./errors.js";

function parseWindowIdentity(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    throw new OpenerError("tmux did not return a window identity");
  }

  const [windowIdRaw, windowIndexRaw] = trimmed.split("\t");
  if (!windowIdRaw || !windowIndexRaw) {
    throw new OpenerError("Invalid tmux window identity output", {
      output: trimmed,
    });
  }

  return {
    windowId: windowIdRaw,
    windowIndex: Number.parseInt(windowIndexRaw, 10),
  };
}

function buildNvimCommand(worktree, socketPath) {
  return `cd ${shellQuote(worktree)} && exec nvim --listen ${shellQuote(socketPath)}`;
}

export function socketPathForWorktree(worktree, socketDir) {
  const hash = shortHash(worktree, 16);
  return path.join(socketDir, `${hash}.sock`);
}

export function windowNameForWorktree(worktree) {
  const base = path.basename(worktree).replace(/[^a-zA-Z0-9._-]+/g, "-") || "worktree";
  return `${base}-${shortHash(worktree, 6)}`;
}

export function hasSession(sessionName) {
  const result = tryCommand("tmux", ["has-session", "-t", sessionName]);
  return result.ok;
}

export function listManagedWindows(sessionName) {
  const result = tryCommand("tmux", [
    "list-windows",
    "-t",
    sessionName,
    "-F",
    "#{window_id}\t#{window_index}\t#{@codex_worktree}\t#{window_activity}\t#{window_active}",
  ]);

  if (!result.ok) {
    return [];
  }

  return parseWindowRows(result.stdout);
}

export function findWindowForWorktree(sessionName, worktree) {
  const windows = listManagedWindows(sessionName);
  return findWindowByWorktree(windows, worktree);
}

export function getMostRecentManagedWorktree(sessionName) {
  const windows = listManagedWindows(sessionName);
  const selected = pickMostRecentManagedWindow(windows);
  return selected ? selected.worktree : null;
}

function setWindowWorktree(windowId, worktree) {
  runCommand("tmux", [
    "set-option",
    "-w",
    "-t",
    windowId,
    "@codex_worktree",
    worktree,
  ]);
}

function createSessionWindow({ sessionName, worktree, windowName, socketPath }) {
  const create = runCommand("tmux", [
    "new-session",
    "-d",
    "-P",
    "-F",
    "#{window_id}\t#{window_index}",
    "-s",
    sessionName,
    "-n",
    windowName,
    "-c",
    worktree,
    buildNvimCommand(worktree, socketPath),
  ]);

  const identity = parseWindowIdentity(create.stdout);
  setWindowWorktree(identity.windowId, worktree);
  return identity;
}

function createAdditionalWindow({ sessionName, worktree, windowName, socketPath }) {
  const create = runCommand("tmux", [
    "new-window",
    "-d",
    "-P",
    "-F",
    "#{window_id}\t#{window_index}",
    "-t",
    sessionName,
    "-n",
    windowName,
    "-c",
    worktree,
    buildNvimCommand(worktree, socketPath),
  ]);

  const identity = parseWindowIdentity(create.stdout);
  setWindowWorktree(identity.windowId, worktree);
  return identity;
}

function listPanes(windowId) {
  const output = runCommand("tmux", [
    "list-panes",
    "-t",
    windowId,
    "-F",
    "#{pane_id}\t#{pane_index}\t#{pane_current_path}",
  ]);

  return output.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [paneId, paneIndexRaw, panePath] = line.split("\t");
      return {
        paneId,
        paneIndex: Number.parseInt(paneIndexRaw, 10),
        panePath,
      };
    })
    .sort((a, b) => a.paneIndex - b.paneIndex);
}

function normalizeWindowLayout(windowId, worktree) {
  let panes = listPanes(windowId);

  while (panes.length > 2) {
    const pane = panes[panes.length - 1];
    runCommand("tmux", ["kill-pane", "-t", pane.paneId]);
    panes = listPanes(windowId);
  }

  if (panes.length < 2) {
    runCommand("tmux", ["split-window", "-d", "-t", windowId, "-v", "-c", worktree]);
    panes = listPanes(windowId);
  }

  runCommand("tmux", ["select-layout", "-t", windowId, "main-horizontal"]);

  if (panes.length >= 2 && panes[1].panePath !== worktree) {
    runCommand("tmux", ["send-keys", "-t", panes[1].paneId, `cd ${shellQuote(worktree)}`, "C-m"]);
  }
}

export function ensureWindow({ sessionName, worktree, socketPath }) {
  const sessionExists = hasSession(sessionName);
  let sessionCreated = false;
  let window = findWindowForWorktree(sessionName, worktree);

  if (!sessionExists) {
    sessionCreated = true;
    window = createSessionWindow({
      sessionName,
      worktree,
      windowName: windowNameForWorktree(worktree),
      socketPath,
    });
  } else if (!window) {
    window = createAdditionalWindow({
      sessionName,
      worktree,
      windowName: windowNameForWorktree(worktree),
      socketPath,
    });
  }

  if (!window) {
    throw new OpenerError("Unable to create or find tmux window", {
      sessionName,
      worktree,
    });
  }

  normalizeWindowLayout(window.windowId, worktree);

  return {
    sessionCreated,
    window,
  };
}

export function selectWindow(windowId) {
  runCommand("tmux", ["select-window", "-t", windowId]);
}

export function hasAlacrittyClient(sessionName) {
  const result = tryCommand("tmux", [
    "list-clients",
    "-t",
    sessionName,
    "-F",
    "#{client_termname}",
  ]);

  if (!result.ok) {
    return false;
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .some((line) => line.includes("alacritty"));
}

export function launchAlacritty(alacrittyCmd, sessionName) {
  spawnDetached(alacrittyCmd, ["-e", "tmux", "attach-session", "-t", sessionName]);
}

function nvimServerResponsive(socketPath) {
  const check = tryCommand("nvim", ["--server", socketPath, "--remote-expr", "1"]);
  return check.ok;
}

export function ensureNvimServer(windowId, worktree, socketPath) {
  if (nvimServerResponsive(socketPath)) {
    return;
  }

  runCommand("tmux", ["send-keys", "-t", `${windowId}.0`, "C-c"]);
  runCommand("tmux", [
    "send-keys",
    "-t",
    `${windowId}.0`,
    buildNvimCommand(worktree, socketPath),
    "C-m",
  ]);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (nvimServerResponsive(socketPath)) {
      return;
    }
    sleepMs(100);
  }

  throw new OpenerError("Neovim server did not become available", {
    socketPath,
    windowId,
  });
}

export function setServerCwd(socketPath, worktree) {
  const escapedWorktree = worktree.replace(/'/g, "''");
  runCommand("nvim", [
    "--server",
    socketPath,
    "--remote-send",
    `<C-\\\\><C-N>:execute 'cd ' . fnameescape('${escapedWorktree}')<CR>`,
  ]);
}

export function openFileInServer(socketPath, filePath, line, col) {
  runCommand("nvim", ["--server", socketPath, "--remote", filePath]);

  if (line) {
    const finalCol = col || 1;
    runCommand("nvim", [
      "--server",
      socketPath,
      "--remote-send",
      `<C-\\><C-N>:call cursor(${line},${finalCol})<CR>zz`,
    ]);
  }
}

export function ensureSocketDir(socketDir) {
  fs.mkdirSync(socketDir, {
    recursive: true,
  });
}
