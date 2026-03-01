import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CommandError } from "./errors.js";

const FALLBACK_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  path.join(process.env.HOME || "", ".local/bin"),
].filter(Boolean);

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveCommand(command) {
  if (command.includes("/")) {
    return command;
  }

  for (const dir of FALLBACK_BIN_DIRS) {
    const candidate = path.join(dir, command);
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  const whichResult = spawnSync("/usr/bin/which", [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (whichResult.status === 0) {
    const resolved = (whichResult.stdout || "").trim().split("\n")[0];
    if (resolved) {
      return resolved;
    }
  }

  return command;
}

export function resolveExecutable(command) {
  return resolveCommand(command);
}

export function runCommand(command, args = [], options = {}) {
  const resolvedCommand = resolveCommand(command);
  const result = spawnSync(resolvedCommand, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  if (result.error) {
    throw new CommandError(`Failed to run ${command}`, {
      cause: result.error,
      command: resolvedCommand,
      args,
    });
  }

  if (result.status !== 0) {
    throw new CommandError(`Command failed: ${command}`, {
      command: resolvedCommand,
      args,
      status: result.status,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    });
  }

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

export function tryCommand(command, args = [], options = {}) {
  const resolvedCommand = resolveCommand(command);
  const result = spawnSync(resolvedCommand, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  if (result.error) {
    return {
      ok: false,
      error: result.error,
      status: null,
      stdout: "",
      stderr: "",
    };
  }

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

export function spawnDetached(command, args = [], options = {}) {
  const resolvedCommand = resolveCommand(command);
  const child = spawn(resolvedCommand, args, {
    detached: true,
    stdio: "ignore",
    ...options,
  });
  child.unref();
}

export function commandExists(command) {
  return isExecutable(resolveCommand(command));
}

export function sleepMs(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
