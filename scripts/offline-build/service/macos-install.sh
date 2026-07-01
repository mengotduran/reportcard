#!/usr/bin/env bash
# UNVERIFIED — written from documented launchd conventions, not yet tested
# on real macOS hardware (none available while building this). Needs
# verification before being trusted; see DEPLOYMENT_ARCHITECTURE.md
# section 15. Run once, from inside the release/ folder:
#   ./macos-install.sh
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER="$RELEASE_DIR/reportcard-launcher"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/com.reportcardsystem.server.plist"

if [ ! -x "$LAUNCHER" ]; then
  echo "Expected $LAUNCHER to exist and be executable — run this script from inside the release/ folder." >&2
  exit 1
fi

mkdir -p "$PLIST_DIR"
cat > "$PLIST_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.reportcardsystem.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>$LAUNCHER</string>
    <string>--service</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/ReportCardSystem/launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/ReportCardSystem/launchd.log</string>
</dict>
</plist>
EOF

mkdir -p "$HOME/Library/Logs/ReportCardSystem"
launchctl unload "$PLIST_FILE" 2>/dev/null || true
launchctl load -w "$PLIST_FILE"

echo "Installed and started. Check with: launchctl list | grep reportcardsystem"
