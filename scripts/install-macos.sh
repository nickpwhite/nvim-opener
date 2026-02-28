#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${NVIM_OPENER_BIN_DIR:-$HOME/.local/bin}"
APP_DIR="${NVIM_OPENER_APP_DIR:-$HOME/Applications}"
APP_PATH="$APP_DIR/NvimOpenerURLHandler.app"
BUNDLE_ID="com.nick.nvimopener.urlhandler"
PLIST_BUDDY="/usr/libexec/PlistBuddy"
TEMPLATE="$REPO_ROOT/macos/vscode-insiders-url-handler.applescript"

mkdir -p "$BIN_DIR" "$APP_DIR"

ln -sf "$REPO_ROOT/bin/nvim-opener" "$BIN_DIR/nvim-opener"
ln -sf "$REPO_ROOT/bin/code-insiders" "$BIN_DIR/code-insiders"

TMP_SCRIPT="$(mktemp)"
cleanup() {
  rm -f "$TMP_SCRIPT"
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

echo "Installed nvim-opener shims to: $BIN_DIR"
echo "Installed URL handler app: $APP_PATH"
echo "Configured vscode-insiders:// handler bundle id: $BUNDLE_ID"
echo "If '$BIN_DIR' is not in PATH, add it before /opt/homebrew/bin so code-insiders resolves to this shim."
