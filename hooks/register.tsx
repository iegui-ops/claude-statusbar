import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Cache, Limit, Measure } from '../types'

const dir = atom({ plugin: 'session-vitals', key: 'dir' } as const, '')
const branch = atom({ plugin: 'session-vitals', key: 'branch' } as const, '')
const cache = atom({ plugin: 'session-vitals', key: 'cache' } as const, null)
const measure = atom({ plugin: 'session-vitals', key: 'measure' } as const, null)
const ttlLeft = atom({ plugin: 'session-vitals', key: 'ttlLeft' } as const, null)

const LIMIT_LABEL: Record<string, string> = { five_hour: '5h', one_day: '1d', seven_day: '7d' }

export const color = (pct: number) => (pct >= 85 ? 'red' : pct >= 60 ? 'yellow' : 'green')

export const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n)

export const bar = (pct: number, width = 20) => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const mss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

const pad = (n: number) => String(n).padStart(2, '0')
export const resetLabel = (rl: Limit) => {
  if (!rl.resetsAt) return ''
  const d = new Date(rl.resetsAt)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (rl.kind !== 'seven_day') return `↺${hm}`
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  return `↺${day} ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${hm}`
}

async function refreshBranch($: EngineInterface) {
  const r = await $.process.run(['git', 'symbolic-ref', '--short', 'HEAD'], { timeoutMs: 2000 }).catch(() => null)
  const name = r?.exitCode === 0 ? r.stdout.trim() : ''
  await update($, branch, () => name)
}

// Writes the seconds left (null once expired); false when the countdown is over.
async function countdown($: EngineInterface, expiresAt: number) {
  const left = Math.ceil((expiresAt - (await $.clock.now())) / 1000)
  await update($, ttlLeft, () => (left > 0 ? left : null))
  return left > 0
}

export const register: Register = (on, options) => {
  const ttlMs = Number(options.ttlMinutes ?? 60) * 60_000
  // The prompt cache entry lives ttlMs from its last write or read; one timer ticks while it lives.
  let expiresAt = 0
  let tick: Timer | null = null

  on('session.start', async ($, e, next) => {
    const { context, rateLimits } = await $.session.usage()
    const m: Measure = { context, rateLimits }
    await update($, measure, () => m)
    const name = e.cwd.replace(/\/+$/, '').split('/').pop() || e.cwd
    await update($, dir, () => name)
    await refreshBranch($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const m: Measure = { context: e.context, rateLimits: e.rateLimits }
    await update($, measure, () => m)
    return next(e)
  })

  // Subagents keep their own cache prefixes: only main-thread responses count.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    if (e.agentId || !r.usage) return r
    const c: Cache = { read: r.usage.cache_read_input_tokens, created: r.usage.cache_creation_input_tokens, model: r.usage.model }
    await update($, cache, () => c)
    if (c.read + c.created > 0) {
      expiresAt = (await $.clock.now()) + ttlMs
      tick ??= $.clock.every(1000, () => {
        void countdown($, expiresAt).then(alive => {
          if (!alive) {
            tick?.cancel()
            tick = null
          }
        })
      })
      await countdown($, expiresAt)
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    await refreshBranch($)
    return next(e)
  })

  // No hook reaches the engine's statusLine slot; the hint line under the prompt is the nearest.
  // The engine's own hint (mode pills, shortcuts) stays, drawn under our two lines.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const hint = await next(e)
    const [d, br, c, m, ttl] = await Promise.all([read($, dir), read($, branch), read($, cache), read($, measure), read($, ttlLeft)])
    const pct = m?.context.percent ?? 0

    return (
      <Box flexDirection="column">
        <Text>
          <Text bold color="cyan">{d}</Text>
          {br ? <Text dimColor>{`  ⎇ ${br}`}</Text> : null}
          {c ? <Text dimColor>{`  ${c.model.replace(/^claude-/, '')}`}</Text> : null}
          {(m?.rateLimits ?? []).map(rl => (
            <Text>
              {`  ${LIMIT_LABEL[rl.kind] ?? rl.kind}:`}
              <Text color={color(rl.percentUsed)}>{`${Math.round(rl.percentUsed)}%`}</Text>
              <Text dimColor>{` ${resetLabel(rl)}`}</Text>
            </Text>
          ))}
        </Text>
        <Text>
          <Text color={color(pct)}>{`${bar(pct)} ${pct}%`}</Text>
          {m?.context.tokens ? <Text color="white">{` ${fmt(m.context.tokens)}/${fmt(m.context.window)}`}</Text> : null}
          {c ? <Text dimColor>{`  ${fmt(c.read)} cache↩  ${fmt(c.created)} cache↑`}</Text> : null}
          {ttl !== null ? <Text dimColor>{`  TTL ${mss(ttl)}`}</Text> : null}
        </Text>
        {hint}
      </Box>
    )
  })
}
