import { spawn, spawnSync } from "node:child_process";
import { CommandError } from "./errors.js";

export function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  if (result.error) {
    throw new CommandError(`Failed to run ${command}`, {
      cause: result.error,
      command,
      args,
    });
  }

  if (result.status !== 0) {
    throw new CommandError(`Command failed: ${command}`, {
      command,
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
  const result = spawnSync(command, args, {
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
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    ...options,
  });
  child.unref();
}

export function commandExists(command) {
  const result = spawnSync("which", [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

export function sleepMs(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
