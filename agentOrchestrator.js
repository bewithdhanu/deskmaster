const agentChatStore = require('./agentChatStore')
const agentProviders = require('./agentProviders')
const agentTools = require('./agentTools')
const agentKnowledge = require('./agentKnowledge')
const composioBridge = require('./composioBridge')
const {
  normalizeMessagesForOpenAi,
  toPersistedToolCall,
  getMessageTextContent
} = require('./agentMessageFormat')
const {
  extractMediaFromAssistantText,
  mergeAssistantAttachments
} = require('./agentResponseMedia')
const { splitAttachments, MAX_CHAT_ATTACHMENTS } = require('./agentFileAttach')

const MAX_TOOL_ITERATIONS = 12

function buildAgentSettings(appSettings) {
  const agent = appSettings?.agent || {}
  return {
    ...agent,
    _legacyChatGptKey: appSettings?.apiKeys?.chatgpt || ''
  }
}

function emit(webContents, payload) {
  if (webContents && !webContents.isDestroyed()) {
    webContents.send('agent:stream', payload)
  }
  if (browserStreamBroadcast) {
    browserStreamBroadcast(payload)
  }
}

let browserStreamBroadcast = null

function setBrowserStreamBroadcast(fn) {
  browserStreamBroadcast = fn
}

async function buildSystemPrompt({ capabilities, kbContext, toolsEnabled }) {
  const parts = [
    'You are DeskMaster Agent, a helpful AI assistant integrated into the DeskMaster desktop productivity app.',
    'Be concise, accurate, and practical. When you use tools, explain what you did briefly.'
  ]

  if (capabilities?.knowledgeBase && kbContext?.length) {
    parts.push('\n## Knowledge Base Context\nUse the following retrieved context when relevant. Cite sources by title when answering.')
    for (const chunk of kbContext) {
      parts.push(`\n### ${chunk.title} (${chunk.sourceType})\n${chunk.content}`)
    }
  }

  if (toolsEnabled) {
    parts.push(
      '\nYou have access to DeskMaster tools. Use them when they help answer the user.',
      'For current system metrics use get_system_stats. For historical performance (CPU/RAM/disk trends, counts above a CPU threshold, last 7 days, etc.) use query_system_stats_history — same data as the Performance screen (up to ~30 days).',
      'For IP questions: use get_public_ip for the address; use get_ip_location for city, country, region, ISP, or coordinates (omit IP to look up the current public IP).',
      'When the user asks for downloadable documents, use generate_pdf, generate_docx, generate_xlsx, or generate_pptx and share the returned file details.',
      'When users attach documents (PDF, Word, Excel, PowerPoint, text, JSON, HTML), their extracted text is included in the message — analyze it carefully.',
      'Vision-capable models can analyze attached images. When you generate images or share media URLs, use markdown image syntax so the UI can display them.',
      'Never attempt to access clipboard or authenticator data.'
    )
  }

  if (capabilities?.composioIntegrations) {
    parts.push(
      '\nYou have access to connected Composio integrations via helper tools (COMPOSIO_SEARCH_TOOLS, COMPOSIO_GET_TOOL_SCHEMAS, COMPOSIO_MULTI_EXECUTE_TOOL, and related COMPOSIO_* helpers).',
      'Workflow: search for tools that match the user request, fetch schemas when needed, then execute app tools through COMPOSIO_MULTI_EXECUTE_TOOL (or the appropriate helper).',
      'Some toolkits may have multiple connected accounts (e.g. two Gmail accounts). When the user specifies which account to use, pass the connected account ID in the account parameter when executing app tools.',
      'Prefer a small number of focused tool calls, then summarize results for the user. Do not loop on failed tools — explain missing parameters or errors instead.'
    )
  }

  return parts.join('\n')
}

async function retrieveKbContext(query, appSettings, maxChunks) {
  try {
    return await agentKnowledge.searchKnowledge(query, buildAgentSettings(appSettings), maxChunks)
  } catch (error) {
    console.error('KB retrieval error:', error.message)
    return []
  }
}

