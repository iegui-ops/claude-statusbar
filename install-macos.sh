#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST_NAME="com.claude.ttl.plist"
PLIST_DEST="$LAUNCH_AGENTS/$PLIST_NAME"

echo "Installing Claude Code statusbar (macOS)..."

mkdir -p "$CLAUDE_DIR" "$LAUNCH_AGENTS"

# Copy scripts
cp "$SCRIPT_DIR/statusline.py" "$CLAUDE_DIR/statusline.py"
cp "$SCRIPT_DIR/ttl-daemon.py" "$CLAUDE_DIR/ttl-daemon.py"
echo "  ✓ statusline.py  → $CLAUDE_DIR/"
echo "  ✓ ttl-daemon.py  → $CLAUDE_DIR/"

# Patch plist with real home dir and write to LaunchAgents
sed "s|/Users/USERNAME|$HOME|g" "$SCRIPT_DIR/$PLIST_NAME" > "$PLIST_DEST"
echo "  ✓ $PLIST_NAME → $LAUNCH_AGENTS/"

# Load the agent
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"
echo "  ✓ launchd agent loaded and started"

# Check statusLine config
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
