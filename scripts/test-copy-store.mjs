/**
 * Standalone Copy Store + interpolate regression tests (no vitest required).
 * Run: node scripts/test-copy-store.mjs
 *
 * Mirrors src/engine/copy-store logic for CI-less verification.
 */

import assert from 'node:assert/strict'

function extractPrefix(template) {
  const marker = '{_NumberAuto}'
  const idx = template.indexOf(marker)
  if (idx === -1) return template.trim()
  let prefix = template.slice(0, idx)
  if (prefix.endsWith('-')) prefix = prefix.slice(0, -1)
  return prefix.trim()
}

function getNextNumber(store, prefix) {
  let highest = 0
  for (const entry of Object.values(store)) {
    if (entry.prefix !== prefix) continue
    if (typeof entry.number === 'number' && entry.number > highest) highest = entry.number
  }
  return highest + 1
}

function applyPlaceholders(template, ctx) {
  return template.replace(/\{\_([A-Za-z][A-Za-z0-9]*)\}/g, (full, rawName) => {
    if (rawName === 'NumberAuto') return String(ctx.numberAuto)
    return full
  })
}

const locks = new Map()
function withLock(key, fn) {
  const prev = locks.get(key) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  locks.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}

const runtime = new Map()

async function create(variables, input) {
  const workflowId = input.workflowId
  return withLock(workflowId, () => {
    const stores = { ...(variables.copyStores ?? {}) }
    const store = {
      ...(stores[workflowId] ?? {}),
      ...(runtime.get(workflowId) ?? {}),
    }
    const template = input.name
    const prefix = extractPrefix(template)
    const numberAuto = getNextNumber(store, prefix)
    const name = applyPlaceholders(template, { numberAuto })
    const entry = {
      id: `copy_${name}`,
      workflowId,
      name,
      prefix,
      number: numberAuto,
      text: input.text,
      format: input.format ?? 'text',
      createdAt: new Date().toISOString(),
    }
    store[name] = entry
    runtime.set(workflowId, store)
    stores[workflowId] = store
    variables.copyStore = store
    variables.copyStores = stores
    const clipboardPayload =
      entry.format === 'json' ? JSON.stringify({ name: entry.name, text: entry.text }) : entry.text
    return { entry, clipboardPayload, store }
  })
}

function resolveCopy(path, variables) {
  const named = path.trim().match(/^(COPY_NAME|COPY_NUMBER|COPY):(.+)$/i)
  if (!named) return undefined
  const kind = named[1].toUpperCase()
  let rest = named[2].trim()
  let field
  const dotted = rest.match(/^(.+?)\.(text|name|number)$/i)
  if (dotted) {
    rest = dotted[1]
    field = dotted[2].toLowerCase()
  }
  const entry = variables.copyStore?.[rest]
  if (!entry) return ''
  if (kind === 'COPY_NAME') return entry.name
  if (kind === 'COPY_NUMBER') return String(entry.number)
  if (field === 'name') return entry.name
  if (field === 'number') return String(entry.number)
  return entry.text
}

function interpolate(template, variables) {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, raw) => {
    const path = String(raw).trim()
    const copy = resolveCopy(path, variables)
    if (copy !== undefined) return copy
    if (!/^[\w.]+$/.test(path)) return ''
    const value = path.split('.').reduce((acc, key) => {
      if (acc && typeof acc === 'object' && key in acc) return acc[key]
      return undefined
    }, variables)
    if (value === undefined || value === null) return ''
    return String(value)
  })
}

