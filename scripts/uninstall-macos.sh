#!/usr/bin/env bash
set -euo pipefail

BIN_DIR="${NVIM_OPENER_BIN_DIR:-$HOME/.local/bin}"
APP_DIR="${NVIM_OPENER_APP_DIR:-$HOME/Applications}"
APP_PATH="$APP_DIR/NvimOpenerURLHandler.app"

rm -f "$BIN_DIR/nvim-opener" "$BIN_DIR/code-insiders"
rm -rf "$APP_PATH"

echo "Removed shims from: $BIN_DIR"
echo "Removed URL handler app: $APP_PATH"
echo "If needed, reassign vscode-insiders:// to VS Code Insiders manually."
