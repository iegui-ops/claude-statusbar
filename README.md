# Session Vitals

Your Claude Code session at a glance. A Claude Code **mod** (a plugin of function hooks) that draws two lines under the prompt: context usage, model, git branch, rate limits, prompt cache stats and a live prompt cache TTL countdown.

https://github.com/user-attachments/assets/e90d3ce6-5dd2-4e58-aefd-62f5bc15fb9d

**Line 1:** directory · git branch · model · each rate-limit window Claude Code reports (`5h`, `1d`, `7d`) with its reset time
**Line 2:** context bar · usage % · tokens used/window · cache read · cache written · prompt cache TTL countdown

Claude Code's own hint line (mode pills, shortcuts) stays, drawn right under it.

> Looking for the old Python statusline + TTL daemon? It lives on the [`v1` tag](../../tree/v1). See [Migrating from v1](#migrating-from-v1).

## Requirements

- Claude Code **v2.1.287 or later** (the first version with mods). Tested with **v2.1.288**. The mods API is early access and may change between releases.
No Python, no `git` binary, no daemon, no service: everything runs inside the Claude Code session, on any OS Claude Code runs on.

## Install

From your shell:

```bash
claude plugin marketplace add iegui-ops/claude-statusbar
claude plugin install session-vitals@iegui-ops
```

Or both at once from inside a session (Claude Code v2.1.275+):

```
/plugin install session-vitals --marketplace iegui-ops/claude-statusbar
```

Start a new session. If you still have a `statusLine` entry in `~/.claude/settings.json`, remove it, or you will see two statusbars.

**Updates:** `claude plugin update session-vitals@iegui-ops`, or turn on auto-update for the `iegui-ops` marketplace in `/plugin`.

**Try it without installing:** clone the repo and run `claude --plugin-dir ./claude-statusbar` for one session.

## Configuration

| Option | Type | Default | What it does |
|--------|------|---------|--------------|
| `ttlMinutes` | number | `60` | Prompt cache lifetime the countdown uses, in minutes. Use `5` for the API's default cache, `60` for the 1-hour cache Claude Code uses on subscriptions. A missing, zero or invalid value falls back to `60`. |

Change it from the plugin's row in Claude Code's config menu; the mod reloads with the new value.

## How it works

Everything is in `hooks/register.tsx`:

- **Context, rate limits:** read from the session (`$.session.usage()` at start, then the `session.measure` event whenever a figure moves).
- **Cache stats and TTL:** every main-thread model response (`turn.step`) reports its cache read and cache write tokens. Any response that read or wrote the cache restarts the countdown, since using a cache entry refreshes its lifetime. Subagents keep their own cache, so they are ignored.
- **Countdown:** a 1-second timer (`$.clock.every`) inside the mod, cancelled once the cache expires.
- **Branch:** read from `.git/HEAD`, found by walking up from the session's folder as git does (worktrees and detached HEADs included), at session start and after each turn. No `git` process is started.
- **Drawing:** a `ui.render` hook on `PromptHint` (the hint line under the prompt) draws the two lines and keeps the engine's own hint under them. A mod cannot take over the slot of the built-in `statusLine` command; this is the nearest place.

**Token cost: zero.** The mod never calls the model, never changes the system prompt or the messages; it only reads figures Claude Code already has.

## Data and programs

**What the mod sends, and where: nothing.** It makes no network requests (no `$.http`), never calls a model (no `$.model`), writes no files and keeps nothing across sessions. Everything it shows is read from the running Claude Code session and kept in memory until the session ends.

**Programs it runs: none.** It starts no process (no `$.process`).

**Files it reads: only git's HEAD.** To show the current branch it looks for a `.git` entry in the session's folder and each folder above it, and reads the first one's `HEAD` file (`ref: refs/heads/main`). In a git worktree `.git` is a small file naming the real git folder, so it reads that file and then the `HEAD` it points to. This happens once when the session starts and once after each turn. Outside a git repository nothing is read and the branch is left out. It never writes a file.

### Every mods API call it makes

This is the full list (`claude plugin validate .claude-plugin/plugin.json` prints the same set under `calls:`). None of them sends data off the machine.

| Call | What it does here | Data in / out |
|------|-------------------|---------------|
| `$.session.usage()` | Reads the context window fill and rate-limit windows once, at session start. | Reads figures Claude Code already has; sends nothing. |
| `$.clock.now()` | Reads the current time, to compute when the prompt cache expires. | Local clock only. |
| `$.clock.every(1000, fn)` | Ticks once a second while the prompt cache is alive, to update the TTL countdown; cancelled when it expires. | Local timer only. |
| `$.session.cwd()` | Gets the session's folder, where the search for `.git` starts. | Reads a path Claude Code already has; sends nothing. |
| `$.fs.exists(path)` | Checks whether a folder has a `.git` entry, walking up from the session's folder. | Local file check only. |
| `$.fs.read(path)` | Reads git's `HEAD` file (and, in a worktree, the `.git` file pointing to it) to get the branch name. | Local file read; the branch name is only displayed. |
| `$.ui.resolve(e)` | Gets the text elements (`Box`, `Text`) to draw the two lines with. | Local drawing only. |
| `$.ui.invalidate('ui.render')` | Asks Claude Code to redraw the bar after a figure changes. | Local drawing only. |

The events it listens to (`session.start`, `session.measure`, `turn.step`, `turn.complete`) are observed and passed on unchanged: it never alters prompts, tool calls, model requests or responses. The only thing it changes is the drawing of the hint line under the prompt (`ui.render` on `PromptHint`), where it adds its two lines above Claude Code's own hint.

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

Work on a clone loaded with `claude --plugin-dir .` (or listed in `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`), not on an installed copy: the folder is watched and the mod reloads at the end of each turn that changes it. Uninstall the marketplace copy first, or both will draw.

```bash
claude plugin validate --strict .                            # the marketplace manifest
claude plugin validate --strict .claude-plugin/plugin.json   # the plugin: what it hooks and calls, anything the engine would refuse
claude plugin test .                                         # tests/*.test.tsx against the engine
tsc -p .                                                     # type-check (the engine writes .claude-plugin/types/ once it has loaded the mod)
```

Bump `version` in `.claude-plugin/plugin.json` on every release, or `claude plugin update` keeps users on the old copy.

## License

MIT, see [LICENSE](LICENSE).
