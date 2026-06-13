const agentChatStore = require('./agentChatStore')
const agentKnowledge = require('./agentKnowledge')
const composioBridge = require('./composioBridge')

function handleAgentGet(req, res, appSettings, deps = {}) {
  const url = new URL(req.url, 'http://localhost')

  if (url.pathname === '/api/agent/chats') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(agentChatStore.listChats()))
    return true
  }

  if (url.pathname === '/api/agent/chats/search') {
    const q = url.searchParams.get('q') || ''
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(agentChatStore.searchChats(q)))
    return true
  }

  if (url.pathname === '/api/agent/chat') {
    const id = url.searchParams.get('id')
    const chat = id ? agentChatStore.readChat(id) : null
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(chat))
    return true
  }

  if (url.pathname === '/api/agent/kb-status') {
    agentKnowledge.getIndexStatus()
      .then((status) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(status))
      })
      .catch((error) => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message }))
      })
    return true
  }

  if (url.pathname === '/api/agent/composio-toolkits') {
    composioBridge.listAvailableToolkits(appSettings?.agent)
      .then((toolkits) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(toolkits))
      })
      .catch((error) => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message }))
      })
    return true
  }

  if (url.pathname === '/api/agent/composio/connected') {
    composioBridge.getConnectedToolkits(appSettings?.agent)
      .then((connected) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(connected))
      })
      .catch((error) => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message }))
      })
    return true
  }

  if (url.pathname === '/api/agent/notes-save-context') {
    try {
      if (!deps.getAgentNotesSaveContext) throw new Error('Notes save not available')
      const ctx = deps.getAgentNotesSaveContext()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(ctx))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  return false
}

async function handleAgentPost(req, res, body, appSettings, deps = {}) {
  if (req.url === '/api/agent/chats') {
    try {
      const payload = JSON.parse(body || '{}')
      const chat = agentChatStore.createChat({
        title: payload.title,
        capabilities: payload.capabilities || {
          knowledgeBase: false,
          deskMasterTools: false,
          composioIntegrations: false
        },
        provider: payload.provider || appSettings?.agent?.defaultProvider,
        model: payload.model || appSettings?.agent?.defaultModel
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(chat))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  if (req.url === '/api/agent/chat/delete') {
    try {
      const payload = JSON.parse(body || '{}')
      agentChatStore.deleteChat(payload.sessionId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  if (req.url === '/api/agent/chat/update') {
    try {
      const payload = JSON.parse(body || '{}')
      if (!payload.sessionId) throw new Error('sessionId required')
      const patch = {}
      if (payload.capabilities) patch.capabilities = payload.capabilities
      if (payload.provider !== undefined) patch.provider = payload.provider
      if (payload.model !== undefined) patch.model = payload.model
      const chat = agentChatStore.updateChatMeta(payload.sessionId, patch)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(chat))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  if (req.url === '/api/agent/chat/replace-messages') {
    try {
      const payload = JSON.parse(body || '{}')
      if (!payload.sessionId) throw new Error('sessionId required')
      if (!Array.isArray(payload.messages)) throw new Error('messages array required')
      const chat = agentChatStore.replaceMessages(payload.sessionId, payload.messages)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(chat))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  if (req.url === '/api/agent/kb-reindex') {
    try {
      const result = await agentKnowledge.reindexAll(appSettings, appSettings?.agent?.knowledgeBase)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  if (req.url === '/api/agent/chat') {
    try {
      const payload = JSON.parse(body || '{}')
      const agentOrchestrator = require('./agentOrchestrator')
      const result = await agentOrchestrator.runChatTurn({
        appSettings,
        sessionId: payload.sessionId,
        message: payload.message,
        capabilities: payload.capabilities,
        provider: payload.provider,
        model: payload.model,
        confirmedToolIds: payload.confirmedToolIds || [],
        webContents: null
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  if (req.url === '/api/agent/test-provider') {
    try {
      const payload = JSON.parse(body || '{}')
      const agentProviders = require('./agentProviders')
      const result = await agentProviders.testProvider(
        require('./agentOrchestrator').buildAgentSettings(appSettings),
        payload.providerId
      )
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  if (req.url === '/api/agent/composio/connect') {
    try {
      const payload = JSON.parse(body || '{}')
      const toolkitSlug = payload.toolkitSlug
      if (!toolkitSlug) throw new Error('toolkitSlug required')
      const result = await composioBridge.initiateToolkitConnection(
        appSettings?.agent,
        toolkitSlug,
        null
      )
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  if (req.url === '/api/agent/composio/wait') {
    try {
      const payload = JSON.parse(body || '{}')
      const toolkitSlug = payload.toolkitSlug
      if (!toolkitSlug) throw new Error('toolkitSlug required')
      const connected = await composioBridge.waitForConnection(appSettings?.agent, toolkitSlug, {
        knownAccountIds: payload.knownAccountIds || [],
        connectionRequestId: payload.connectionRequestId || null
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(connected))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  if (req.url === '/api/agent/composio/cancel-wait') {
    try {
      const payload = JSON.parse(body || '{}')
      const toolkitSlug = payload.toolkitSlug
      if (!toolkitSlug) throw new Error('toolkitSlug required')
      const cancelled = composioBridge.cancelWaitForConnection(toolkitSlug)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ cancelled }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  if (req.url === '/api/agent/composio/disconnect') {
    try {
      const payload = JSON.parse(body || '{}')
      const result = await composioBridge.disconnectToolkit(appSettings?.agent, payload.accountId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  if (req.url === '/api/agent/set-notes-save-parent') {
    try {
      const payload = JSON.parse(body || '{}')
      if (!deps.setAgentNotesSaveParent) throw new Error('Notes save not available')
      const result = deps.setAgentNotesSaveParent(payload.parentId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  if (req.url === '/api/agent/save-to-notes') {
    try {
      const payload = JSON.parse(body || '{}')
      if (!deps.saveAgentResponseToNotes) throw new Error('Notes save not available')
      const result = deps.saveAgentResponseToNotes(payload)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  return false
}

module.exports = { handleAgentGet, handleAgentPost }
