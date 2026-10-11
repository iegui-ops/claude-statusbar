import type { EngineInterface, Register, SessionContextBreakdown, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

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
  // /context's categories (system prompt, tools, messages...), for the coloured bar and legend.
  rows: [] as { name: string; tokens: number; color: string }[],
  compactAt: undefined as number | undefined,
  max: 0,
  breakdown: null as SessionContextBreakdown | null,
  // What the detail pane shows: the category clicked in the legend and what fills it.
  detail: null as { title: string; lines: string[] } | null,
}

const LIMIT_LABEL: Record<string, string> = { five_hour: '5h', one_day: '1d', seven_day: '7d' }

export const color = (pct: number) => (pct >= 85 ? 'red' : pct >= 60 ? 'yellow' : 'green')

export const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n)

export const bar = (pct: number, width = 20) => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

// The context bar split by category: cells per used row (at least 1 for any row with tokens),
// then free cells with a `▏` where auto-compaction runs. Returns [text, colour] pieces.
export const ctxBar = (rows: { tokens: number; color: string }[], max: number, compactAt: number | undefined, width = 20) => {
  const out: [string, string | undefined][] = []
  let used = 0
  for (const r of rows) {
    const n = Math.min(width - used, r.tokens > 0 ? Math.max(1, Math.round((r.tokens / max) * width)) : 0)
    if (n > 0) out.push(['█'.repeat(n), r.color])
    used += n
  }
  const rest = width - used
  const mark = compactAt ? Math.round((compactAt / max) * width) - used : -1
  if (mark < 0 || mark >= rest) return [...out, ['░'.repeat(rest), undefined]] as typeof out
  return [...out, ['░'.repeat(mark), undefined], ['▏', 'warning'], ['░'.repeat(rest - mark - 1), undefined]] as typeof out
}

// ponytail: "summary" = local estimate, free; "full" counts with the token-count API
async function refreshBreakdown($: EngineInterface) {
  const b = (await $.session.usage({ breakdown: 'summary' })).context.breakdown
  if (!b) return
  s.rows = b.categories.filter(c => c.kind === 'used').map(c => ({ name: c.name, tokens: c.tokens, color: c.color }))
  s.breakdown = b
  s.max = b.rawMaxTokens
  s.compactAt = b.isAutoCompactEnabled ? b.autoCompactThreshold : undefined
  $.ui.invalidate('ui.render')
}

const DETAIL = 'context-detail'
const byTokens = <T extends { tokens: number }>(xs: readonly T[]) => [...xs].sort((a, b) => b.tokens - a.tokens)

// What fills a legend category, from the breakdown alone; null when it needs the engine.
export const breakdownLines = (name: string, b: SessionContextBreakdown): string[] | null => {
  switch (name.toLowerCase()) {
    case 'skills': {
      const sk = b.skills
      if (!sk) return []
      return [
        `${sk.includedSkills} of ${sk.totalSkills} skills listed, ${fmt(sk.tokens)} tokens`,
        ...byTokens(sk.skillFrontmatter).map(k => `${fmt(k.tokens).padStart(6)}  ${k.name}  (${k.pluginName ?? k.source})`),
      ]
    }
    case 'mcp tools':
      return byTokens(b.mcpTools.filter(t => t.isLoaded)).map(t => `${fmt(t.tokens).padStart(6)}  ${t.name}  (${t.serverName})`)
    case 'custom agents':
      return byTokens(b.agents).map(a => `${fmt(a.tokens).padStart(6)}  ${a.agentType}  (${a.source})`)
    case 'memory files':
      return byTokens(b.memoryFiles).map(f => `${fmt(f.tokens).padStart(6)}  ${f.path}  (${f.type})`)
    default:
      return null
  }
}

const firstLine = (t: string, n = 100) => {
  const l = t.trim().split('\n')[0] ?? ''
  return l.length > n ? `${l.slice(0, n - 1)}…` : l
}

