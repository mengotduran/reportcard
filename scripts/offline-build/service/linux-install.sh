#!/usr/bin/env bash
# Registers the offline server as a systemd USER service that starts at
# boot, before any login (via `loginctl enable-linger`) — important for a
# shared school office PC that may sit at the lock screen. Run this once,
# from inside the release/ folder: ./install-service-linux.sh
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER="$RELEASE_DIR/reportcard-launcher"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/reportcard.service"

if [ ! -x "$LAUNCHER" ]; then
  echo "Expected $LAUNCHER to exist and be executable — run this script from inside the release/ folder." >&2
  exit 1
fi

mkdir -p "$UNIT_DIR"
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=ReportCard System (offline server)
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
ExecStart=$LAUNCHER --service
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable reportcard.service
# restart, not start: this script is also how an UPDATE gets applied — the
# release files get overwritten in place (Linux allows that even while the
# old binary is still running, unlike Windows) but `start` on an
# already-running unit is a no-op, so the old process would keep running
# old code indefinitely. `restart` correctly starts it whether currently
# stopped or running, and picks up whatever migrations the new binary adds
# via the normal startup migration runner. Data (the SQLite file + uploads)
# lives outside the release dir entirely, untouched by any of this.
systemctl --user restart reportcard.service

# Without this, a USER service only runs while that user is logged in —
# enable-linger makes systemd start the user's services at boot regardless.
loginctl enable-linger "$USER" || echo "Warning: could not enable-linger (may need to run as the actual logged-in user, not root)." >&2

echo "Installed and started. Check status with: systemctl --user status reportcard.service"
