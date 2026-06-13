const { ipcMain } = require('electron')
const agentChatStore = require('./agentChatStore')
const agentOrchestrator = require('./agentOrchestrator')
const agentProviders = require('./agentProviders')
const agentTools = require('./agentTools')
const agentKnowledge = require('./agentKnowledge')
const composioBridge = require('./composioBridge')

let agentHandlersRegistered = false

function registerAgentHandlers(deps) {
  if (agentHandlersRegistered) return
  agentHandlersRegistered = true
  agentTools.initAgentTools(deps)

  ipcMain.handle('agent:list-chats', async () => {
    return agentChatStore.listChats()
  })

  ipcMain.handle('agent:search-chats', async (event, query) => {
    return agentChatStore.searchChats(query)
  })

  ipcMain.handle('agent:get-chat', async (event, sessionId) => {
    return agentChatStore.readChat(sessionId)
  })

  ipcMain.handle('agent:create-chat', async (event, payload) => {
    const settings = deps.getAppSettings()
    return agentChatStore.createChat({
      title: payload?.title,
      capabilities: payload?.capabilities || {
        knowledgeBase: false,
        deskMasterTools: false,
        composioIntegrations: false
      },
      provider: payload?.provider || settings?.agent?.defaultProvider,
      model: payload?.model || settings?.agent?.defaultModel
    })
  })

  ipcMain.handle('agent:delete-chat', async (event, sessionId) => {
    return agentChatStore.deleteChat(sessionId)
  })

  ipcMain.handle('agent:update-chat', async (event, payload) => {
    if (!payload?.sessionId) throw new Error('sessionId required')
    const patch = {}
    if (payload.capabilities) patch.capabilities = payload.capabilities
    if (payload.provider !== undefined) patch.provider = payload.provider
    if (payload.model !== undefined) patch.model = payload.model
    if (payload.title !== undefined) patch.title = payload.title
    if (payload.titleGenerated !== undefined) patch.titleGenerated = payload.titleGenerated
    return agentChatStore.updateChatMeta(payload.sessionId, patch)
  })

  ipcMain.handle('agent:replace-messages', async (event, payload) => {
    if (!payload?.sessionId) throw new Error('sessionId required')
    if (!Array.isArray(payload.messages)) throw new Error('messages array required')
    return agentChatStore.replaceMessages(payload.sessionId, payload.messages)
  })

  ipcMain.handle('agent:chat', async (event, payload) => {
    const appSettings = deps.getAppSettings()
    const webContents = event.sender
    return agentOrchestrator.runChatTurn({
      appSettings,
      sessionId: payload?.sessionId,
      message: payload?.message,
      capabilities: payload?.capabilities,
      provider: payload?.provider,
      model: payload?.model,
      confirmedToolIds: payload?.confirmedToolIds || [],
      webContents
    })
  })

  ipcMain.handle('agent:test-provider', async (event, providerId) => {
    const appSettings = deps.getAppSettings()
    return agentProviders.testProvider(agentOrchestrator.buildAgentSettings(appSettings), providerId)
  })

  ipcMain.handle('agent:kb-list', async () => {
    return agentKnowledge.listCustomDocuments()
  })

  ipcMain.handle('agent:kb-get', async (event, id) => {
    return agentKnowledge.getCustomDocument(id)
  })

  ipcMain.handle('agent:kb-create', async (event, payload) => {
    const doc = agentKnowledge.createCustomDocument(payload)
    const appSettings = deps.getAppSettings()
    try {
      await agentKnowledge.reindexAll(appSettings, appSettings?.agent?.knowledgeBase)
    } catch (err) {
      console.error('KB reindex after create:', err.message)
    }
    return doc
  })

  ipcMain.handle('agent:kb-reindex', async () => {
    const appSettings = deps.getAppSettings()
    return agentKnowledge.reindexAll(appSettings, appSettings?.agent?.knowledgeBase)
  })

  ipcMain.handle('agent:kb-status', async () => {
    return agentKnowledge.getIndexStatus()
  })

  ipcMain.handle('agent:composio-list-toolkits', async () => {
    const appSettings = deps.getAppSettings()
    return composioBridge.listAvailableToolkits(appSettings?.agent)
  })

  ipcMain.handle('agent:composio-connected', async () => {
    const appSettings = deps.getAppSettings()
    return composioBridge.getConnectedToolkits(appSettings?.agent)
  })

  ipcMain.handle('agent:composio-connect', async (event, toolkitSlug) => {
    const appSettings = deps.getAppSettings()
    const result = await composioBridge.initiateToolkitConnection(
      appSettings?.agent,
      toolkitSlug,
      deps.openExternal
    )
    return result
  })

  ipcMain.handle('agent:composio-wait', async (event, payload) => {
    const appSettings = deps.getAppSettings()
    const options = typeof payload === 'object' && payload !== null ? payload : { toolkitSlug: payload }
    const connected = await composioBridge.waitForConnection(appSettings?.agent, options.toolkitSlug, {
      knownAccountIds: options.knownAccountIds || [],
      connectionRequestId: options.connectionRequestId || null
    })
    return connected
  })

  ipcMain.handle('agent:composio-cancel-wait', async (event, toolkitSlug) => {
    return { cancelled: composioBridge.cancelWaitForConnection(toolkitSlug) }
  })

  ipcMain.handle('agent:composio-disconnect', async (event, accountId) => {
    const appSettings = deps.getAppSettings()
    return composioBridge.disconnectToolkit(appSettings?.agent, accountId)
  })

  ipcMain.handle('agent:get-notes-save-context', async () => {
    return deps.getAgentNotesSaveContext()
  })

  ipcMain.handle('agent:set-notes-save-parent', async (event, parentId) => {
    return deps.setAgentNotesSaveParent(parentId)
  })

  ipcMain.handle('agent:save-to-notes', async (event, payload) => {
    return deps.saveAgentResponseToNotes(payload || {})
  })
}

module.exports = { registerAgentHandlers }
