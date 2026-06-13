/**
 * Normalize chat messages / tool_calls between our persistence format and provider APIs.
 * OpenAI-compatible APIs require tool_calls[].type === 'function' and function.name/arguments.
 */

function getMessageTextContent(message) {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  return ''
}

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mediaType: match[1], base64: match[2] }
}

function getMessageImages(message) {
  return Array.isArray(message?.images) ? message.images.filter((img) => img?.dataUrl) : []
}

function getMessageFiles(message) {
  return Array.isArray(message?.files) ? message.files.filter((f) => f?.extractedText) : []
}

function getEffectiveUserText(message) {
  const userText = getMessageTextContent(message)
  const files = getMessageFiles(message)
  if (!files.length) return userText

  const fileBlocks = files
    .map((f) => `[Attached file: ${f.name}]\n${String(f.extractedText).trim()}`)
    .join('\n\n')

  if (!userText.trim()) return fileBlocks
  return `${fileBlocks}\n\nUser message:\n${userText.trim()}`
}

function normalizeUserMessageContentForOpenAi(message) {
  if (Array.isArray(message?.content)) return message.content

  const text = getEffectiveUserText(message)
  const images = getMessageImages(message)
  if (!images.length) return text

  const parts = []
  if (text.trim()) parts.push({ type: 'text', text: text.trim() })
  for (const img of images) {
    parts.push({ type: 'image_url', image_url: { url: img.dataUrl } })
  }
  if (!parts.length) return text
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text
  return parts
}

function normalizeUserMessageContentForAnthropic(message) {
  if (Array.isArray(message?.content)) return message.content

  const text = getEffectiveUserText(message)
  const images = getMessageImages(message)
  if (!images.length) return text

  const content = []
  if (text.trim()) content.push({ type: 'text', text: text.trim() })
  for (const img of images) {
    const parsed = parseDataUrl(img.dataUrl)
    if (!parsed) continue
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: parsed.mediaType,
        data: parsed.base64
      }
    })
  }
  return content.length ? content : text
}

function normalizeUserMessageContentForBedrock(message) {
  if (Array.isArray(message?.content)) return message.content

  const text = getEffectiveUserText(message)
  const images = getMessageImages(message)
  const formatMap = {
    'image/jpeg': 'jpeg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp'
  }

  const content = []
  if (text.trim()) content.push({ text: text.trim() })
  for (const img of images) {
    const parsed = parseDataUrl(img.dataUrl)
    if (!parsed) continue
    const format = formatMap[parsed.mediaType]
    if (!format) continue
    content.push({
      image: {
        format,
        source: { bytes: Buffer.from(parsed.base64, 'base64') }
      }
    })
  }

  if (!content.length) return [{ text: text || '' }]
  return content
}

function normalizeUserMessageContentForGemini(message) {
  if (Array.isArray(message?.content)) return message.content

  const text = getEffectiveUserText(message)
  const images = getMessageImages(message)
  const parts = []

  if (text.trim()) parts.push({ text: text.trim() })
  for (const img of images) {
    const parsed = parseDataUrl(img.dataUrl)
    if (!parsed) continue
    parts.push({
      inline_data: {
        mime_type: parsed.mediaType,
        data: parsed.base64
      }
    })
  }

  if (!parts.length) return [{ text: text || '' }]
  return parts
}

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
      if (m.role === 'user') {
        return { role: 'user', content: normalizeUserMessageContentForOpenAi(m) }
      }
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
  normalizeMessagesForOpenAi,
  getMessageTextContent,
  getMessageImages,
  getMessageFiles,
  getEffectiveUserText,
  parseDataUrl,
  normalizeUserMessageContentForOpenAi,
  normalizeUserMessageContentForAnthropic,
  normalizeUserMessageContentForBedrock,
  normalizeUserMessageContentForGemini
}
