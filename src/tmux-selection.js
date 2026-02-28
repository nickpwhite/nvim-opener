function parseNumber(input, fallback = 0) {
  const value = Number.parseInt(input, 10);
  return Number.isFinite(value) ? value : fallback;
}

export function parseWindowRows(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [windowId, windowIndexRaw, worktreeRaw, activityRaw, activeRaw] = line.split("\t");
      return {
        windowId,
        windowIndex: parseNumber(windowIndexRaw),
        worktree: worktreeRaw || null,
        activity: parseNumber(activityRaw),
        active: activeRaw === "1",
      };
    });
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
