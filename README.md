# nvim-opener

Routes Codex "Open in editor" actions (configured to use VS Code Insiders) into a managed `tmux` + `neovim` + `alacritty` workflow.

## What It Does

- Uses one managed tmux session (default: `codex-nvim-opener`).
- Maintains one tmux window per worktree (`@codex_worktree` window metadata).
- Enforces `main-horizontal` layout with:
  - pane 0: primary Neovim instance (`--listen` socket)
  - pane 1: shell terminal at worktree cwd
- Opens files in the Neovim instance for the matching worktree.
- Handles "Open" (no file path) by focusing existing editor for the most recent managed worktree.
- Creates session/windows/editors on demand.
- Cleans up tmux + socket state for archived Codex worktrees.

## Requirements

- macOS
- `tmux`
- `nvim` (with `--server` support)
- `alacritty`
- Node.js 20+
- Codex "Open in" set to `VS Code Insiders`

## Install

1. Set Codex "Open in" target to `VS Code Insiders`.
2. Run:

```bash
./scripts/install-macos.sh
```

This installer also creates a safe detection shim at:

`~/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code`

pointing to this project's `code-insiders` wrapper, so Codex Desktop can detect `VS Code Insiders` without requiring a real Insiders app install.

If that path already exists and is not owned by this tool, it is left unchanged.

3. Ensure your shell `PATH` puts `~/.local/bin` before Homebrew bin paths so `code-insiders` resolves to the shim:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## CLI

```bash
nvim-opener --uri "vscode-insiders://file/Users/nick/.codex/worktrees/1234/repo/src/a.ts:14:2"
nvim-opener --path "/Users/nick/.codex/worktrees/1234/repo/src/a.ts" --line 14 --col 2
nvim-opener --open-empty
nvim-opener --open-empty --worktree "/Users/nick/.codex/worktrees/1234/repo"
nvim-opener --archive-worktree "/Users/nick/.codex/worktrees/1234/repo"
nvim-opener --sync-archives
nvim-opener --from-code-insiders --goto "/Users/nick/.codex/worktrees/1234/repo/src/a.ts:14:2"
```

## Archive Cleanup

- `--archive-worktree <path>`:
  - Resolves the worktree root.
  - Closes the managed tmux window for that worktree.
  - Removes the worktree nvim socket.
  - Does not focus Alacritty/terminal.
- `--sync-archives`:
  - Scans `~/.codex/archived_sessions/rollout-*.jsonl`.
  - Reads first-line `session_meta.payload.cwd`.
  - Cleans only worktrees under `~/.codex/worktrees`.
  - Stores checkpoint state at `~/.codex/tmp/nvim-opener-archive-sync-state.json`.

The macOS installer sets up a LaunchAgent (`com.nick.nvim-opener.archive-sync`) that runs `--sync-archives` every 15 seconds (`RunAtLoad=true`).

LaunchAgent logs:

- `~/Library/Logs/nvim-opener-archive-sync.log`
- `~/Library/Logs/nvim-opener-archive-sync.err.log`

## Worktree Resolution Rules

1. Path under `~/.codex/worktrees/<id>/<repo>/...` resolves to that `<repo>` root.
2. Else, if inside a Git repo, resolves to `git rev-parse --show-toplevel`.
3. Else, directory paths resolve to that directory.
4. Else, file paths resolve to parent directory.
5. No-path open resolves to most recent managed tmux worktree window.

## Environment Variables

- `NVIM_OPENER_SESSION` (default `codex-nvim-opener`)
- `NVIM_OPENER_ALACRITTY_CMD` (default `alacritty`)
- `NVIM_OPENER_SOCKET_DIR` (default `/tmp/nvim-opener-sockets`)
- `NVIM_OPENER_DEBUG=1` (JSON debug logs)
- `NVIM_OPENER_VSCODE_INSIDERS_APP_ROOT` (default `~/Applications/Visual Studio Code - Insiders.app`)
- `NVIM_OPENER_NODE_BIN` (optional absolute path to `node`, useful for GUI app PATH issues)
- `NVIM_OPENER_BOOTSTRAP_SHELL` (default `$SHELL`; `bash`/`zsh` relaunch via login shell and source `.bashrc`/`.zshrc`)
- `NVIM_OPENER_DISABLE_BOOTSTRAP=1` (disable shell bootstrap if you want raw environment behavior)

## Uninstall

```bash
./scripts/uninstall-macos.sh
```

## Test

```bash
npm test
```