async function collectTools(capabilities, agentSettings) {
  const tools = []

  if (capabilities?.deskMasterTools) {
    tools.push(...agentTools.buildToolDefinitions())
  }

  if (capabilities?.composioIntegrations) {
    try {
      const composioTools = await composioBridge.getComposioTools(agentSettings)
      tools.push(...composioTools)
    } catch (error) {
      console.error('Composio tools error:', error.message)
    }
  }

  return tools
}

function parseToolArgs(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return { raw }
  }
}

async function executeToolCall(toolCall, { confirmedToolIds, appSettings, composioEnabled = false }) {
  const name = toolCall.name
  const args = parseToolArgs(toolCall.arguments)
  const confirmed = confirmedToolIds?.includes(toolCall.id)
  const agentSettings = appSettings?.agent || {}

  if (composioEnabled && name && !agentTools.getToolMeta(name)) {
    try {
      const result = await composioBridge.executeComposioTool(agentSettings, name, args)
      return { toolCallId: toolCall.id, name, result }
    } catch (error) {
      return { toolCallId: toolCall.id, name, error: error.message }
    }
  }

  try {
    const result = await agentTools.executeTool(name, args, {
      confirmed,
      agentSettings: buildAgentSettings(appSettings)
    })
    if (result?.requiresConfirmation) {
      return {
        toolCallId: toolCall.id,
        name,
        requiresConfirmation: true,
        arguments: args,
        message: result.message
      }
    }
    return { toolCallId: toolCall.id, name, result }
  } catch (error) {
    return { toolCallId: toolCall.id, name, error: error.message }
  }
}

function countAssistantResponsesWithContent(messages) {
  return (messages || []).filter(
    (m) => m.role === 'assistant' && String(m.content || '').trim()
  ).length
}

async function maybeGenerateChatTitle({
  sessionId,
  appSettings,
  providerId,
  modelId,
  userMessage,
  assistantContent,
  webContents
}) {
  try {
    const chat = agentChatStore.readChat(sessionId)
    if (!chat || chat.titleGenerated) return

    const assistantCount = countAssistantResponsesWithContent(chat.messages)
    if (assistantCount !== 1) return

    const title = await agentProviders.generateChatTitle({
      agentSettings: buildAgentSettings(appSettings),
      providerId,
      model: modelId,
      userMessage,
      assistantMessage: assistantContent
    })

    agentChatStore.updateChatMeta(sessionId, { title, titleGenerated: true })
    emit(webContents, { type: 'title_updated', sessionId, title })
  } catch (error) {
    console.error('Chat title generation failed:', error.message)
  }
}

function scheduleChatTitleGeneration(ctx) {
  void maybeGenerateChatTitle(ctx)
}

const MAX_CHAT_IMAGES = MAX_CHAT_ATTACHMENTS

function normalizeChatImages(images) {
  if (!Array.isArray(images)) return []
  return images
    .filter((img) => img && typeof img.dataUrl === 'string' && img.dataUrl.startsWith('data:image/'))
    .slice(0, MAX_CHAT_ATTACHMENTS)
    .map((img) => ({
      name: String(img.name || 'image'),
      mediaType: String(img.mediaType || 'image/png'),
      dataUrl: img.dataUrl
    }))
}

function normalizeChatFiles(files) {
  if (!Array.isArray(files)) return []
  return files
    .filter((file) => file && String(file.extractedText || '').trim())
    .slice(0, MAX_CHAT_ATTACHMENTS)
    .map((file) => ({
      kind: 'document',
      name: String(file.name || 'document'),
      mediaType: String(file.mediaType || 'text/plain'),
      extractedText: String(file.extractedText || ''),
      size: file.size || null
    }))
}

function normalizeIncomingAttachments({ images, files, attachments }) {
  if (Array.isArray(attachments) && attachments.length) {
    return splitAttachments(attachments)
  }
  return {
    images: normalizeChatImages(images),
    files: normalizeChatFiles(files)
  }
}

function buildAssistantMessage(content, streamAttachments = [], citations = []) {
  const attachments = mergeAssistantAttachments(
    streamAttachments,
    extractMediaFromAssistantText(content)
  )
  return {
    role: 'assistant',
    content,
    ...(attachments.length ? { attachments } : {}),
    ...(citations.length ? { citations } : {}),
    timestamp: new Date().toISOString()
  }
}

