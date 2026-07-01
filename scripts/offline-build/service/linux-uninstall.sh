#!/usr/bin/env bash
set -euo pipefail
systemctl --user stop reportcard.service 2>/dev/null || true
systemctl --user disable reportcard.service 2>/dev/null || true
rm -f "$HOME/.config/systemd/user/reportcard.service"
systemctl --user daemon-reload
echo "Uninstalled. Your data in the app-data folder is untouched."
