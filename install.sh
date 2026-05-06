#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing Claude Code statusbar..."

# Destinations
CLAUDE_DIR="$HOME/.claude"
SYSTEMD_DIR="$HOME/.config/systemd/user"

mkdir -p "$CLAUDE_DIR" "$SYSTEMD_DIR"

# Copy files
cp "$SCRIPT_DIR/statusline.py"      "$CLAUDE_DIR/statusline.py"
cp "$SCRIPT_DIR/ttl-daemon.py"      "$CLAUDE_DIR/ttl-daemon.py"
cp "$SCRIPT_DIR/claude-ttl.service" "$SYSTEMD_DIR/claude-ttl.service"

echo "  ✓ statusline.py    → $CLAUDE_DIR/"
echo "  ✓ ttl-daemon.py    → $CLAUDE_DIR/"
echo "  ✓ claude-ttl.service → $SYSTEMD_DIR/"

# Enable and start the daemon
systemctl --user daemon-reload
systemctl --user enable --now claude-ttl.service
echo "  ✓ claude-ttl.service enabled and started"

# Check if statusLine is already configured in settings.json
SETTINGS="$CLAUDE_DIR/settings.json"
if [ -f "$SETTINGS" ]; then
    if grep -q '"statusLine"' "$SETTINGS"; then
        echo ""
        echo "  ℹ  statusLine already configured in settings.json — skipping"
    else
        echo ""
        echo "  ⚠  Add this to $SETTINGS manually:"
        echo '     "statusLine": {'
        echo '       "type": "command",'
        echo '       "command": "python3 ~/.claude/statusline.py"'
        echo '     }'
    fi
else
    echo ""
    echo "  ⚠  $SETTINGS not found. Add statusLine config manually (see README)."
fi

echo ""
echo "Done."