function mapChatMessagesForApi(messages) {
  return (messages || []).map((m) => ({
    role: m.role,
    content: m.content,
    images: m.images,
    files: m.files,
    tool_calls: m.tool_calls,
    tool_call_id: m.tool_call_id
  }))
}

async function runToolLoop({
  sessionId,
  pendingMessages,
  turnCitations,
  providerId,
  modelId,
  appSettings,
  tools,
  toolsEnabled,
  textMessage,
  webContents,
  effectiveCapabilities,
  confirmedToolIds = []
}) {
  let iteration = 0

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration += 1
    let assistantText = ''
    let toolCalls = []
    let streamAttachments = []

    await agentProviders.streamChat({
      agentSettings: buildAgentSettings(appSettings),
      providerId,
      model: modelId,
      messages: normalizeMessagesForOpenAi(pendingMessages),
      tools: toolsEnabled ? tools : [],
      onEvent: (ev) => {
        if (ev.type === 'token') {
          assistantText += ev.content
          emit(webContents, { type: 'token', content: ev.content, sessionId })
        }
        if (ev.type === 'media' && ev.attachment) {
          streamAttachments = mergeAssistantAttachments(streamAttachments, [ev.attachment])
          emit(webContents, { type: 'media', attachment: ev.attachment, sessionId })
        }
        if (ev.type === 'tool_calls') {
          toolCalls = ev.toolCalls || []
        }
        if (ev.type === 'done' && ev.attachments?.length) {
          streamAttachments = mergeAssistantAttachments(streamAttachments, ev.attachments)
        }
      }
    })

    if (!toolCalls.length) {
      const assistantMsg = buildAssistantMessage(assistantText, streamAttachments, turnCitations)
      agentChatStore.appendMessage(sessionId, assistantMsg)
      emit(webContents, { type: 'done', sessionId, message: assistantMsg })
      scheduleChatTitleGeneration({
        sessionId,
        appSettings,
        providerId,
        modelId,
        userMessage: textMessage,
        assistantContent: assistantText,
        webContents
      })
      return { sessionId, message: assistantMsg }
    }

    emit(webContents, { type: 'status', message: 'Running tools...', sessionId })

    const assistantWithTools = {
      role: 'assistant',
      content: assistantText || null,
      tool_calls: toolCalls.map((tc) => toPersistedToolCall({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments
      })).filter(Boolean),
      timestamp: new Date().toISOString()
    }
    agentChatStore.appendMessage(sessionId, assistantWithTools)
    emit(webContents, { type: 'tool_calls', toolCalls, sessionId })

    const toolResults = []
    for (const tc of toolCalls) {
      emit(webContents, { type: 'tool_start', name: tc.name, sessionId })
      const result = await executeToolCall(tc, {
        confirmedToolIds,
        appSettings,
        composioEnabled: Boolean(effectiveCapabilities.composioIntegrations)
      })
      emit(webContents, { type: 'tool_result', ...result, sessionId })
      if (result?.result?.path && result?.result?.name) {
        emit(webContents, { type: 'generated_file', file: result.result, sessionId })
      }

      if (result.requiresConfirmation) {
        const confirmMsg = {
          role: 'assistant',
          content: `${result.message}\n\nPlease confirm to proceed with \`${result.name}\`.`,
          pendingConfirmation: { toolCallId: tc.id, name: tc.name, arguments: result.arguments },
          timestamp: new Date().toISOString()
        }
        agentChatStore.appendMessage(sessionId, confirmMsg)
        emit(webContents, { type: 'confirmation_required', ...result, sessionId })
        emit(webContents, { type: 'done', sessionId, message: confirmMsg })
        scheduleChatTitleGeneration({
          sessionId,
          appSettings,
          providerId,
          modelId,
          userMessage: textMessage,
          assistantContent: confirmMsg.content,
          webContents
        })
        return { sessionId, message: confirmMsg, requiresConfirmation: true }
      }

      const toolMsg = {
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.name,
        content: JSON.stringify(result.result ?? { error: result.error }),
        timestamp: new Date().toISOString()
      }
      agentChatStore.appendMessage(sessionId, toolMsg)
      toolResults.push(toolMsg)
    }

    pendingMessages = normalizeMessagesForOpenAi([
      ...pendingMessages,
      {
        role: 'assistant',
        content: assistantWithTools.content,
        tool_calls: assistantWithTools.tool_calls
      },
      ...toolResults.map((t) => ({
        role: 'tool',
        tool_call_id: t.tool_call_id,
        content: t.content
      }))
    ])
  }

  const fallback = {
    role: 'assistant',
    content:
      'I used several integration tool calls but could not finish within the allowed steps. ' +
      'Try a narrower request (e.g. one repo at a time: "list recent commits for owner/repo on GitHub"), ' +
      'or switch to a cloud model (OpenAI/Anthropic) for complex multi-integration tasks. ' +
      'Local models may struggle with many tools.',
    timestamp: new Date().toISOString()
  }
  agentChatStore.appendMessage(sessionId, fallback)
  emit(webContents, { type: 'done', sessionId, message: fallback })
  scheduleChatTitleGeneration({
    sessionId,
    appSettings,
    providerId,
    modelId,
    userMessage: textMessage,
    assistantContent: fallback.content,
    webContents
  })
  return { sessionId, message: fallback }
}

