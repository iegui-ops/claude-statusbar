# Session Vitals

Your Claude Code session at a glance. A Claude Code **mod** (a plugin of function hooks) that draws two lines under the prompt: context usage, model, git branch, rate limits, prompt cache stats and a live prompt cache TTL countdown. It also adds `/cache-ttl`, to switch the prompt cache between 5 minutes and 1 hour mid-session.

https://github.com/user-attachments/assets/938b09bf-3839-4848-b7fb-b58726b43734

**Line 1:** directory · git branch · model · each rate-limit window Claude Code reports (`5h`, `1d`, `7d`) with its reset time
**Line 2:** context bar · usage % · tokens used/window · cache read · cache written · prompt cache TTL countdown

Claude Code's own hint line (mode pills, shortcuts) stays, drawn right under it.

> Looking for the old Python statusline + TTL daemon? It lives on the [`v1` tag](../../tree/v1). See [Migrating from v1](#migrating-from-v1).

## Requirements

- Claude Code **v2.1.287 or later** (the first version with mods). Tested with **v2.1.289**. `/cache-ttl` needs a version that reads `CLAUDE_CODE_PROMPT_CACHE_TTL` (v2.1.289 does); on an older one the command runs but the TTL does not change. The mods API is early access and may change between releases.
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
| `ttlMinutes` | number | `60` | Countdown length, in minutes, when the cache TTL is left automatic (see below). Use `60` on a Claude subscription, `5` on an API key, Bedrock, Vertex or Foundry. A missing, zero or invalid value falls back to `60`. |
| `expiryTo5m` | boolean | `false` | When the countdown reaches zero, the first turn after it uses the 5-minute cache; then the TTL you had comes back (see below). |

Change them in `/config` (Config tab): type `cache` to filter, select the row ending in `· session-vitals` and press Enter or Space. The mod reloads with the new value. They are saved under `pluginConfigs` in `~/.claude/settings.json`.

```
  Automatic prompt cache TTL (minutes) · session-vitals          60 ›
❯ First turn after the cache expires uses the 5-minute cache · session-vitals  true
```

### Prompt cache TTL

The countdown follows the TTL Claude Code actually uses, resolved as Claude Code does on each request: `FORCE_PROMPT_CACHING_5M`, then the `CLAUDE_CODE_PROMPT_CACHE_TTL` variable, then the `promptCacheTtl` setting (`"5m"` or `"1h"`). With none set the TTL is automatic and the countdown uses `ttlMinutes`.

#### `/cache-ttl`

| Command | What it does |
|---------|--------------|
| `/cache-ttl` | Shows the TTL in use, where it comes from and how long the current cache entry has left. |
| `/cache-ttl 5m` | Uses the 5-minute cache for the rest of the session. |
| `/cache-ttl 1h` | Uses the 1-hour cache for the rest of the session. |
| `/cache-ttl auto` | Goes back to the `promptCacheTtl` setting, or to automatic when there is none. |

```
❯ /cache-ttl 1h
  ⎿  session-vitals: Prompt cache TTL: 60 min (/cache-ttl or CLAUDE_CODE_PROMPT_CACHE_TTL); cache expires in 4:55. The new TTL applies from the next request.
```

How it works: it sets (or, with `auto`, unsets) `CLAUDE_CODE_PROMPT_CACHE_TTL` in Claude Code's own process. Claude Code reads that variable on every request, so no restart is needed.

- **From the next request.** The cache entry already written keeps its lifetime (the `4:55` above) until the next request writes it again with the new TTL; then the countdown jumps.
- **This session only.** It is gone when the session ends. For a permanent choice, set `"promptCacheTtl": "5m"` or `"1h"` in `~/.claude/settings.json`.
- **Main conversation only.** Subagents and background requests follow `subagentPromptCacheTtl` (5 minutes by default).
- **Inherited by child processes.** Bash commands started afterwards see the variable, so a `claude` launched from them starts with that TTL.
- **Cost.** The command itself never calls the model; its output line goes into the transcript like any local command's (`/cost`, `/context`), a few dozen tokens in the next prompt. The TTL is what changes the bill: 1-hour cache writes cost more than 5-minute ones, but a 5-minute cache is written again in full after any pause longer than 5 minutes.

#### Switch to 5 minutes when the cache expires

Off by default. To turn it on, open `/config`, find **First turn after the cache expires uses the 5-minute cache · session-vitals** and press Enter so it reads `true`.

With `expiryTo5m` on, when the countdown reaches zero the mod remembers the TTL in use and sets `5m`, unless the TTL is already 5 minutes. A cache that expired means you were away longer than its TTL, and the next request writes the whole cache again: a 5-minute write costs 1.25x the input price against 2x for a 1-hour one. That first turn (every request in it, tool calls included) uses 5 minutes; when it ends the mod puts back the TTL it remembered (or unsets the variable, if it was unset), so your next prompt uses your usual TTL again. Running `/cache-ttl 5m`, `1h` or `auto` in between cancels the restore. The switch only happens while the session is open with the countdown running.

After the mod reloads (an update, or a change to its config) the countdown is empty until the next model response; the TTL set with `/cache-ttl` is kept.

## How it works

Everything is in `hooks/register.tsx`:

- **Context, rate limits:** read from the session (`$.session.usage()` at start, then the `session.measure` event whenever a figure moves).
- **Cache stats and TTL:** every main-thread model response (`turn.step`) reports its cache read and cache write tokens. Any response that read or wrote the cache restarts the countdown, since using a cache entry refreshes its lifetime. Subagents keep their own cache, so they are ignored.
- **Countdown:** a 1-second timer (`$.clock.every`) inside the mod, cancelled once the cache expires.
- **Branch:** read from `.git/HEAD`, found by walking up from the session's folder as git does (worktrees and detached HEADs included), at session start and after each turn. No `git` process is started.
- **Drawing:** a `ui.render` hook on `PromptHint` (the hint line under the prompt) draws the two lines and keeps the engine's own hint under them. A mod cannot take over the slot of the built-in `statusLine` command; this is the nearest place.

- **`/cache-ttl`:** a slash command the mod registers (`$.command.register`) and answers itself (`command.run`), without the model.

**Token cost: zero.** The mod never calls the model, never changes the system prompt or the messages; it only reads figures Claude Code already has. The one exception is the output line of `/cache-ttl`, which goes into the transcript when you run it.

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
| `$.env.get(name)` | Reads `CLAUDE_CODE_PROMPT_CACHE_TTL` and `FORCE_PROMPT_CACHING_5M`, to know the cache TTL. | Reads Claude Code's own environment; sends nothing. |
| `$.env.set(name, value)` | Sets or unsets `CLAUDE_CODE_PROMPT_CACHE_TTL`, only when you run `/cache-ttl`, or (with `expiryTo5m` on) to `5m` when the countdown reaches zero and back to what it was when the next turn ends. | Changes Claude Code's own environment for this session; sends nothing. |
| `$.settings.read()` | Reads the `promptCacheTtl` setting, to know the cache TTL. Nothing else is used. | Local settings read; sends nothing. |
| `$.command.register(spec)` | Adds the `/cache-ttl` slash command. | Local only. |
| `$.ui.resolve(e)` | Gets the text elements (`Box`, `Text`) to draw the two lines with. | Local drawing only. |
| `$.ui.invalidate('ui.render')` | Asks Claude Code to redraw the bar after a figure changes. | Local drawing only. |

The events it listens to (`session.start`, `session.measure`, `turn.step`, `turn.complete`) are observed and passed on unchanged: it never alters prompts, tool calls, model requests or responses. It changes two things: the drawing of the hint line under the prompt (`ui.render` on `PromptHint`), where it adds its two lines above Claude Code's own hint, and, only when you run `/cache-ttl` (`command.run`), the prompt cache TTL of the session.

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
