const fs = require('fs')
const path = require('path')
const { app } = require('electron')

function getNotesRootDir() {
  return path.join(app.getPath('userData'), 'notes')
}

function getNotesArchivedDir() {
  return path.join(getNotesRootDir(), 'Archived')
}

function getNotesClipboardDir() {
  return path.join(getNotesRootDir(), '_clipboard')
}

function getMetaPath(dir) {
  return path.join(dir, 'meta.json')
}

function getContentPath(dir) {
  return path.join(dir, 'content.json')
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf8')
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function listChildPageDirs(parentDir) {
  try {
    return fs
      .readdirSync(parentDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(parentDir, d.name))
  } catch {
    return []
  }
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function inlineContentToPlain(content) {
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      if (part.type === 'text' && typeof part.text === 'string') return part.text
      if (part.type === 'link' && Array.isArray(part.content)) return inlineContentToPlain(part.content)
      return ''
    })
    .join('')
}

function blockNoteToPlainText(blocks) {
  if (!Array.isArray(blocks)) return ''
  const parts = []
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    if (Array.isArray(block.content)) {
      parts.push(inlineContentToPlain(block.content))
    }
    if (Array.isArray(block.children)) {
      parts.push(blockNoteToPlainText(block.children))
    }
  }
  return parts.join(' ')
}

function extractPageBodyText(type, content) {
  const normalizedType = type === 'text' || type === 'markdown' ? type : 'canvas'

  if (normalizedType === 'canvas') {
    const blocks = Array.isArray(content?.blocks) ? content.blocks : []
    return blocks.map((block) => stripHtml(block?.content)).filter(Boolean).join(' ')
  }

  if (normalizedType === 'text') {
    return String(content?.text || '').trim()
  }

  const blockText = blockNoteToPlainText(content?.blocknote)
  const legacyText = typeof content?.text === 'string' ? content.text.trim() : ''
  return [blockText, legacyText].filter(Boolean).join(' ')
}

function buildSnippet(text, query, radius = 48) {
  const source = String(text || '').replace(/\s+/g, ' ').trim()
  if (!source) return ''
  const lower = source.toLowerCase()
  const index = lower.indexOf(String(query || '').toLowerCase())
  if (index < 0) {
    return source.slice(0, radius * 2)
  }
  const start = Math.max(0, index - radius)
  const end = Math.min(source.length, index + query.length + radius)
  let snippet = source.slice(start, end).trim()
  if (start > 0) snippet = `…${snippet}`
  if (end < source.length) snippet = `${snippet}…`
  return snippet
}

function scanPages(parentDir, archived, query, results) {
  const archivedDir = getNotesArchivedDir()
  const clipboardDir = getNotesClipboardDir()

  for (const dir of listChildPageDirs(parentDir)) {
    if (dir === archivedDir || dir === clipboardDir) continue

    const meta = readJsonFile(getMetaPath(dir), null)
    if (!meta?.id) continue

    const content = readJsonFile(getContentPath(dir), {})
    const title = String(meta.title || 'Untitled').trim()
    const type = meta.type || 'canvas'
    const body = extractPageBodyText(type, content)
    const searchable = `${title} ${body}`.replace(/\s+/g, ' ').trim().toLowerCase()

    if (searchable.includes(query)) {
      results.push({
        id: meta.id,
        title,
        type,
        archived: Boolean(archived),
        snippet: buildSnippet(body || title, query)
      })
    }

    scanPages(dir, archived, query, results)
  }
}

function searchNotesPages(query) {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  if (!normalizedQuery) return []

  fs.mkdirSync(getNotesRootDir(), { recursive: true })
  fs.mkdirSync(getNotesArchivedDir(), { recursive: true })

  const results = []
  scanPages(getNotesRootDir(), false, normalizedQuery, results)
  scanPages(getNotesArchivedDir(), true, normalizedQuery, results)
  return results
}

module.exports = {
  searchNotesPages
}
