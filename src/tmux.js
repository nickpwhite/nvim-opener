import fs from "node:fs";
import path from "node:path";
import { shortHash } from "./hash.js";
import {
  runCommand,
  tryCommand,
  spawnDetached,
  shellQuote,
  sleepMs,
  resolveExecutable,
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

  const splitParts = trimmed.split(/\s+/).filter(Boolean);
  if (
    splitParts.length >= 2 &&
    /^@\d+$/.test(splitParts[0]) &&
    /^\d+$/.test(splitParts[1])
  ) {
    return {
      windowId: splitParts[0],
      windowIndex: Number.parseInt(splitParts[1], 10),
    };
  }

  const mixedFormat = /^(@\d+)[^\d]+(\d+)$/.exec(trimmed);
  if (mixedFormat) {
    return {
      windowId: mixedFormat[1],
      windowIndex: Number.parseInt(mixedFormat[2], 10),
    };
  }

  const idOnly = /(@\d+)/.exec(trimmed);
  if (idOnly) {
    const idxLookup = tryCommand("tmux", [
      "display-message",
      "-p",
      "-t",
      idOnly[1],
      "#{window_index}",
    ]);

    if (idxLookup.ok) {
      const indexRaw = idxLookup.stdout.trim();
      if (/^\d+$/.test(indexRaw)) {
        return {
          windowId: idOnly[1],
          windowIndex: Number.parseInt(indexRaw, 10),
        };
      }
    }
  }

  throw new OpenerError("Invalid tmux window identity output", {
    output: trimmed,
  });
}

function buildNvimCommand(worktree, socketPath, nvimCommand) {
  return `cd ${shellQuote(worktree)} && exec ${shellQuote(nvimCommand)} --listen ${shellQuote(socketPath)}`;
}

export function socketPathForWorktree(worktree, socketDir) {
  const hash = shortHash(worktree, 16);
  return path.join(socketDir, `${hash}.sock`);
}

function sanitizeWindowName(value) {
  const sanitized = String(value || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "worktree";
}

function resolveGitBranch(worktree) {
  const symbolic = tryCommand("git", [
    "-C",
    worktree,
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ]);
  if (symbolic.ok) {
    const branch = symbolic.stdout.trim();
    if (branch) {
      return branch;
    }
  }

  const abbrev = tryCommand("git", ["-C", worktree, "rev-parse", "--abbrev-ref", "HEAD"]);
  if (abbrev.ok) {
    const branch = abbrev.stdout.trim();
    if (branch && branch !== "HEAD") {
      return branch;
    }
  }

  return null;
}

export function windowNameForWorktree(worktree) {
  const repoName = sanitizeWindowName(path.basename(worktree));
  const branch = resolveGitBranch(worktree);

  if (!branch) {
    return `${repoName}-${shortHash(worktree, 6)}`;
  }

  const branchName = sanitizeWindowName(branch);
  if (branchName === "main") {
    return `${repoName}-main`;
  }

  return branchName;
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
    "#{window_id}\u001f#{window_index}\u001f#{@codex_worktree}\u001f#{window_activity}\u001f#{window_active}",
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

function setWindowName(windowId, windowName) {
  runCommand("tmux", [
    "rename-window",
    "-t",
    windowId,
    windowName,
  ]);
}

function createSessionWindow({
  sessionName,
  worktree,
  windowName,
  socketPath,
  nvimCommand,
}) {
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
    buildNvimCommand(worktree, socketPath, nvimCommand),
  ]);

  const identity = parseWindowIdentity(create.stdout);
  setWindowWorktree(identity.windowId, worktree);
  setWindowName(identity.windowId, windowName);
  return identity;
}

function createAdditionalWindow({
  sessionName,
  worktree,
  windowName,
  socketPath,
  nvimCommand,
}) {
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
    buildNvimCommand(worktree, socketPath, nvimCommand),
  ]);

  const identity = parseWindowIdentity(create.stdout);
  setWindowWorktree(identity.windowId, worktree);
  setWindowName(identity.windowId, windowName);
  return identity;
}

