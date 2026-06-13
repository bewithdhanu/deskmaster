const agentChatStore = require('./agentChatStore')
const agentKnowledge = require('./agentKnowledge')
const agentDocumentGenerator = require('./agentDocumentGenerator')

const EXPORT_VERSION = '1.1'

function validateExportPayload(data) {
  if (!data || typeof data !== 'object') return false
  return Boolean(
    data.settings &&
    data.authenticators &&
    data.clipboardHistory &&
    data.history
  )
}

async function buildAgentExportPayload() {
  return {
    version: 1,
    chats: agentChatStore.exportAllChats(),
    knowledge: agentKnowledge.exportKnowledgePayload(),
    knowledgeDb: await agentKnowledge.exportKnowledgeDb(),
    generated: agentDocumentGenerator.exportGeneratedPayload()
  }
}

async function importAgentPayload(agentPayload, { reindexKnowledge } = {}) {
  if (!agentPayload || typeof agentPayload !== 'object') return

  if (Array.isArray(agentPayload.chats)) {
    agentChatStore.importChats(agentPayload.chats)
  }

  if (agentPayload.knowledge) {
    agentKnowledge.importKnowledgePayload(agentPayload.knowledge)
  }

  if (agentPayload.knowledgeDb) {
    await agentKnowledge.importKnowledgeDb(agentPayload.knowledgeDb)
  } else if (typeof reindexKnowledge === 'function') {
    await reindexKnowledge()
  }

  if (agentPayload.generated) {
    agentDocumentGenerator.importGeneratedPayload(agentPayload.generated)
  }
}

async function buildExportPayload(deps) {
  const {
    getAppSettings,
    getAllAuthenticators,
    getClipboardHistory,
    getHistory,
    getNotesExportPayload
  } = deps

  return {
    version: EXPORT_VERSION,
    exportDate: new Date().toISOString(),
    settings: getAppSettings(),
    authenticators: await getAllAuthenticators(),
    clipboardHistory: await getClipboardHistory(10000),
    history: await getHistory(0, Date.now()),
    notes: await getNotesExportPayload(),
    agent: await buildAgentExportPayload()
  }
}

async function importExportPayload(importData, deps) {
  if (!validateExportPayload(importData)) {
    throw new Error('Invalid export file format')
  }

  const {
    setAppSettings,
    getAllAuthenticators,
    deleteAuthenticator,
    createAuthenticator,
    clearClipboardHistory,
    storeClipboardEntry,
    clearAllHistory,
    importHistoryEntries,
    importNotesFromPayload,
    reindexKnowledge
  } = deps

  setAppSettings(importData.settings)

  const existingAuths = await getAllAuthenticators()
  for (const auth of existingAuths) {
    await deleteAuthenticator(auth.id)
  }
  for (const auth of importData.authenticators) {
    const { id, ...rest } = auth
    await createAuthenticator(rest)
  }

  await clearClipboardHistory()
  for (const entry of importData.clipboardHistory) {
    await storeClipboardEntry(entry.content, entry.source || 'imported')
  }

  await clearAllHistory()
  if (importData.history && Array.isArray(importData.history) && importData.history.length > 0) {
    await importHistoryEntries(importData.history)
  }

  if (importData.notes) {
    importNotesFromPayload(importData.notes)
  }

  await importAgentPayload(importData.agent, { reindexKnowledge })

  return { success: true }
}

module.exports = {
  EXPORT_VERSION,
  validateExportPayload,
  buildExportPayload,
  importExportPayload
}
