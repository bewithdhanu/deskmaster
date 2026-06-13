const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const { randomUUID } = require('crypto')
const { repairPersistedMessages } = require('./agentMessageFormat')

function getAgentDir() {
  const dir = path.join(app.getPath('userData'), 'agent')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getChatsDir() {
  const dir = path.join(getAgentDir(), 'chats')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getChatPath(sessionId) {
  return path.join(getChatsDir(), `${sessionId}.json`)
}

function readChat(sessionId) {
  const filePath = getChatPath(sessionId)
  if (!fs.existsSync(filePath)) return null
  try {
    const chat = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!Array.isArray(chat?.messages)) return chat

    const repaired = repairPersistedMessages(chat.messages)
    const changed = JSON.stringify(repaired) !== JSON.stringify(chat.messages)
    if (changed) {
      chat.messages = repaired
      writeChat(chat)
    }
    return chat
  } catch {
    return null
  }
}

function writeChat(chat) {
  if (!chat?.id) throw new Error('Chat must have an id')
  fs.writeFileSync(getChatPath(chat.id), JSON.stringify(chat, null, 2))
  return chat
}

function createChat({ title = 'New chat', capabilities = null, provider = null, model = null } = {}) {
  const now = new Date().toISOString()
  const chat = {
    id: randomUUID(),
    title,
    titleGenerated: false,
    createdAt: now,
    updatedAt: now,
    capabilities: capabilities || {
      knowledgeBase: false,
      deskMasterTools: false,
      composioIntegrations: false
    },
    provider: provider || null,
    model: model || null,
    messages: []
  }
  return writeChat(chat)
}

function listChats() {
  const dir = getChatsDir()
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  const chats = files.map((f) => {
    try {
      const chat = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
      const messageCount = Array.isArray(chat.messages) ? chat.messages.length : 0
      if (messageCount === 0) {
        try {
          fs.unlinkSync(path.join(dir, f))
        } catch {}
        return null
      }
      return {
        id: chat.id,
        title: chat.title || 'Untitled',
        updatedAt: chat.updatedAt,
        createdAt: chat.createdAt,
        messageCount,
        capabilities: chat.capabilities,
        provider: chat.provider,
        model: chat.model
      }
    } catch {
      return null
    }
  }).filter(Boolean)

  chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  return chats
}

function deleteChat(sessionId) {
  const filePath = getChatPath(sessionId)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    return true
  }
  return false
}

function appendMessage(sessionId, message) {
  const chat = readChat(sessionId)
  if (!chat) throw new Error('Chat session not found')
  chat.messages.push(message)
  chat.updatedAt = new Date().toISOString()
  return writeChat(chat)
}

function updateChatMeta(sessionId, patch) {
  const chat = readChat(sessionId)
  if (!chat) throw new Error('Chat session not found')
  Object.assign(chat, patch, { updatedAt: new Date().toISOString() })
  return writeChat(chat)
}

function replaceMessages(sessionId, messages) {
  const chat = readChat(sessionId)
  if (!chat) throw new Error('Chat session not found')
  chat.messages = messages
  chat.updatedAt = new Date().toISOString()
  return writeChat(chat)
}

function normalizeSearchQuery(query) {
  return String(query || '').trim().toLowerCase()
}

function messageMatchesQuery(message, query) {
  if (!query) return false
  const content = String(message?.content || '').toLowerCase()
  return content.includes(query)
}

function searchChats(query) {
  const q = normalizeSearchQuery(query)
  if (!q) return listChats()

  const dir = getChatsDir()
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  const results = []

  for (const f of files) {
    try {
      const chat = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
      const messages = Array.isArray(chat.messages) ? chat.messages : []
      if (messages.length === 0) continue

      const title = String(chat.title || '').toLowerCase()
      const titleMatch = title.includes(q)
      const matchingMessages = messages.filter((m) => messageMatchesQuery(m, q))
      if (!titleMatch && matchingMessages.length === 0) continue

      let matchSnippet = ''
      if (!titleMatch && matchingMessages.length > 0) {
        const snippetSource = String(matchingMessages[0].content || '').trim()
        const idx = snippetSource.toLowerCase().indexOf(q)
        const start = Math.max(0, idx - 24)
        const end = Math.min(snippetSource.length, idx + q.length + 48)
        matchSnippet = snippetSource.slice(start, end).trim()
      }

      results.push({
        id: chat.id,
        title: chat.title || 'Untitled',
        updatedAt: chat.updatedAt,
        createdAt: chat.createdAt,
        messageCount: messages.length,
        capabilities: chat.capabilities,
        provider: chat.provider,
        model: chat.model,
        matchSnippet: matchSnippet || null,
        matchInTitle: titleMatch
      })
    } catch {}
  }

  results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  return results
}

function exportAllChats() {
  const dir = getChatsDir()
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  const chats = []
  for (const f of files) {
    try {
      const chat = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
      if (!chat?.id || !Array.isArray(chat.messages) || chat.messages.length === 0) continue
      chats.push(chat)
    } catch {}
  }
  chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  return chats
}

function clearAllChats() {
  const dir = getChatsDir()
  if (!fs.existsSync(dir)) return
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      fs.unlinkSync(path.join(dir, f))
    } catch {}
  }
}

function importChats(chats) {
  clearAllChats()
  if (!Array.isArray(chats)) return
  for (const chat of chats) {
    if (!chat?.id || !Array.isArray(chat.messages)) continue
    try {
      writeChat(chat)
    } catch {}
  }
}

module.exports = {
  createChat,
  listChats,
  readChat,
  deleteChat,
  appendMessage,
  updateChatMeta,
  replaceMessages,
  searchChats,
  exportAllChats,
  clearAllChats,
  importChats
}
