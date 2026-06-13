const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()
const { app } = require('electron')
const { randomUUID } = require('crypto')
const notesSearch = require('./notesSearch')
const agentProviders = require('./agentProviders')

let db = null
let initPromise = null

const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 100

function normalizeAgentSettings(settings) {
  if (!settings) return {}
  if (settings.agent) {
    return {
      ...settings.agent,
      _legacyChatGptKey: settings.apiKeys?.chatgpt || ''
    }
  }
  return settings
}

function getKnowledgeDir() {
  const dir = path.join(app.getPath('userData'), 'knowledge')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getDbPath() {
  const agentDir = path.join(app.getPath('userData'), 'agent')
  fs.mkdirSync(agentDir, { recursive: true })
  return path.join(agentDir, 'knowledge.db')
}

function runDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err)
      else resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

function allDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

function getDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

async function initDatabase() {
  if (db) return db
  if (initPromise) return initPromise

  initPromise = new Promise((resolve, reject) => {
    db = new sqlite3.Database(getDbPath(), (err) => {
      if (err) {
        reject(err)
        return
      }

      db.serialize(async () => {
        try {
          await runDb(`
            CREATE TABLE IF NOT EXISTS documents (
              id TEXT PRIMARY KEY,
              source_type TEXT NOT NULL,
              source_id TEXT,
              title TEXT,
              path TEXT,
              updated_at TEXT,
              indexed_at TEXT
            )
          `)
          await runDb(`
            CREATE TABLE IF NOT EXISTS chunks (
              id TEXT PRIMARY KEY,
              document_id TEXT NOT NULL,
              chunk_index INTEGER NOT NULL,
              content TEXT NOT NULL,
              FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            )
          `)
          await runDb(`
            CREATE TABLE IF NOT EXISTS embeddings (
              chunk_id TEXT PRIMARY KEY,
              vector BLOB NOT NULL,
              FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
            )
          `)
          await runDb('CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id)')
          resolve(db)
        } catch (e) {
          reject(e)
        }
      })
    })
  })

  return initPromise
}

function chunkText(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  const chunks = []
  let start = 0
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + CHUNK_SIZE)
    chunks.push(normalized.slice(start, end))
    if (end >= normalized.length) break
    start = Math.max(0, end - CHUNK_OVERLAP)
  }
  return chunks
}

function vectorToBlob(vector) {
  const buf = Buffer.alloc(vector.length * 4)
  for (let i = 0; i < vector.length; i++) {
    buf.writeFloatLE(vector[i], i * 4)
  }
  return buf
}

function blobToVector(blob) {
  const buf = Buffer.from(blob)
  const vector = []
  for (let i = 0; i < buf.length; i += 4) {
    vector.push(buf.readFloatLE(i))
  }
  return vector
}

function cosineSimilarity(a, b) {
  let dot = 0
  let normA = 0
  let normB = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (!normA || !normB) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

async function clearDocumentIndex(documentId) {
  await initDatabase()
  const chunks = await allDb('SELECT id FROM chunks WHERE document_id = ?', [documentId])
  for (const chunk of chunks) {
    await runDb('DELETE FROM embeddings WHERE chunk_id = ?', [chunk.id])
  }
  await runDb('DELETE FROM chunks WHERE document_id = ?', [documentId])
  await runDb('DELETE FROM documents WHERE id = ?', [documentId])
}

async function indexDocument({ id, sourceType, sourceId, title, filePath, text, agentSettings }) {
  await initDatabase()
  await clearDocumentIndex(id)

  const chunks = chunkText(text)
  if (!chunks.length) return { id, chunks: 0 }

  const now = new Date().toISOString()
  await runDb(
    'INSERT INTO documents (id, source_type, source_id, title, path, updated_at, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, sourceType, sourceId || id, title || 'Untitled', filePath || null, now, now]
  )

  const embeddings = await agentProviders.createEmbeddings({
    agentSettings: normalizeAgentSettings(agentSettings),
    texts: chunks
  })

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = randomUUID()
    await runDb(
      'INSERT INTO chunks (id, document_id, chunk_index, content) VALUES (?, ?, ?, ?)',
      [chunkId, id, i, chunks[i]]
    )
    await runDb(
      'INSERT INTO embeddings (chunk_id, vector) VALUES (?, ?)',
      [chunkId, vectorToBlob(embeddings[i])]
    )
  }

  return { id, chunks: chunks.length }
}

async function indexAllNotes(agentSettings, options = {}) {
  await initDatabase()
  const includeNotes = options.includeNotes !== false
  if (!includeNotes) return { indexed: 0 }

  const pages = notesSearch.enumerateAllNotesPages()
  let indexed = 0
  for (const page of pages) {
    const docId = `note:${page.id}`
    const text = `${page.title}\n\n${page.body}`.trim()
    if (!text) continue
    await indexDocument({
      id: docId,
      sourceType: 'note',
      sourceId: page.id,
      title: page.title,
      text,
      agentSettings
    })
    indexed += 1
  }
  return { indexed }
}

