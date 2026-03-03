#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${NVIM_OPENER_BIN_DIR:-$HOME/.local/bin}"
APP_DIR="${NVIM_OPENER_APP_DIR:-$HOME/Applications}"
APP_PATH="$APP_DIR/NvimOpenerURLHandler.app"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
ARCHIVE_SYNC_LABEL="com.nick.nvim-opener.archive-sync"
ARCHIVE_SYNC_PLIST="$LAUNCH_AGENTS_DIR/$ARCHIVE_SYNC_LABEL.plist"
VSCODE_INSIDERS_APP_ROOT="${NVIM_OPENER_VSCODE_INSIDERS_APP_ROOT:-$HOME/Applications/Visual Studio Code - Insiders.app}"
VSCODE_INSIDERS_CODE_PATH="$VSCODE_INSIDERS_APP_ROOT/Contents/Resources/app/bin/code"

remove_dir_if_empty() {
  local dir="$1"
  [[ -d "$dir" ]] || return
  rmdir "$dir" >/dev/null 2>&1 || true
}

rm -f "$BIN_DIR/nvim-opener" "$BIN_DIR/code-insiders"
rm -rf "$APP_PATH"

if [[ -L "$VSCODE_INSIDERS_CODE_PATH" ]]; then
  local_symlink_target="$(readlink "$VSCODE_INSIDERS_CODE_PATH" || true)"
  if [[ "$local_symlink_target" == "$BIN_DIR/code-insiders" || "$local_symlink_target" == "$REPO_ROOT/bin/code-insiders" ]]; then
    rm -f "$VSCODE_INSIDERS_CODE_PATH"
    remove_dir_if_empty "$(dirname "$VSCODE_INSIDERS_CODE_PATH")"
    remove_dir_if_empty "$VSCODE_INSIDERS_APP_ROOT/Contents/Resources/app"
    remove_dir_if_empty "$VSCODE_INSIDERS_APP_ROOT/Contents/Resources"
    remove_dir_if_empty "$VSCODE_INSIDERS_APP_ROOT/Contents"
    remove_dir_if_empty "$VSCODE_INSIDERS_APP_ROOT"
  fi
fi

if [[ -f "$ARCHIVE_SYNC_PLIST" ]]; then
  LAUNCH_DOMAIN="gui/$(id -u)"
  launchctl bootout "$LAUNCH_DOMAIN/$ARCHIVE_SYNC_LABEL" >/dev/null 2>&1 || true
  launchctl disable "$LAUNCH_DOMAIN/$ARCHIVE_SYNC_LABEL" >/dev/null 2>&1 || true
  rm -f "$ARCHIVE_SYNC_PLIST"
fi

echo "Removed shims from: $BIN_DIR"
echo "Removed URL handler app: $APP_PATH"
echo "Removed VS Code Insiders detection shim if owned: $VSCODE_INSIDERS_CODE_PATH"
echo "Removed archive sync launch agent: $ARCHIVE_SYNC_PLIST"
echo "If needed, reassign vscode-insiders:// to VS Code Insiders manually."
