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

## Requirements

- macOS
- `tmux`
- `nvim` (with `--server` support)
- `alacritty`
- Node.js 20+
- VS Code Insiders installed and selected in Codex "Open in" settings

## Install

1. Set Codex "Open in" target to `VS Code Insiders`.
2. Run:

```bash
./scripts/install-macos.sh
```

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
nvim-opener --from-code-insiders --goto "/Users/nick/.codex/worktrees/1234/repo/src/a.ts:14:2"
```

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

## Uninstall

```bash
./scripts/uninstall-macos.sh
```

## Test

```bash
npm test
```