async function resumeConfirmedToolExecution({
  appSettings,
  sessionId,
  capabilities,
  provider,
  model,
  confirmedToolIds,
  webContents
}) {
  let chat = agentChatStore.readChat(sessionId)
  if (!chat) throw new Error('Chat session not found')

  const assistantWithTools = agentChatStore.findAssistantMessageWithToolCalls(chat, confirmedToolIds)
  if (!assistantWithTools) {
    throw new Error('No pending tool call found to confirm. Try sending your request again.')
  }

  agentChatStore.removePendingConfirmations(sessionId, confirmedToolIds)
  chat = agentChatStore.readChat(sessionId)

  const effectiveCapabilities = chat.capabilities || capabilities || {
    knowledgeBase: false,
    deskMasterTools: false,
    composioIntegrations: false
  }

  const agentSettings = appSettings?.agent || {}
  const tools = await collectTools(effectiveCapabilities, agentSettings)
  const toolsEnabled = tools.length > 0
  const providerId = provider || chat.provider || agentSettings.defaultProvider || 'openai'
  const modelId = model || chat.model || agentSettings.defaultModel

  emit(webContents, { type: 'status', message: 'Running tools...', sessionId })

  const toolCalls = assistantWithTools.tool_calls.map((tc) => ({
    id: tc.id,
    name: tc.name,
    arguments: tc.arguments
  }))

  for (const tc of toolCalls) {
    emit(webContents, { type: 'tool_start', name: tc.name, sessionId })
    const result = await executeToolCall(tc, {
      confirmedToolIds,
      appSettings,
      composioEnabled: Boolean(effectiveCapabilities.composioIntegrations)
    })
    emit(webContents, { type: 'tool_result', ...result, sessionId })
    if (result?.result?.path && result?.result?.name) {
      emit(webContents, { type: 'generated_file', file: result.result, sessionId })
    }

    if (result.requiresConfirmation) {
      const confirmMsg = {
        role: 'assistant',
        content: `${result.message}\n\nPlease confirm to proceed with \`${result.name}\`.`,
        pendingConfirmation: { toolCallId: tc.id, name: tc.name, arguments: result.arguments },
        timestamp: new Date().toISOString()
      }
      agentChatStore.appendMessage(sessionId, confirmMsg)
      emit(webContents, { type: 'confirmation_required', ...result, sessionId })
      emit(webContents, { type: 'done', sessionId, message: confirmMsg })
      return { sessionId, message: confirmMsg, requiresConfirmation: true }
    }

    const toolMsg = {
      role: 'tool',
      tool_call_id: tc.id,
      name: tc.name,
      content: JSON.stringify(result.result ?? { error: result.error }),
      timestamp: new Date().toISOString()
    }
    agentChatStore.appendMessage(sessionId, toolMsg)
  }

  chat = agentChatStore.readChat(sessionId)
  const systemPrompt = await buildSystemPrompt({
    capabilities: effectiveCapabilities,
    kbContext: [],
    toolsEnabled
  })
  const pendingMessages = [
    { role: 'system', content: systemPrompt },
    ...normalizeMessagesForOpenAi(mapChatMessagesForApi(chat.messages))
  ]

  emit(webContents, { type: 'status', message: 'Thinking...', sessionId })

  return runToolLoop({
    sessionId,
    pendingMessages,
    turnCitations: [],
    providerId,
    modelId,
    appSettings,
    tools,
    toolsEnabled,
    textMessage: '',
    webContents,
    effectiveCapabilities,
    confirmedToolIds
  })
}

