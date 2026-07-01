#!/usr/bin/env bash
# UNVERIFIED — see macos-install.sh.
set -euo pipefail
PLIST_FILE="$HOME/Library/LaunchAgents/com.reportcardsystem.server.plist"
launchctl unload "$PLIST_FILE" 2>/dev/null || true
rm -f "$PLIST_FILE"
echo "Uninstalled. Your data is untouched."
