function parseNumber(input, fallback = 0) {
  const value = Number.parseInt(input, 10);
  return Number.isFinite(value) ? value : fallback;
}

function parseDelimitedWindow(parts) {
  if (!parts || parts.length < 2) {
    return null;
  }

  const windowId = parts[0];
  const windowIndexRaw = parts[1];
  if (!/^@\d+$/.test(windowId) || !/^\d+$/.test(windowIndexRaw)) {
    return null;
  }

  return {
    windowId,
    windowIndex: parseNumber(windowIndexRaw),
    worktree: parts[2] || null,
    activity: parseNumber(parts[3]),
    active: parts[4] === "1",
  };
}

function parseCompactWindowLine(line) {
  const compact = /^(@\d+)[_ ](\d+)[_ ](.*)$/.exec(line);
  if (!compact) {
    return null;
  }

  const windowId = compact[1];
  const windowIndexRaw = compact[2];
  const rest = compact[3];

  const tail = /^(.*)[_ ](\d+)[_ ]([01])$/.exec(rest);
  if (tail) {
    return {
      windowId,
      windowIndex: parseNumber(windowIndexRaw),
      worktree: tail[1] || null,
      activity: parseNumber(tail[2]),
      active: tail[3] === "1",
    };
  }

  return {
    windowId,
    windowIndex: parseNumber(windowIndexRaw),
    worktree: rest || null,
    activity: 0,
    active: false,
  };
}

export function parseWindowRows(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const unitSep = parseDelimitedWindow(line.split("\u001f"));
      if (unitSep) {
        return unitSep;
      }

      const tab = parseDelimitedWindow(line.split("\t"));
      if (tab) {
        return tab;
      }

      return parseCompactWindowLine(line);
    })
    .filter((row) => row !== null);
}

export function findWindowByWorktree(windows, worktree) {
  return windows.find((window) => window.worktree === worktree) || null;
}

export function pickMostRecentManagedWindow(windows) {
  const managed = windows.filter((window) => Boolean(window.worktree));
  if (managed.length === 0) {
    return null;
  }

  managed.sort((a, b) => {
    if (a.activity !== b.activity) {
      return b.activity - a.activity;
    }
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }
    return a.windowIndex - b.windowIndex;
  });

  return managed[0];
}
