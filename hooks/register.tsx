import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

type Limit = Pick<SessionRateLimit, 'kind' | 'percentUsed' | 'resetsAt'>

// What the bar shows. Module variables, not $.state: the directory refuses the manifest
// `types` field a $.state contract needs. Each change asks the engine to redraw.
const s = {
  dir: '',
  branch: '',
  cache: null as { read: number; created: number; model: string } | null,
  context: null as SessionContextUsage | null,
  limits: [] as readonly Limit[],
  ttlLeft: null as number | null,
}

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

// A missing, zero, negative or non-numeric setting falls back to the 1-hour cache.
export const ttlMinutes = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 60
}

// The branch a HEAD file names, or the short hash of a detached HEAD; '' for anything else.
export const branchFromHead = (head: string) => {
  const t = head.trim()
  const ref = /^ref: refs\/heads\/(.+)$/.exec(t)
  if (ref) return ref[1] ?? ''
  return /^[0-9a-f]{40,64}$/.test(t) ? t.slice(0, 7) : ''
}

// A worktree's `.git` is a file, `gitdir: <path>`, relative to the folder holding it.
export const gitDirFromFile = (text: string, dir: string) => {
  const m = /^gitdir: (.+)$/m.exec(text)
  if (!m?.[1]) return ''
  const p = m[1].trim()
  return /^([\\/]|[A-Za-z]:)/.test(p) ? p : `${dir}/${p}`
}

// '' once there is no folder above (`/home` on Unix, `C:` on Windows), which ends the walk.
export const parentDir = (dir: string) => {
  const up = dir.replace(/[\\/][^\\/]*[\\/]?$/, '')
  return up === dir ? '' : up
}

// Reads the branch from .git/HEAD, walking up from the session's folder as git does.
// No git process: reading two small files is all it takes.
async function refreshBranch($: EngineInterface) {
  let branch = ''
  for (let dir = (await $.session.cwd()).replace(/[\\/]+$/, ''); dir; dir = parentDir(dir)) {
    const dotGit = `${dir}/.git`
    if (!(await $.fs.exists(dotGit))) continue
    const head = await $.fs.read(`${dotGit}/HEAD`).catch(async () => {
      const gitDir = gitDirFromFile(await $.fs.read(dotGit), dir)
      return gitDir ? $.fs.read(`${gitDir}/HEAD`) : ''
    }).catch(() => '')
    branch = branchFromHead(head)
    break
  }
  s.branch = branch
  $.ui.invalidate('ui.render')
}

// Sets the seconds left (null once expired); false when the countdown is over.
async function countdown($: EngineInterface, expiresAt: number) {
  const left = Math.ceil((expiresAt - (await $.clock.now())) / 1000)
  s.ttlLeft = left > 0 ? left : null
  $.ui.invalidate('ui.render')
  return left > 0
}

export const register: Register = (on, options) => {
  const ttlMs = ttlMinutes(options.ttlMinutes) * 60_000
  // The prompt cache entry lives ttlMs from its last write or read; one timer ticks while it lives.
  let expiresAt = 0
  let tick: Timer | null = null

  on('session.start', async ($, e, next) => {
    const { context, rateLimits } = await $.session.usage()
    s.context = context
    s.limits = rateLimits
    s.dir = e.cwd.replace(/\/+$/, '').split('/').pop() || e.cwd
    await refreshBranch($)
    return next(e)
  })

  on('session.measure', ($, e, next) => {
    s.context = e.context
    s.limits = e.rateLimits
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // Subagents keep their own cache prefixes: only main-thread responses count.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    if (e.agentId || !r.usage) return r
    s.cache = { read: r.usage.cache_read_input_tokens, created: r.usage.cache_creation_input_tokens, model: r.usage.model }
    $.ui.invalidate('ui.render')
    if (s.cache.read + s.cache.created > 0) {
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
    const { dir, branch, cache: c, context, limits, ttlLeft } = s
    const pct = context?.percent ?? 0

    return (
      <Box flexDirection="column">
        <Text>
          <Text bold color="cyan">{dir}</Text>
          {branch ? <Text dimColor>{`  ⎇ ${branch}`}</Text> : null}
          {c ? <Text dimColor>{`  ${c.model.replace(/^claude-/, '')}`}</Text> : null}
          {limits.map(rl => (
            <Text>
              {`  ${LIMIT_LABEL[rl.kind] ?? rl.kind}:`}
              <Text color={color(rl.percentUsed)}>{`${Math.round(rl.percentUsed)}%`}</Text>
              <Text dimColor>{` ${resetLabel(rl)}`}</Text>
            </Text>
          ))}
        </Text>
        <Text>
          <Text color={color(pct)}>{`${bar(pct)} ${pct}%`}</Text>
          {context?.tokens ? <Text color="white">{` ${fmt(context.tokens)}/${fmt(context.window)}`}</Text> : null}
          {c ? <Text dimColor>{`  ${fmt(c.read)} cache↩  ${fmt(c.created)} cache↑`}</Text> : null}
          {ttlLeft !== null ? <Text dimColor>{`  TTL ${mss(ttlLeft)}`}</Text> : null}
        </Text>
        {hint}
      </Box>
    )
  })
}
