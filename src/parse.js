import { fileURLToPath } from "node:url";

import { OpenerError } from "./errors.js";

function parsePositiveInt(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new OpenerError(`Invalid ${fieldName}: ${value}`);
  }
  return parsed;
}

export function parsePathWithLineCol(input) {
  const raw = String(input || "").trim();
  if (!raw) {
    throw new OpenerError("Path cannot be empty");
  }

  const match = /^(.*?):(\d+)(?::(\d+))?$/.exec(raw);
  if (!match) {
    return {
      path: raw,
      line: null,
      col: null,
    };
  }

  return {
    path: match[1],
    line: parsePositiveInt(match[2], "line"),
    col: match[3] ? parsePositiveInt(match[3], "col") : null,
  };
}

export function parseVsCodeInsidersUri(uriText) {
  let uri;
  try {
    uri = new URL(uriText);
  } catch (error) {
    throw new OpenerError("Invalid URI", { uri: uriText, cause: error });
  }

  if (uri.protocol !== "vscode-insiders:") {
    throw new OpenerError("Unsupported URI protocol", {
      expected: "vscode-insiders:",
      actual: uri.protocol,
    });
  }

  if (uri.hostname !== "file" && uri.hostname !== "") {
    throw new OpenerError("Unsupported URI host", {
      expected: "file",
      actual: uri.hostname,
    });
  }

  const decodedPath = decodeUriPathname(uri.pathname);
  if (!decodedPath) {
    return {
      kind: "open-empty",
      source: "uri",
    };
  }

  const parsedPath = parsePathWithLineCol(decodedPath);
  let line = parsedPath.line;
  let col = parsedPath.col;

  if (uri.searchParams.has("line")) {
    line = parsePositiveInt(uri.searchParams.get("line"), "line");
  }
  if (uri.searchParams.has("column")) {
    col = parsePositiveInt(uri.searchParams.get("column"), "column");
  }

  return {
    kind: "open-path",
    source: "uri",
    path: parsedPath.path,
    line,
    col,
  };
}

function decodeUriPathname(pathname) {
  if (!pathname || pathname === "/") {
    return "";
  }

  try {
    return fileURLToPath(`file://${pathname}`);
  } catch (error) {
    throw new OpenerError("Invalid file path in URI", {
      pathname,
      cause: error,
    });
  }
}

function decodeFileUriPath(uriText) {
  try {
    const uri = new URL(uriText);
    if (uri.protocol !== "file:") {
      return null;
    }

    return decodeUriPathname(uri.pathname);
  } catch {
    return null;
  }
}

function normalizePathLikeArg(value) {
  if (typeof value !== "string") {
    return value;
  }

  if (value.startsWith("vscode-insiders://")) {
    return value;
  }

  const decodedFileUri = decodeFileUriPath(value);
  if (decodedFileUri) {
    return decodedFileUri;
  }

  return value;
}

function findNextValue(args, index, flag) {
  const next = args[index + 1];
  if (!next || next.startsWith("-")) {
    throw new OpenerError(`Missing value for ${flag}`);
  }
  return next;
}

export function parseCodeInsidersArgs(rawArgs) {
  const args = [...rawArgs];
  let gotoSpec = null;
  let pathSpec = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg.startsWith("vscode-insiders://")) {
      return parseVsCodeInsidersUri(arg);
    }

    if (arg === "--goto" || arg === "-g") {
      gotoSpec = findNextValue(args, i, arg);
      i += 1;
      continue;
    }

    if (arg.startsWith("--goto=")) {
      gotoSpec = arg.slice("--goto=".length);
      continue;
    }

    if (arg === "--file-uri" || arg === "--folder-uri") {
      const uriValue = findNextValue(args, i, arg);
      if (uriValue.startsWith("vscode-insiders://")) {
        return parseVsCodeInsidersUri(uriValue);
      }
      pathSpec = normalizePathLikeArg(uriValue);
      i += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      continue;
    }

    if (!pathSpec) {
      pathSpec = normalizePathLikeArg(arg);
    }
  }

  const selected = gotoSpec || pathSpec;
  if (!selected) {
    return {
      kind: "open-empty",
      source: "code-insiders",
      worktree: process.cwd(),
    };
  }

  if (selected.startsWith("vscode-insiders://")) {
    return parseVsCodeInsidersUri(selected);
  }

  const parsedPath = parsePathWithLineCol(normalizePathLikeArg(selected));
  return {
    kind: "open-path",
    source: "code-insiders",
    path: parsedPath.path,
    line: parsedPath.line,
    col: parsedPath.col,
  };
}

export function parseCliArgs(argv) {
  const args = [...argv];

  const state = {
    uri: null,
    path: null,
    line: null,
    col: null,
    openEmpty: false,
    worktree: null,
    syncThreadState: false,
    fromCodeInsiders: null,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--from-code-insiders") {
      state.fromCodeInsiders = args.slice(i + 1);
      break;
    }

    if (arg === "--uri") {
      state.uri = findNextValue(args, i, arg);
      i += 1;
      continue;
    }

    if (arg === "--path") {
      state.path = findNextValue(args, i, arg);
      i += 1;
      continue;
    }

    if (arg === "--line") {
      state.line = parsePositiveInt(findNextValue(args, i, arg), "line");
      i += 1;
      continue;
    }

    if (arg === "--col") {
      state.col = parsePositiveInt(findNextValue(args, i, arg), "col");
      i += 1;
      continue;
    }

    if (arg === "--worktree") {
      state.worktree = findNextValue(args, i, arg);
      i += 1;
      continue;
    }

    if (arg === "--sync-thread-state") {
      state.syncThreadState = true;
      continue;
    }

    if (arg === "--open-empty") {
      state.openEmpty = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return {
        command: "help",
      };
    }

    throw new OpenerError(`Unknown argument: ${arg}`);
  }

  const hasOpenFlags = Boolean(
    state.uri || state.path || state.openEmpty || state.worktree || state.line || state.col,
  );

  if (state.syncThreadState) {
    if (hasOpenFlags || state.fromCodeInsiders) {
      throw new OpenerError("--sync-thread-state must be used without other arguments");
    }

    return {
      kind: "sync-thread-state",
      source: "cli",
    };
  }

  if (state.fromCodeInsiders) {
    if (hasOpenFlags) {
      throw new OpenerError("--from-code-insiders cannot be combined with direct open flags");
    }
    return {
      command: "from-code-insiders",
      args: state.fromCodeInsiders,
    };
  }

  if (state.uri) {
    const parsed = parseVsCodeInsidersUri(state.uri);
    if (state.worktree) {
      return {
        ...parsed,
        worktree: state.worktree,
      };
    }
    return parsed;
  }

  if (state.path) {
    return {
      kind: "open-path",
      source: "cli",
      path: state.path,
      line: state.line,
      col: state.col,
      worktree: state.worktree,
    };
  }

  if (state.openEmpty || state.worktree) {
    return {
      kind: "open-empty",
      source: "cli",
      worktree: state.worktree,
    };
  }

  return {
    command: "help",
  };
}

export function formatHelp() {
  return [
    "Usage:",
    "  nvim-opener --uri <vscode-insiders://...>",
    "  nvim-opener --path <path> [--line N] [--col N]",
    "  nvim-opener --open-empty [--worktree <path>]",
    "  nvim-opener --sync-thread-state",
    "  nvim-opener --from-code-insiders <raw-args...>",
  ].join("\n");
}
