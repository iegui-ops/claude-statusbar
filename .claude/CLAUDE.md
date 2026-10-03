# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Session Vitals** (`session-vitals`), a Claude Code mod (function-hook plugin): the repo root is the plugin folder and also a one-plugin marketplace (`iegui-ops`, `.claude-plugin/marketplace.json`). It draws two lines under the prompt with a live prompt cache TTL countdown. The previous Python statusline + TTL daemon lives on the `v1` tag; `main` is the mod only.

The plugin `name` is permanent (users install `session-vitals@iegui-ops`); change `displayName` instead.

## Anthropic directory constraints

The plugin is submitted to Anthropic's directory, whose portal checks more than `claude plugin validate --strict`:

- **No `types` field in `plugin.json`:** the directory refuses it, and Claude Code needs it for any `$.state` use. So the mod keeps its data in module variables and redraws with `$.ui.invalidate('ui.render')`. Don't reintroduce `$.state` / atoms.
- **No `options` in `userConfig`:** each option has only `type`, `title`, `description`, `default`. Validate values in code (see `ttlMinutes()`).
- **README must say what the mod sends and which programs it runs** ("Data and programs" section). Update it when adding a `$.http`, `$.model` or `$.process` call.
- **`LICENSE` (MIT) and `.claude-plugin/icon.png`** (square PNG, 512 to 2048 px, under 2 MB). The listing icon is fixed the first time the plugin is saved in the portal.
- This file lives in `.claude/` because a `CLAUDE.md` at the plugin root makes `validate --strict` fail.

## Commands

```bash
claude plugin validate --strict .                            # marketplace.json
claude plugin validate --strict .claude-plugin/plugin.json   # manifest + module as the engine reads them; run after every hooks change
claude plugin test .                                         # tests/*.test.tsx against the engine
tsc -p .                                                     # needs .claude-plugin/types/, which the engine writes when it loads the mod
```

Bump `version` in `plugin.json` on every release, or `claude plugin update` keeps users on the old copy.

Loaded in every session through `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` (`env`), which watches the folder: saving a file reloads the mod at the end of the turn. A reload reruns `register` and `session.start`; module variables (the `s` object, `expiresAt`, `tick`) start over.

## Architecture

All logic is `hooks/register.tsx`:

- **State:** one module object `s` written from events and read by the render hook; every write is followed by `$.ui.invalidate('ui.render')`.
- **Data flow:** `session.start` seeds dir/branch/usage; `session.measure` pushes context and rate limits; `turn.step` (a streaming event, so the hook must be `async function*` with `yield* next(e)`) reads each main-thread response's cache usage and restarts the TTL; `turn.complete` re-reads the branch.
- **TTL:** cache read or write restarts it (using a cache entry refreshes it); responses with `agentId` (subagents) are ignored. Lifetime comes from the `ttlMinutes` userConfig option.
- **Rendering:** `ui.render` on `PromptHint`, wrapping `await next(e)` so the engine's hint line stays under our two lines and keeps updating. Mods cannot replace the built-in `statusLine` slot; `PromptHint` is the nearest.

## Gotchas the validator enforces

- A function that receives `$` must be declared at the top level of the module (not a closure inside `register`).
- Pure helpers (`color`, `bar`, `fmt`, `mss`, `resetLabel`, `ttlMinutes`) are exported for the tests; the formatting ones must keep matching the v1 Python formats.
- Nothing answers engine ops in a test unless the test registers an `on` hook for them, so the render test draws the empty state.
