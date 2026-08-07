import fs from 'fs'

const src = fs.readFileSync('src/planner/actions/catalog.ts', 'utf8')
const docsSrc = fs.readFileSync('src/planner/actions/action-docs.ts', 'utf8')

function readSq(text, i) {
  const q = text[i]
  if (q !== "'" && q !== '"') return null
  let out = ''
  let j = i + 1
  while (j < text.length) {
    const c = text[j]
    if (c === '\\') {
      out += text[j + 1]
      j += 2
      continue
    }
    if (c === q) return { value: out, end: j + 1 }
    out += c
    j++
  }
  return null
}

function skipWs(text, i) {
  while (i < text.length && /\s/.test(text[i])) i++
  return i
}

function findProp(block, prop) {
  const re = new RegExp(`\\b${prop}\\s*:\\s*`)
  const m = re.exec(block)
  if (!m) return null
  let i = skipWs(block, m.index + m[0].length)
  if (block[i] === "'" || block[i] === '"') {
    // concatenated strings
    let val = ''
    while (true) {
      i = skipWs(block, i)
      if (block[i] !== "'" && block[i] !== '"') break
      const s = readSq(block, i)
      if (!s) break
      val += s.value
      i = skipWs(block, s.end)
      if (block[i] === '+') {
        i++
        continue
      }
      break
    }
    return val
  }
  if (block[i] === '[') {
    const arr = []
    let depth = 0
    let j = i
    while (j < block.length) {
      if (block[j] === '[') {
        depth++
        j++
        continue
      }
      if (block[j] === ']') {
        depth--
        j++
        if (depth === 0) break
        continue
      }
      if ((block[j] === "'" || block[j] === '"') && depth === 1) {
        const s = readSq(block, j)
        if (s) {
          arr.push(s.value)
          j = s.end
          continue
        }
      }
      j++
    }
    return arr
  }
  return null
}

function extractActionBlocks(text) {
  const actions = []
  const re = /\bid:\s*'/g
  let m
  while ((m = re.exec(text))) {
    const idStart = m.index + m[0].length - 1
    const idS = readSq(text, idStart)
    if (!idS) continue
    const id = idS.value
    if (!id.includes('.')) continue

    const blockStart = m.index
    let blockEnd = text.indexOf("\nid: '", idS.end)
    if (blockEnd < 0) blockEnd = text.indexOf("\n    id: '", idS.end)
    if (blockEnd < 0) blockEnd = Math.min(text.length, blockStart + 6000)

    const close = text.indexOf('\n  }),', idS.end)
    const close2 = text.indexOf('\n    }),', idS.end)
    let end = blockEnd
    if (close > idS.end && close < end) end = close
    if (close2 > idS.end && close2 < end) end = close2
    const block = text.slice(blockStart, end + 10)

    const name = findProp(block, 'name')
    const description = findProp(block, 'description')
    const tooltip = findProp(block, 'tooltip')
    const howto = findProp(block, 'howto')

    const fields = {}
    const fIdx = block.search(/\bfields\s*:\s*\[/)
    if (fIdx >= 0) {
      const fieldsBlock = block.slice(fIdx, fIdx + 3500)
      const keyRe = /\bkey:\s*'/g
      let km
      while ((km = keyRe.exec(fieldsBlock))) {
        const ks = readSq(fieldsBlock, km.index + km[0].length - 1)
        if (!ks) continue
        const window = fieldsBlock.slice(km.index, km.index + 900)
        const label = findProp(window, 'label')
        const help = findProp(window, 'help')
        const placeholder = findProp(window, 'placeholder')
        if (label || help || placeholder) {
          fields[ks.value] = {
            ...(label ? { label } : {}),
            ...(help ? { help } : {}),
            ...(placeholder ? { placeholder } : {}),
          }
        }
      }
    }

    if (typeof name === 'string' && typeof description === 'string') {
      actions.push({
        id,
        name,
        description,
        ...(typeof tooltip === 'string' ? { tooltip } : {}),
        ...(Array.isArray(howto) ? { howto } : {}),
        ...(Object.keys(fields).length ? { fields } : {}),
      })
    }
  }
  return actions
}

function parseDocsRecord(name) {
  const re = new RegExp(`const ${name}[^=]*=\\s*\\{`)
  const m = docsSrc.match(re)
  if (!m) return {}
  let i = m.index + m[0].length
  const out = {}
  while (i < docsSrc.length) {
    i = skipWs(docsSrc, i)
    if (docsSrc[i] === '}') break
    if (docsSrc[i] !== "'") {
      i++
      continue
    }
    const ks = readSq(docsSrc, i)
    if (!ks) break
    i = skipWs(docsSrc, ks.end)
    if (docsSrc[i] !== ':') {
      i = ks.end
      continue
    }
    i = skipWs(docsSrc, i + 1)
    if (docsSrc[i] === '[') {
      const arr = []
      let depth = 0
      let j = i
      while (j < docsSrc.length) {
        if (docsSrc[j] === '[') {
          depth++
          j++
          continue
        }
        if (docsSrc[j] === ']') {
          depth--
          j++
          if (depth === 0) break
          continue
        }
        if ((docsSrc[j] === "'" || docsSrc[j] === '"') && depth === 1) {
          const s = readSq(docsSrc, j)
          if (s) {
            arr.push(s.value)
            j = s.end
            continue
          }
        }
        j++
      }
      out[ks.value] = arr
      i = j
    } else if (docsSrc[i] === "'" || docsSrc[i] === '"') {
      let val = ''
      while (true) {
        i = skipWs(docsSrc, i)
        if (docsSrc[i] !== "'" && docsSrc[i] !== '"') break
        const s = readSq(docsSrc, i)
        if (!s) break
        val += s.value
        i = skipWs(docsSrc, s.end)
        if (docsSrc[i] === '+') {
          i++
          continue
        }
        break
      }
      out[ks.value] = val
    } else {
      i++
    }
    i = skipWs(docsSrc, i)
    if (docsSrc[i] === ',') i++
  }
  return out
}

const HOWTO = parseDocsRecord('EXTRA_HOWTO')
const TOOLTIP = parseDocsRecord('EXTRA_TOOLTIP')
const actions = extractActionBlocks(src)
const byId = {}
for (const a of actions) {
  byId[a.id] = {
    ...a,
    tooltip: a.tooltip || TOOLTIP[a.id] || undefined,
    howto: a.howto || HOWTO[a.id] || undefined,
  }
  if (!byId[a.id].tooltip) delete byId[a.id].tooltip
  if (!byId[a.id].howto) delete byId[a.id].howto
}

fs.writeFileSync('tmp-actions-en.json', JSON.stringify(byId, null, 2))
console.log('count', Object.keys(byId).length)
console.log('sample', JSON.stringify(byId['browser.open_url'], null, 2))
console.log('type_text', byId['keyboard.type_text']?.name, '|', byId['keyboard.type_text']?.description?.slice(0, 70))
console.log('copy howto', byId['clipboard.copy_event']?.howto?.length)
console.log('next_plan tip', byId['flow.next_plan_execute']?.tooltip?.slice(0, 60))
