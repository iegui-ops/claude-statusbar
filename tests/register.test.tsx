import { expect, test } from 'claude-code/testing'

import { bar, branchFromHead, color, fmt, gitDirFromFile, mss, parentDir, resetLabel, ttlMinutes } from '../hooks/register'

test('the branch is read from .git/HEAD like git does', () => {
  expect(branchFromHead('ref: refs/heads/main\n')).toBe('main')
  expect(branchFromHead('ref: refs/heads/feat/x\n')).toBe('feat/x')
  expect(branchFromHead('0123456789abcdef0123456789abcdef01234567\n')).toBe('0123456')
  expect(branchFromHead('garbage')).toBe('')
  expect(gitDirFromFile('gitdir: /repo/.git/worktrees/wt\n', '/wt')).toBe('/repo/.git/worktrees/wt')
  expect(gitDirFromFile('gitdir: ../repo/.git/worktrees/wt\n', '/src/wt')).toBe('/src/wt/../repo/.git/worktrees/wt')
  expect(gitDirFromFile('nonsense', '/wt')).toBe('')
  expect(parentDir('/home/xir/src')).toBe('/home/xir')
  expect(parentDir('/home')).toBe('')
  expect(parentDir('C:\\Users\\xir')).toBe('C:\\Users')
  expect(parentDir('C:')).toBe('')
})

test('ttlMinutes falls back to the 1-hour cache on bad settings', () => {
  expect(ttlMinutes(5)).toBe(5)
  expect(ttlMinutes('60')).toBe(60)
  expect(ttlMinutes(undefined)).toBe(60)
  expect(ttlMinutes(0)).toBe(60)
  expect(ttlMinutes(-5)).toBe(60)
  expect(ttlMinutes('abc')).toBe(60)
})

const PROPS = { isDraft: false, isWorking: false, hint: '? for shortcuts' }

// The surface validates the tree on mount: a refused tree rejects drawn().
test('the bar draws above the engine hint on every surface', async ($, on) => {
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{e.props.hint}</Text>
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'session-vitals', surface, component: 'PromptHint', props: PROPS })
    expect(await ui.drawn()).toMatchObject({ type: 'Box' })
    expect(await ui.find({ text: /░{20} 0%/ })).toBeDefined()
    expect(await ui.find({ text: '? for shortcuts' })).toBeDefined()
    await ui.unmount()
  }
})

test('formats match the old statusline.py', () => {
  expect(color(59)).toBe('green')
  expect(color(60)).toBe('yellow')
  expect(color(85)).toBe('red')
  expect(bar(31)).toBe('██████░░░░░░░░░░░░░░')
  expect(fmt(745)).toBe('745')
  expect(fmt(62_900)).toBe('62.9k')
  expect(fmt(1_200_000)).toBe('1.2M')
  expect(mss(272)).toBe('4:32')
  expect(mss(3599)).toBe('59:59')
  expect(resetLabel({ kind: 'five_hour', percentUsed: 1 })).toBe('')
  expect(resetLabel({ kind: 'five_hour', percentUsed: 1, resetsAt: '2026-10-03T12:00:00' })).toBe('↺12:00')
  expect(resetLabel({ kind: 'seven_day', percentUsed: 1, resetsAt: '2026-10-03T21:20:00' })).toBe('↺Sat 03/10 21:20')
})