async function indexCustomDocuments(agentSettings, options = {}) {
  await initDatabase()
  const includeCustom = options.includeCustomDocs !== false
  if (!includeCustom) return { indexed: 0 }

  const dir = getKnowledgeDir()
  const metaPath = path.join(dir, 'meta.json')
  const meta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    : { documents: [] }

  let indexed = 0
  for (const doc of meta.documents || []) {
    const filePath = path.join(dir, doc.filename)
    if (!fs.existsSync(filePath)) continue
    const text = fs.readFileSync(filePath, 'utf8')
    await indexDocument({
      id: `custom:${doc.id}`,
      sourceType: 'custom',
      sourceId: doc.id,
      title: doc.title,
      filePath,
      text,
      agentSettings
    })
    indexed += 1
  }
  return { indexed }
}

async function reindexAll(agentSettings, kbSettings = {}) {
  const notesResult = await indexAllNotes(agentSettings, kbSettings)
  const customResult = await indexCustomDocuments(agentSettings, kbSettings)
  return {
    notesIndexed: notesResult.indexed,
    customIndexed: customResult.indexed,
    total: notesResult.indexed + customResult.indexed
  }
}

async function searchKnowledge(query, agentSettings, limit = 8) {
  await initDatabase()
  const normalized = String(query || '').trim()
  if (!normalized) return []

  const [queryEmbedding] = await agentProviders.createEmbeddings({
    agentSettings: normalizeAgentSettings(agentSettings),
    texts: [normalized]
  })

  const rows = await allDb(`
    SELECT c.id as chunk_id, c.content, c.chunk_index, d.id as document_id, d.title, d.source_type, d.source_id, e.vector
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    JOIN embeddings e ON e.chunk_id = c.id
  `)

  const keywordResults = notesSearch.searchNotesPages(normalized)
  const keywordBoost = new Map(keywordResults.map((r) => [`note:${r.id}`, 0.15]))

  const scored = rows.map((row) => {
    const vector = blobToVector(row.vector)
    let score = cosineSimilarity(queryEmbedding, vector)
    if (keywordBoost.has(row.document_id)) score += keywordBoost.get(row.document_id)
    return {
      score,
      content: row.content,
      title: row.title,
      sourceType: row.source_type,
      sourceId: row.source_id,
      documentId: row.document_id,
      chunkIndex: row.chunk_index
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

function readCustomMeta() {
  const metaPath = path.join(getKnowledgeDir(), 'meta.json')
  if (!fs.existsSync(metaPath)) return { documents: [] }
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  } catch {
    return { documents: [] }
  }
}

function writeCustomMeta(meta) {
  fs.writeFileSync(path.join(getKnowledgeDir(), 'meta.json'), JSON.stringify(meta, null, 2))
}

function listCustomDocuments() {
  const meta = readCustomMeta()
  return (meta.documents || []).map((d) => ({
    id: d.id,
    title: d.title,
    filename: d.filename,
    updatedAt: d.updatedAt,
    createdAt: d.createdAt
  }))
}

function createCustomDocument({ title, content }) {
  const meta = readCustomMeta()
  const id = randomUUID()
  const safeName = `${id}.md`
  const now = new Date().toISOString()
  const doc = { id, title: title || 'Untitled', filename: safeName, createdAt: now, updatedAt: now }
  meta.documents = meta.documents || []
  meta.documents.push(doc)
  fs.writeFileSync(path.join(getKnowledgeDir(), safeName), String(content || ''))
  writeCustomMeta(meta)
  return doc
}

function updateCustomDocument(id, { title, content }) {
  const meta = readCustomMeta()
  const doc = (meta.documents || []).find((d) => d.id === id)
  if (!doc) throw new Error('Document not found')
  if (title !== undefined) doc.title = title
  doc.updatedAt = new Date().toISOString()
  if (content !== undefined) {
    fs.writeFileSync(path.join(getKnowledgeDir(), doc.filename), String(content))
  }
  writeCustomMeta(meta)
  return doc
}

function getCustomDocument(id) {
  const meta = readCustomMeta()
  const doc = (meta.documents || []).find((d) => d.id === id)
  if (!doc) return null
  const filePath = path.join(getKnowledgeDir(), doc.filename)
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  return { ...doc, content }
}

async function getIndexStatus() {
  await initDatabase()
  const docCount = await getDb('SELECT COUNT(*) as count FROM documents')
  const chunkCount = await getDb('SELECT COUNT(*) as count FROM chunks')
  return {
    documents: docCount?.count || 0,
    chunks: chunkCount?.count || 0,
    customDocuments: listCustomDocuments().length
  }
}

module.exports = {
  initDatabase,
  reindexAll,
  searchKnowledge,
  listCustomDocuments,
  createCustomDocument,
  updateCustomDocument,
  getCustomDocument,
  getIndexStatus,
  getKnowledgeDir
}
