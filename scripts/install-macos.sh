#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${NVIM_OPENER_BIN_DIR:-$HOME/.local/bin}"
APP_DIR="${NVIM_OPENER_APP_DIR:-$HOME/Applications}"
APP_PATH="$APP_DIR/NvimOpenerURLHandler.app"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
ARCHIVE_SYNC_LABEL="com.nick.nvim-opener.archive-sync"
ARCHIVE_SYNC_PLIST="$LAUNCH_AGENTS_DIR/$ARCHIVE_SYNC_LABEL.plist"
ARCHIVE_SYNC_TEMPLATE="$REPO_ROOT/macos/com.nick.nvim-opener.archive-sync.plist"
ARCHIVE_SYNC_LOG_PATH="$HOME/Library/Logs/nvim-opener-archive-sync.log"
ARCHIVE_SYNC_ERR_LOG_PATH="$HOME/Library/Logs/nvim-opener-archive-sync.err.log"
VSCODE_INSIDERS_APP_ROOT="${NVIM_OPENER_VSCODE_INSIDERS_APP_ROOT:-$HOME/Applications/Visual Studio Code - Insiders.app}"
VSCODE_INSIDERS_CODE_PATH="$VSCODE_INSIDERS_APP_ROOT/Contents/Resources/app/bin/code"
BUNDLE_ID="com.nick.nvimopener.urlhandler"
PLIST_BUDDY="/usr/libexec/PlistBuddy"
TEMPLATE="$REPO_ROOT/macos/vscode-insiders-url-handler.applescript"

mkdir -p "$BIN_DIR" "$APP_DIR" "$LAUNCH_AGENTS_DIR" "$(dirname "$ARCHIVE_SYNC_LOG_PATH")"

ln -sf "$REPO_ROOT/bin/nvim-opener" "$BIN_DIR/nvim-opener"
ln -sf "$REPO_ROOT/bin/code-insiders" "$BIN_DIR/code-insiders"

install_vscode_insiders_detection_shim() {
  local source_shim="$BIN_DIR/code-insiders"
  local target="$VSCODE_INSIDERS_CODE_PATH"
  local target_dir
  target_dir="$(dirname "$target")"

  mkdir -p "$target_dir"

  if [[ -e "$target" && ! -L "$target" ]]; then
    echo "Skipped VS Code Insiders detection shim (target exists and is not a symlink): $target"
    return
  fi

  if [[ -L "$target" ]]; then
    local current_target
    current_target="$(readlink "$target" || true)"
    if [[ "$current_target" != "$source_shim" && "$current_target" != "$REPO_ROOT/bin/code-insiders" ]]; then
      echo "Skipped VS Code Insiders detection shim (symlink points elsewhere): $target -> $current_target"
      return
    fi
  fi

  ln -sfn "$source_shim" "$target"
  echo "Installed VS Code Insiders detection shim: $target -> $source_shim"
}

install_vscode_insiders_detection_shim

TMP_SCRIPT="$(mktemp)"
TMP_LAUNCH_AGENT="$(mktemp)"
cleanup() {
  rm -f "$TMP_SCRIPT" "$TMP_LAUNCH_AGENT"
}
trap cleanup EXIT

escaped_bin_path="$(printf '%s' "$BIN_DIR/nvim-opener" | sed -e 's/[\\&]/\\\\&/g')"
sed "s#__NVIM_OPENER_BIN__#$escaped_bin_path#g" "$TEMPLATE" > "$TMP_SCRIPT"

osacompile -o "$APP_PATH" "$TMP_SCRIPT"

PLIST="$APP_PATH/Contents/Info.plist"

set_plist_string() {
  local key="$1"
  local value="$2"
  if "$PLIST_BUDDY" -c "Set :$key $value" "$PLIST" >/dev/null 2>&1; then
    return
  fi
  "$PLIST_BUDDY" -c "Add :$key string $value" "$PLIST"
}

set_plist_string "CFBundleIdentifier" "$BUNDLE_ID"
set_plist_string "CFBundleName" "Nvim Opener URL Handler"

"$PLIST_BUDDY" -c "Delete :CFBundleURLTypes" "$PLIST" >/dev/null 2>&1 || true
"$PLIST_BUDDY" -c "Add :CFBundleURLTypes array" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleURLTypes:0 dict" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleURLTypes:0:CFBundleURLName string VSCodeInsidersURL" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string vscode-insiders" "$PLIST"

LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [[ -x "$LSREGISTER" ]]; then
  "$LSREGISTER" -f "$APP_PATH" >/dev/null 2>&1 || true
fi

if command -v duti >/dev/null 2>&1; then
  duti -s "$BUNDLE_ID" vscode-insiders all || true
else
  defaults write com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers -array-add "{LSHandlerURLScheme=vscode-insiders;LSHandlerRoleAll=$BUNDLE_ID;}" || true
fi

killall cfprefsd >/dev/null 2>&1 || true

escaped_archive_log_path="$(printf '%s' "$ARCHIVE_SYNC_LOG_PATH" | sed -e 's/[\\&]/\\\\&/g')"
escaped_archive_err_log_path="$(printf '%s' "$ARCHIVE_SYNC_ERR_LOG_PATH" | sed -e 's/[\\&]/\\\\&/g')"
sed \
  -e "s#__NVIM_OPENER_BIN__#$escaped_bin_path#g" \
  -e "s#__ARCHIVE_SYNC_LOG_PATH__#$escaped_archive_log_path#g" \
  -e "s#__ARCHIVE_SYNC_ERR_LOG_PATH__#$escaped_archive_err_log_path#g" \
  "$ARCHIVE_SYNC_TEMPLATE" > "$TMP_LAUNCH_AGENT"
cp "$TMP_LAUNCH_AGENT" "$ARCHIVE_SYNC_PLIST"

LAUNCH_DOMAIN="gui/$(id -u)"
launchctl bootout "$LAUNCH_DOMAIN/$ARCHIVE_SYNC_LABEL" >/dev/null 2>&1 || true
if ! launchctl bootstrap "$LAUNCH_DOMAIN" "$ARCHIVE_SYNC_PLIST" >/dev/null 2>&1; then
  launchctl load -w "$ARCHIVE_SYNC_PLIST" >/dev/null 2>&1 || true
fi
launchctl enable "$LAUNCH_DOMAIN/$ARCHIVE_SYNC_LABEL" >/dev/null 2>&1 || true
launchctl kickstart -k "$LAUNCH_DOMAIN/$ARCHIVE_SYNC_LABEL" >/dev/null 2>&1 || true

echo "Installed nvim-opener shims to: $BIN_DIR"
echo "Installed URL handler app: $APP_PATH"
echo "Installed VS Code Insiders detection path: $VSCODE_INSIDERS_CODE_PATH"
echo "Installed archive sync launch agent: $ARCHIVE_SYNC_PLIST"
echo "Archive sync logs: $ARCHIVE_SYNC_LOG_PATH (stderr: $ARCHIVE_SYNC_ERR_LOG_PATH)"
echo "Configured vscode-insiders:// handler bundle id: $BUNDLE_ID"
echo "If '$BIN_DIR' is not in PATH, add it before /opt/homebrew/bin so code-insiders resolves to this shim."