function listPanes(windowId) {
  const output = runCommand("tmux", [
    "list-panes",
    "-t",
    windowId,
    "-F",
    "#{pane_id}\u001f#{pane_index}\u001f#{pane_current_path}",
  ]);

  const parsePaneLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    const unitSepParts = trimmed.split("\u001f");
    if (
      unitSepParts.length >= 3 &&
      /^%\d+$/.test(unitSepParts[0]) &&
      /^\d+$/.test(unitSepParts[1])
    ) {
      return {
        paneId: unitSepParts[0],
        paneIndex: Number.parseInt(unitSepParts[1], 10),
        panePath: unitSepParts.slice(2).join("\u001f"),
      };
    }

    const tabParts = trimmed.split("\t");
    if (tabParts.length >= 3 && /^%\d+$/.test(tabParts[0]) && /^\d+$/.test(tabParts[1])) {
      return {
        paneId: tabParts[0],
        paneIndex: Number.parseInt(tabParts[1], 10),
        panePath: tabParts.slice(2).join("\t"),
      };
    }

    const compact = /^(%\d+)[_ ](\d+)[_ ](.+)$/.exec(trimmed);
    if (compact) {
      return {
        paneId: compact[1],
        paneIndex: Number.parseInt(compact[2], 10),
        panePath: compact[3],
      };
    }

    return null;
  };

  return output.stdout
    .split("\n")
    .map(parsePaneLine)
    .filter((row) => row !== null)
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

export function ensureWindow({ sessionName, worktree, socketPath, nvimCommand }) {
  const sessionExists = hasSession(sessionName);
  let sessionCreated = false;
  const targetWindowName = windowNameForWorktree(worktree);
  let window = findWindowForWorktree(sessionName, worktree);

  if (!sessionExists) {
    sessionCreated = true;
    window = createSessionWindow({
      sessionName,
      worktree,
      windowName: targetWindowName,
      socketPath,
      nvimCommand,
    });
  } else if (!window) {
    window = createAdditionalWindow({
      sessionName,
      worktree,
      windowName: targetWindowName,
      socketPath,
      nvimCommand,
    });
  }

  if (!window) {
    throw new OpenerError("Unable to create or find tmux window", {
      sessionName,
      worktree,
    });
  }

  setWindowName(window.windowId, targetWindowName);
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
  const tmuxCommand = resolveExecutable("tmux");
  spawnDetached(alacrittyCmd, ["-e", tmuxCommand, "attach-session", "-t", sessionName]);
}

function alacrittyAppName(alacrittyCmd) {
  if (alacrittyCmd.includes(".app")) {
    const match = /\/([^/]+)\.app(?:\/|$)/.exec(alacrittyCmd);
    if (match) {
      return match[1];
    }
  }
  return "Alacritty";
}

export function focusAlacritty(alacrittyCmd) {
  const appName = alacrittyAppName(alacrittyCmd);
  const activate = tryCommand("osascript", [
    "-e",
    `tell application "${appName}" to activate`,
  ]);
  if (activate.ok) {
    return;
  }

  tryCommand("open", ["-a", appName]);
}

function nvimServerResponsive(socketPath) {
  const check = tryCommand("nvim", ["--server", socketPath, "--remote-expr", "1"]);
  return check.ok;
}

export function ensureNvimServer(windowId, worktree, socketPath, nvimCommand) {
  if (nvimServerResponsive(socketPath)) {
    return;
  }

  runCommand("tmux", ["send-keys", "-t", `${windowId}.0`, "C-c"]);
  runCommand("tmux", [
    "send-keys",
    "-t",
    `${windowId}.0`,
    buildNvimCommand(worktree, socketPath, nvimCommand),
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
