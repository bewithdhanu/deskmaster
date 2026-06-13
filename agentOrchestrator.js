const agentChatStore = require('./agentChatStore')
const agentProviders = require('./agentProviders')
const agentTools = require('./agentTools')
const agentKnowledge = require('./agentKnowledge')
const composioBridge = require('./composioBridge')
const {
  normalizeMessagesForOpenAi,
  toPersistedToolCall
} = require('./agentMessageFormat')

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

async function runChatTurn({
  appSettings,
  sessionId,
  message,
  capabilities,
  provider,
  model,
  confirmedToolIds,
  webContents
}) {
  const agentSettings = appSettings?.agent || {}
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

  chat = agentChatStore.appendMessage(sessionId, { role: 'user', content: message, timestamp: new Date().toISOString() })

  const effectiveCapabilities = chat.capabilities || {
    knowledgeBase: false,
    deskMasterTools: false,
    composioIntegrations: false
  }

  const kbSettings = agentSettings.knowledgeBase || {}
  let kbContext = []
  if (effectiveCapabilities.knowledgeBase) {
    emit(webContents, { type: 'status', message: 'Searching knowledge base...' })
    kbContext = await retrieveKbContext(message, appSettings, kbSettings.maxContextChunks || 8)
    if (kbContext.length) {
      emit(webContents, { type: 'kb_citations', citations: kbContext.map((c) => ({ title: c.title, sourceType: c.sourceType })) })
    }
  }

  const tools = await collectTools(effectiveCapabilities, agentSettings)
  const toolsEnabled = tools.length > 0

  emit(webContents, { type: 'status', message: 'Thinking...', sessionId })

  const systemPrompt = await buildSystemPrompt({
    capabilities: effectiveCapabilities,
    kbContext,
    toolsEnabled
  })

  const history = normalizeMessagesForOpenAi(
    (chat.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls,
      tool_call_id: m.tool_call_id
    }))
  )

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history
  ]

  const providerId = provider || chat.provider || agentSettings.defaultProvider || 'openai'
  const modelId = model || chat.model || agentSettings.defaultModel

  let iteration = 0
  let pendingMessages = [...messages]
  const assistantMessages = []

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration += 1
    let assistantText = ''
    let toolCalls = []

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
        if (ev.type === 'tool_calls') {
          toolCalls = ev.toolCalls || []
        }
      }
    })

    if (!toolCalls.length) {
      const assistantMsg = {
        role: 'assistant',
        content: assistantText,
        timestamp: new Date().toISOString()
      }
      agentChatStore.appendMessage(sessionId, assistantMsg)
      emit(webContents, { type: 'done', sessionId, message: assistantMsg })
      scheduleChatTitleGeneration({
        sessionId,
        appSettings,
        providerId,
        modelId,
        userMessage: message,
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
          userMessage: message,
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

    assistantMessages.push(assistantWithTools, ...toolResults)
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
    userMessage: message,
    assistantContent: fallback.content,
    webContents
  })
  return { sessionId, message: fallback }
}

module.exports = {
  runChatTurn,
  buildAgentSettings,
  setBrowserStreamBroadcast
}
