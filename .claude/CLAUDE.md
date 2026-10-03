# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Session Vitals** (`session-vitals`), a Claude Code mod (function-hook plugin): the repo root is the plugin folder and also a one-plugin marketplace (`iegui-ops`, `.claude-plugin/marketplace.json`). It draws two lines under the prompt with a live prompt cache TTL countdown. The previous Python statusline + TTL daemon lives on the `v1` tag; `main` is the mod only.

The plugin `name` is permanent (users install `session-vitals@iegui-ops`); change `displayName` instead. It is also the `plugin` key of every atom and the `PluginState` key in `types/index.d.ts`.

This file lives in `.claude/` because a `CLAUDE.md` at the plugin root makes `validate --strict` fail.

## Commands

```bash
claude plugin validate --strict .                            # marketplace.json
claude plugin validate --strict .claude-plugin/plugin.json   # manifest + module as the engine reads them; run after every hooks change
claude plugin test .                                         # tests/*.test.tsx against the engine
tsc -p .                                                     # needs .claude-plugin/types/, which the engine writes when it loads the mod
```

Bump `version` in `plugin.json` on every release, or `claude plugin update` keeps users on the old copy.

Loaded in every session through `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` (`env`), which watches the folder: saving a file reloads the mod at the end of the turn. A reload reruns `register` and `session.start`; `$.state` atoms survive, module variables (`expiresAt`, `tick`) start over.

## Architecture

All logic is `hooks/register.tsx`:

- **State:** atoms (`dir`, `branch`, `cache`, `measure`, `ttlLeft`) written from events and read by the render hook; each write redraws. Their types are the contract in `types/index.d.ts`, which must stay self-contained (no imports) and match every `$.state` key the module uses, or validate fails.
- **Data flow:** `session.start` seeds dir/branch/usage; `session.measure` pushes context and rate limits; `turn.step` (a streaming event, so the hook must be `async function*` with `yield* next(e)`) reads each main-thread response's cache usage and restarts the TTL; `turn.complete` re-reads the branch.
- **TTL:** cache read or write restarts it (using a cache entry refreshes it); responses with `agentId` (subagents) are ignored. Lifetime comes from the `ttlMinutes` userConfig option in `.claude-plugin/plugin.json`.
- **Rendering:** `ui.render` on `PromptHint`, wrapping `await next(e)` so the engine's hint line stays under our two lines. Mods cannot replace the built-in `statusLine` slot; `PromptHint` is the nearest.

## Gotchas the validator enforces

- A function that receives `$` must be declared at the top level of the module (not a closure inside `register`).
- Pure helpers (`color`, `bar`, `fmt`, `mss`, `resetLabel`) are exported for the tests; their output must keep matching the v1 Python formats.
- The test harness `$` has no `state` noun and nothing answers engine ops unless the test registers an `on` hook for them, so render tests read only atoms' defaults.