// Fills the detail pane for a legend category and opens it. The rest reads the engine:
// the system prompt as it composes it, the built-in tools, the conversation's messages.
async function showDetail($: EngineInterface, name: string) {
  const b = s.breakdown
  let lines = b ? breakdownLines(name, b) : []
  if (!lines) {
    const key = name.toLowerCase()
    if (key === 'system prompt' || key === 'mcp server instructions') {
      const { sections } = await $.prompt.compose()
      const mcp = (id: string) => /mcp/i.test(id)
      lines = sections
        .filter(x => mcp(x.id) === (key !== 'system prompt'))
        .flatMap(x => [`── ${x.id} ──`, ...x.text.split('\n'), ''])
    } else if (key === 'system tools') {
      lines = (await $.tool.list()).filter(t => !t.mcp).map(t => `${t.name}  ${firstLine(t.description)}`)
    } else if (key === 'messages') {
      const msgs = await $.session.messages()
      lines = [
        `${msgs.length} messages`,
        ...msgs.map(m => `${m.role === 'user' ? '›' : '‹'} ${firstLine(m.text) || m.toolUses.map(u => u.tool).join(', ')}`),
      ]
    } else lines = []
  }
  s.detail = { title: name.toLowerCase(), lines: lines.length ? lines : ['Nothing to list.'] }
  $.ui.invalidate('ui.render')
  await $.ui.open({ id: DETAIL, title: s.detail.title, focus: true, closeOnEscape: true })
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

// The main conversation's cache lifetime in minutes, resolved as Claude Code does on each request:
// FORCE_PROMPT_CACHING_5M, then CLAUDE_CODE_PROMPT_CACHE_TTL, then the `promptCacheTtl` setting.
// None set means automatic (1h on a subscription, 5m on an API key), which a mod can't see: `fallback`.
// Returns the minutes and where they came from.
export const cacheTtl = (force: string | undefined, env: string | undefined, setting: unknown, fallback: number) => {
  if (/^(1|true|yes|on)$/i.test(force?.trim() ?? '')) return { min: 5, from: 'FORCE_PROMPT_CACHING_5M' }
  const e = env?.trim()
  if (e === '5m' || e === '1h') return { min: e === '5m' ? 5 : 60, from: '/cache-ttl or CLAUDE_CODE_PROMPT_CACHE_TTL' }
  if (setting === '5m' || setting === '1h') return { min: setting === '5m' ? 5 : 60, from: 'promptCacheTtl setting' }
  return { min: fallback, from: 'automatic, ttlMinutes option' }
}

// A failed read falls back to ttlMinutes rather than stopping the countdown.
async function currentTtl($: EngineInterface, fallback: number) {
  try {
    const force = await $.env.get('FORCE_PROMPT_CACHING_5M')
    const env = await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL')
    const { promptCacheTtl } = await $.settings.read()
    return cacheTtl(force, env, promptCacheTtl, fallback)
  } catch {
    return cacheTtl(undefined, undefined, undefined, fallback)
  }
}

// `/cache-ttl 5m|1h|auto`: Claude Code reads the variable on every request, so the next one uses it.
async function setTtl($: EngineInterface, args: string, fallback: number) {
  const v = args.trim()
  if (v && v !== '5m' && v !== '1h' && v !== 'auto') return { text: 'Usage: /cache-ttl [5m | 1h | auto]' }
  if (v) {
    restoreTtl = null // an explicit choice wins over a pending restore
    await $.env.set('CLAUDE_CODE_PROMPT_CACHE_TTL', v === 'auto' ? undefined : v)
  }
  const { min, from } = await currentTtl($, fallback)
  const left = s.ttlLeft !== null ? `cache expires in ${mss(s.ttlLeft)}` : 'no live cache entry (the countdown starts with the next response)'
  return { text: `Prompt cache TTL: ${min} min (${from}); ${left}.${v ? ' The new TTL applies from the next request.' : ''}` }
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

// CLAUDE_CODE_PROMPT_CACHE_TTL as it was before the cache expired (undefined: unset), to put back
// once a turn has written the cache at 5m (`used`); null when nothing is waiting.
let restoreTtl: { value: string | undefined; used: boolean } | null = null

// After a long pause a fresh 1h cache write costs 2x input, a 5m one 1.25x: the first turn
// after it uses 5m, then the TTL it had comes back. Nothing to do when the TTL is already 5m.
async function dropTo5m($: EngineInterface, fallback: number) {
  if ((await currentTtl($, fallback)).min <= 5) return
  restoreTtl = { value: await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL'), used: false }
  await $.env.set('CLAUDE_CODE_PROMPT_CACHE_TTL', '5m')
}

async function restoreAfterDrop($: EngineInterface) {
  if (!restoreTtl?.used) return
  const { value } = restoreTtl
  restoreTtl = null
  await $.env.set('CLAUDE_CODE_PROMPT_CACHE_TTL', value)
}

// Sets the seconds left (null once expired); false when the countdown is over.
async function countdown($: EngineInterface, expiresAt: number) {
  const left = Math.ceil((expiresAt - (await $.clock.now())) / 1000)
  s.ttlLeft = left > 0 ? left : null
  $.ui.invalidate('ui.render')
  return left > 0
}

export const register: Register = (on, options) => {
  const fallback = ttlMinutes(options.ttlMinutes)
  const expiryTo5m = options.expiryTo5m === true
  // The prompt cache entry lives the TTL from its last write or read; one timer ticks while it lives.
  let expiresAt = 0
  let tick: Timer | null = null

  on('session.start', async ($, e, next) => {
    const { context, rateLimits } = await $.session.usage()
    s.context = context
    s.limits = rateLimits
    s.dir = e.cwd.replace(/\/+$/, '').split('/').pop() || e.cwd
    void refreshBreakdown($)
    await refreshBranch($)
    await $.command.register({ name: 'cache-ttl', description: 'Set the prompt cache TTL for this session', argumentHint: '5m|1h|auto' })
    return next(e)
  })

  on('command.run', { command: 'cache-ttl' }, ($, e) => setTtl($, e.args, fallback))

  on('session.measure', ($, e, next) => {
    s.context = e.context
    s.limits = e.rateLimits
    if (e.changed.includes('context')) void refreshBreakdown($)
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
      expiresAt = (await $.clock.now()) + (await currentTtl($, fallback)).min * 60_000
      tick ??= $.clock.every(1000, () => {
        void countdown($, expiresAt).then(alive => {
          if (!alive) {
            tick?.cancel()
            tick = null
            if (expiryTo5m) void dropTo5m($, fallback)
          }
        })
      })
      await countdown($, expiresAt)
      // This response wrote the cache at 5m; the TTL comes back when the turn ends.
      if (restoreTtl) restoreTtl.used = true
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent's turn ends with its own turn.complete (with agentId); only the main one restores.
    if (!e.agentId) await restoreAfterDrop($)
    await refreshBranch($)
    return next(e)
  })

  // No hook reaches the engine's statusLine slot; the hint line under the prompt is the nearest.
  // The engine's own hint (mode pills, shortcuts) stays, drawn under our two lines.
  // What fills a category, opened by clicking it in the legend; Esc closes it.
  on('ui.render', { component: 'Pane', requestId: DETAIL }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {(s.detail?.lines ?? []).map((l, i) => <Text key={String(i)}>{l || ' '}</Text>)}
      </Box>
    )
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const hint = await next(e)
    const { dir, branch, cache: c, context, limits, ttlLeft, rows, compactAt, max } = s
    const pct = context?.percent ?? 0
    const pieces = rows.length && max ? ctxBar(rows, max, compactAt) : null

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
          {pieces
            ? <Text>{pieces.map(([t, col]) => <Text color={col} dimColor={!col}>{t}</Text>)}<Text color={color(pct)}>{` ${pct}%`}</Text></Text>
            : <Text color={color(pct)}>{`${bar(pct)} ${pct}%`}</Text>}
          {context?.tokens ? <Text color="white">{` ${fmt(context.tokens)}/${fmt(context.window)}`}</Text> : null}
          {compactAt ? <Text dimColor>{` ⇥${fmt(compactAt)}`}</Text> : null}
          {c ? <Text dimColor>{`  ${fmt(c.read)} cache↩  ${fmt(c.created)} cache↑`}</Text> : null}
          {ttlLeft !== null ? <Text dimColor>{`  TTL ${mss(ttlLeft)}`}</Text> : null}
        </Text>
        {rows.length ? (
          <Box flexWrap="wrap">
            {rows.map(r => (
              <Box key={r.name} marginRight={2}>
                <Text color={r.color}>■ </Text>
                <Button plain label={`${r.name.toLowerCase()} ${fmt(r.tokens)}`} onPress={() => void showDetail($, r.name)} />
              </Box>
            ))}
          </Box>
        ) : null}
        {hint}
      </Box>
    )
  })
}