async function main() {
  // 1–2 first/second copy
  let vars = { copyStore: {}, copyStores: {} }
  runtime.clear()
  let a = await create(vars, { workflowId: 'wfA', name: 'story-{_NumberAuto}', text: 'one' })
  assert.equal(a.entry.name, 'story-1')
  let b = await create(vars, { workflowId: 'wfA', name: 'story-{_NumberAuto}', text: 'two' })
  assert.equal(b.entry.name, 'story-2')

  // 3 story-5 present → story-6
  vars.copyStore = {
    'story-1': { prefix: 'story', number: 1, name: 'story-1', text: 'x', workflowId: 'wfA' },
    'story-2': { prefix: 'story', number: 2, name: 'story-2', text: 'x', workflowId: 'wfA' },
    'story-3': { prefix: 'story', number: 3, name: 'story-3', text: 'x', workflowId: 'wfA' },
    'story-5': { prefix: 'story', number: 5, name: 'story-5', text: 'x', workflowId: 'wfA' },
  }
  vars.copyStores = { wfA: { ...vars.copyStore } }
  runtime.set('wfA', { ...vars.copyStore })
  let c = await create(vars, { workflowId: 'wfA', name: 'story-{_NumberAuto}', text: 'six' })
  assert.equal(c.entry.name, 'story-6')

  // 4 story-10 → story-11
  vars.copyStore['story-10'] = {
    prefix: 'story',
    number: 10,
    name: 'story-10',
    text: 'x',
    workflowId: 'wfA',
  }
  runtime.set('wfA', { ...vars.copyStore })
  let d = await create(vars, { workflowId: 'wfA', name: 'story-{_NumberAuto}', text: 'eleven' })
  assert.equal(d.entry.name, 'story-11')

  // 5 independent prefixes
  runtime.clear()
  vars = { copyStore: {}, copyStores: {} }
  await create(vars, { workflowId: 'wfA', name: 'story-{_NumberAuto}', text: 's1' })
  await create(vars, { workflowId: 'wfA', name: 'story-{_NumberAuto}', text: 's2' })
  await create(vars, { workflowId: 'wfA', name: 'story-{_NumberAuto}', text: 's3' })
  await create(vars, { workflowId: 'wfA', name: 'short-story-{_NumberAuto}', text: 'ss1' })
  await create(vars, { workflowId: 'wfA', name: 'short-story-{_NumberAuto}', text: 'ss2' })
  const nextStory = await create(vars, {
    workflowId: 'wfA',
    name: 'story-{_NumberAuto}',
    text: 's4',
  })
  const nextShort = await create(vars, {
    workflowId: 'wfA',
    name: 'short-story-{_NumberAuto}',
    text: 'ss3',
  })
  assert.equal(nextStory.entry.name, 'story-4')
  assert.equal(nextShort.entry.name, 'short-story-3')
  assert.equal(extractPrefix('short-story-{_NumberAuto}'), 'short-story')
  assert.equal(extractPrefix('story-{_NumberAuto}'), 'story')

  // 6 JSON valid with quotes/newlines/unicode
  const tricky = 'He said "hi"\nline2 · বাংলা 🎯'
  const jsonResult = await create(vars, {
    workflowId: 'wfA',
    name: 'story-{_NumberAuto}',
    text: tricky,
    format: 'json',
  })
  const parsed = JSON.parse(jsonResult.clipboardPayload)
  assert.equal(parsed.text, tricky)
  assert.equal(parsed.name, jsonResult.entry.name)

  // 8–10 store + access + interpolate
  assert.equal(interpolate('X {{COPY:story-1}} Y', vars), 'X s1 Y')
  assert.equal(interpolate('{{COPY_NAME:story-1}}', vars), 'story-1')
  assert.equal(interpolate('{{COPY_NUMBER:story-1}}', vars), '1')
  assert.equal(interpolate('{{COPY:story-1.name}}', vars), 'story-1')
  assert.equal(interpolate('{{COPY:story-1.number}}', vars), '1')
  assert.equal(interpolate('{{COPY:story-1.text}}', vars), 's1')
  assert.equal(interpolate('hello {{prompt}}', { prompt: 'world' }), 'hello world')

  // 11 isolation
  runtime.clear()
  const varsA = { copyStore: {}, copyStores: {} }
  const varsB = { copyStore: {}, copyStores: {} }
  await create(varsA, { workflowId: 'wfA', name: 'story-{_NumberAuto}', text: 'A1' })
  await create(varsA, { workflowId: 'wfA', name: 'story-{_NumberAuto}', text: 'A2' })
  await create(varsB, { workflowId: 'wfB', name: 'story-{_NumberAuto}', text: 'B1' })
  assert.equal(Object.keys(varsA.copyStore).length, 2)
  assert.equal(Object.keys(varsB.copyStore).length, 1)
  assert.equal(varsB.copyStore['story-1'].text, 'B1')
  assert.equal(varsA.copyStore['story-1'].text, 'A1')

  // 12 resume numbering (hydrate runtime from existing store)
  runtime.clear()
  const resumeVars = {
    copyStore: {
      'story-1': { prefix: 'story', number: 1, name: 'story-1', text: 'r1', workflowId: 'wfR' },
      'story-2': { prefix: 'story', number: 2, name: 'story-2', text: 'r2', workflowId: 'wfR' },
      'story-3': { prefix: 'story', number: 3, name: 'story-3', text: 'r3', workflowId: 'wfR' },
    },
    copyStores: {},
  }
  resumeVars.copyStores.wfR = { ...resumeVars.copyStore }
  runtime.set('wfR', { ...resumeVars.copyStore })
  const resumed = await create(resumeVars, {
    workflowId: 'wfR',
    name: 'story-{_NumberAuto}',
    text: 'r4',
  })
  assert.equal(resumed.entry.name, 'story-4')

  // 13 rapid concurrent creates → unique numbers
  runtime.clear()
  const raceVars = { copyStore: {}, copyStores: {} }
  const raced = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      create(raceVars, {
        workflowId: 'wfRace',
        name: 'story-{_NumberAuto}',
        text: `t${i}`,
      }),
    ),
  )
  const names = raced.map((r) => r.entry.name).sort()
  assert.deepEqual(names, [
    'story-1',
    'story-2',
    'story-3',
    'story-4',
    'story-5',
    'story-6',
    'story-7',
    'story-8',
  ])

  console.log('OK — copy store tests passed (1–13 core cases)')
}

main().catch((error) => {
  console.error('FAIL', error)
  process.exit(1)
})
