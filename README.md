# Claude Code Statusbar

A Claude Code **mod** (a plugin of function hooks) that draws a two-line statusbar under the prompt: context usage, model, git branch, rate limits, prompt cache stats and a live prompt cache TTL countdown.

```
statusbar  ⎇ main  opus-5-5  5h:47% ↺14:30  7d:39% ↺Wed 07/10 22:00
██░░░░░░░░░░░░░░░░░░ 11% 108.7k/1.0M  107.3k cache↩  1.4k cache↑  TTL 58:12
? for shortcuts
```

**Line 1:** directory · git branch · model · each rate-limit window Claude Code reports (`5h`, `1d`, `7d`) with its reset time
**Line 2:** context bar · usage % · tokens used/window · cache read · cache written · prompt cache TTL countdown

Claude Code's own hint line (mode pills, shortcuts) stays, drawn right under it.

> Looking for the old Python statusline + TTL daemon? It lives on the [`v1` tag](../../tree/v1). See [Migrating from v1](#migrating-from-v1).

## Requirements

- A Claude Code version with mods (function-hook plugins). The plugin API is early access and may change between releases.
- `git` in PATH (for the branch).

No Python, no daemon, no service: everything runs inside the Claude Code session, on any OS Claude Code runs on.

## Install

1. Clone the repo anywhere:

   ```bash
   git clone https://github.com/iegui-ops/claude-statusbar.git ~/src/claude-statusbar
   ```

2. Load it in every session by adding the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`:

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "~/src/claude-statusbar"
     }
   }
   ```

   Several folders are separated with `:` (`;` on Windows). To try it once without touching settings: `claude --plugin-dir ~/src/claude-statusbar`.

3. Start a new Claude Code session. If you still have a `statusLine` entry in `settings.json`, remove it, or you will see two statusbars.

Updating is `git pull`; an interactive session watches the folder and reloads the mod when its files change.

## Configuration

| Option | Values | Default | What it does |
|--------|--------|---------|--------------|
| `ttlMinutes` | `5`, `60` | `60` | Prompt cache lifetime the countdown uses. `5` is the API's default cache, `60` the 1-hour cache Claude Code uses on subscriptions. |

Change it from the plugin's row in Claude Code's config menu; the mod reloads with the new value.

## How it works

Everything is in `hooks/register.tsx`:

- **Context, rate limits:** read from the session (`$.session.usage()` at start, then the `session.measure` event whenever a figure moves).
- **Cache stats and TTL:** every main-thread model response (`turn.step`) reports its cache read and cache write tokens. Any response that read or wrote the cache restarts the countdown, since using a cache entry refreshes its lifetime. Subagents keep their own cache, so they are ignored.
- **Countdown:** a 1-second timer (`$.clock.every`) inside the mod, cancelled once the cache expires.
- **Branch:** `git symbolic-ref --short HEAD`, re-read at session start and after each turn.
- **Drawing:** a `ui.render` hook on `PromptHint` (the hint line under the prompt) draws the two lines and keeps the engine's own hint under them. A mod cannot take over the slot of the built-in `statusLine` command; this is the nearest place.

**Token cost: zero.** The mod never calls the model, never changes the system prompt or the messages; it only reads figures Claude Code already has.

## Migrating from v1

v1 was a Python `statusLine` command plus a background daemon. To remove it:

**Linux:**
```bash
systemctl --user disable --now claude-ttl
rm ~/.config/systemd/user/claude-ttl.service
systemctl --user daemon-reload
```

**macOS:**
```bash
launchctl unload ~/Library/LaunchAgents/com.claude.ttl.plist
rm ~/Library/LaunchAgents/com.claude.ttl.plist
```

**Both:**
```bash
rm -rf ~/.claude/statusline.py ~/.claude/ttl-daemon.py ~/.claude/statusline-cache ~/.claude/statusline-ttl
```

Then delete the `statusLine` block from `~/.claude/settings.json` and follow [Install](#install).

To keep using v1 (older Claude Code, or no mods): `git checkout v1` and follow that version's README.

## Development

```bash
claude plugin validate .   # what the module hooks and calls, and anything the engine would refuse
claude plugin test .       # runs tests/*.test.tsx against the engine
tsc -p .                   # type-check (the engine writes .claude-plugin/types/ once it has loaded the mod)
```
