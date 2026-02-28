import path from "node:path";
import os from "node:os";

export function loadConfig(env = process.env) {
  return {
    sessionName: env.NVIM_OPENER_SESSION || "codex-nvim-opener",
    alacrittyCmd: env.NVIM_OPENER_ALACRITTY_CMD || "alacritty",
    socketDir:
      env.NVIM_OPENER_SOCKET_DIR || path.join(os.tmpdir(), "nvim-opener-sockets"),
    debug: env.NVIM_OPENER_DEBUG === "1",
  };
}
