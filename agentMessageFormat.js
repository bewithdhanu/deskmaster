/**
 * Normalize chat messages / tool_calls between our persistence format and provider APIs.
 * OpenAI-compatible APIs require tool_calls[].type === 'function' and function.name/arguments.
 */

function normalizeToolCallForOpenAi(tc) {
  if (!tc || !tc.id) return null

  if (tc.type === 'function' && tc.function?.name) {
    const args = tc.function.arguments
    return {
      id: tc.id,
      type: 'function',
      function: {
        name: tc.function.name,
        arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {})
      }
    }
  }

  const name = tc.name || tc.function?.name || ''
  if (!name) return null

  const rawArgs = tc.arguments ?? tc.function?.arguments ?? '{}'
  const argsStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {})

  return {
    id: tc.id,
    type: 'function',
    function: {
      name,
      arguments: argsStr
    }
  }
}

function getToolCallName(tc) {
  return tc?.name || tc?.function?.name || ''
}

function getToolCallArgumentsString(tc) {
  const raw = tc?.arguments ?? tc?.function?.arguments ?? '{}'
  return typeof raw === 'string' ? raw : JSON.stringify(raw ?? {})
}

function toPersistedToolCall(tc) {
  const normalized = normalizeToolCallForOpenAi(tc)
  if (!normalized) return null
  return {
    id: normalized.id,
    name: normalized.function.name,
    arguments: normalized.function.arguments
  }
}

function repairPersistedMessages(messages) {
  return (messages || []).map((m) => {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const tool_calls = m.tool_calls.map(toPersistedToolCall).filter(Boolean)
      return {
        ...m,
        content: m.content ?? null,
        tool_calls
      }
    }

    if (m.role === 'tool') {
      return {
        ...m,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
      }
    }

    return m
  })
}

function normalizeMessagesForOpenAi(messages) {
  return (messages || []).map((m) => {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const tool_calls = m.tool_calls.map(normalizeToolCallForOpenAi).filter(Boolean)
      if (!tool_calls.length) {
        return { role: 'assistant', content: m.content ?? '' }
      }
      return {
        role: 'assistant',
        content: m.content ?? null,
        tool_calls
      }
    }

    if (m.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: m.tool_call_id,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
      }
    }

    if (m.role === 'system' || m.role === 'user' || m.role === 'assistant') {
      return { role: m.role, content: m.content ?? '' }
    }

    return m
  })
}

module.exports = {
  normalizeToolCallForOpenAi,
  toPersistedToolCall,
  getToolCallName,
  getToolCallArgumentsString,
  repairPersistedMessages,
  normalizeMessagesForOpenAi
}