async function runChatTurn({
  appSettings,
  sessionId,
  message,
  images,
  files,
  attachments,
  capabilities,
  provider,
  model,
  confirmedToolIds,
  webContents
}) {
  if (Array.isArray(confirmedToolIds) && confirmedToolIds.length > 0) {
    if (!sessionId) throw new Error('Chat session required to confirm tool execution')
    return resumeConfirmedToolExecution({
      appSettings,
      sessionId,
      capabilities,
      provider,
      model,
      confirmedToolIds,
      webContents
    })
  }

  const agentSettings = appSettings?.agent || {}
  const textMessage = typeof message === 'string' ? message.trim() : ''
  const { images: imageAttachments, files: fileAttachments } = normalizeIncomingAttachments({ images, files, attachments })
  if (!textMessage && !imageAttachments.length && !fileAttachments.length) {
    throw new Error('Message or attachment required')
  }
  let chat = agentChatStore.readChat(sessionId)
  if (!chat) {
    chat = agentChatStore.createChat({ capabilities, provider, model })
    sessionId = chat.id
  } else {
    const metaPatch = {}
    if (capabilities) metaPatch.capabilities = capabilities
    if (provider) metaPatch.provider = provider
    if (model) metaPatch.model = model
    if (Object.keys(metaPatch).length > 0) {
      chat = agentChatStore.updateChatMeta(sessionId, metaPatch)
    }
  }

  chat = agentChatStore.appendMessage(sessionId, {
    role: 'user',
    content: textMessage,
    ...(imageAttachments.length ? { images: imageAttachments } : {}),
    ...(fileAttachments.length ? { files: fileAttachments } : {}),
    timestamp: new Date().toISOString()
  })

  const effectiveCapabilities = chat.capabilities || {
    knowledgeBase: false,
    deskMasterTools: false,
    composioIntegrations: false
  }

  const kbSettings = agentSettings.knowledgeBase || {}
  let kbContext = []
  if (effectiveCapabilities.knowledgeBase) {
    emit(webContents, { type: 'status', message: 'Searching knowledge base...' })
    kbContext = await retrieveKbContext(
      textMessage || (fileAttachments.length ? 'User sent document attachment(s)' : 'User sent image attachment(s)'),
      appSettings,
      kbSettings.maxContextChunks || 8
    )
    if (kbContext.length) {
      emit(webContents, { type: 'kb_citations', citations: kbContext.map((c) => ({ title: c.title, sourceType: c.sourceType })) })
    }
  }

  const turnCitations = kbContext.length
    ? kbContext.map((c) => ({ title: c.title, sourceType: c.sourceType }))
    : []

  const tools = await collectTools(effectiveCapabilities, agentSettings)
  const toolsEnabled = tools.length > 0

  emit(webContents, { type: 'status', message: 'Thinking...', sessionId })

  const systemPrompt = await buildSystemPrompt({
    capabilities: effectiveCapabilities,
    kbContext,
    toolsEnabled
  })

  const history = normalizeMessagesForOpenAi(mapChatMessagesForApi(chat.messages))

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history
  ]

  const providerId = provider || chat.provider || agentSettings.defaultProvider || 'openai'
  const modelId = model || chat.model || agentSettings.defaultModel

  return runToolLoop({
    sessionId,
    pendingMessages: messages,
    turnCitations,
    providerId,
    modelId,
    appSettings,
    tools,
    toolsEnabled,
    textMessage,
    webContents,
    effectiveCapabilities,
    confirmedToolIds
  })
}

module.exports = {
  runChatTurn,
  buildAgentSettings,
  setBrowserStreamBroadcast
}
