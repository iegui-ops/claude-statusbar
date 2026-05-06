# Claude Code Statusbar

Two-line status display for Claude Code showing context usage, model, git branch, rate limits, and Anthropic prompt cache TTL countdown.

## What it shows

```
ansible  ⎇ main  Sonnet 4.6  5h:29% ↺12:00  7d:17% ↺21:20
████████░░░░░░░░░░░░ 31%  62.9k/200.0k  59.8k cache↩  745 cache↑  TTL 4:32
```

**Line 1:** directory · git branch · model · 5-hour token usage · 7-day token usage  
**Line 2:** context bar · usage % · tokens used/total · cache read · cache created · prompt cache TTL countdown

## Files

| File | Purpose |
|------|---------|
| `statusline.py` | Main statusbar script called by Claude Code |
| `ttl-daemon.py` | Background daemon that writes TTL every second |
| `claude-ttl.service` | systemd unit (Linux) |
| `com.claude.ttl.plist` | launchd agent (macOS) |

## Requirements

- Python 3.7+
- `git` in PATH

## Installation

**Linux:**
```bash
chmod +x install.sh
./install.sh
```

**macOS:**
```bash
chmod +x install-macos.sh
./install-macos.sh
```

Then add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "python3 ~/.claude/statusline.py"
  }
}
```

## How it works

**Statusline** (`statusline.py`) is called by Claude Code on each event. It reads:
- Session data from stdin (JSON provided by Claude Code)
- Git branch via `git symbolic-ref --short HEAD`
- TTL from `~/.claude/statusline-ttl` (written by the daemon)

A 5-second performance cache avoids redundant rebuilds. The cache is skipped when TTL is active so the countdown stays current.

**Daemon** (`ttl-daemon.py`) runs continuously as a systemd user service. Every second it:
1. Scans `~/.claude/statusline-cache/apicache_*.json` for the most recent cache creation timestamp
2. Computes remaining TTL (5 minutes from last creation)
3. Writes `M:SS` to `~/.claude/statusline-ttl`, or deletes it when expired

This separation means the countdown ticks in real time even when Claude Code is idle between turns.

## Managing the daemon

**Linux:**
```bash
systemctl --user status claude-ttl
systemctl --user restart claude-ttl
systemctl --user stop claude-ttl
journalctl --user -u claude-ttl -f   # live logs
```

**macOS:**
```bash
launchctl list | grep claude
launchctl unload ~/Library/LaunchAgents/com.claude.ttl.plist
launchctl load   ~/Library/LaunchAgents/com.claude.ttl.plist
tail -f /tmp/claude-ttl.log          # live logs
```
