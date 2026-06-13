const https = require('https')
const http = require('http')
const { URL } = require('url')
const { isProviderConfigured } = require('./agentProviderConfig')
const {
  normalizeMessagesForOpenAi,
  getToolCallName,
  getToolCallArgumentsString,
  normalizeUserMessageContentForAnthropic,
  normalizeUserMessageContentForBedrock
} = require('./agentMessageFormat')

function resolveAgentProviderConfig(agentSettings, providerId) {
  const provider = providerId || agentSettings?.defaultProvider || 'openai'
  const providers = agentSettings?.providers || {}
  const cfg = providers[provider] || {}

  if (provider === 'openai' && !cfg.apiKey && agentSettings?._legacyChatGptKey) {
    return { provider, ...cfg, apiKey: agentSettings._legacyChatGptKey }
  }

  return { provider, ...cfg }
}

function httpRequest(urlStr, options, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const lib = url.protocol === 'https:' ? https : http
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: options.timeout || 120000
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data, headers: res.headers })
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
    if (body) req.write(body)
    req.end()
  })
}

function parseSseStream(onEvent) {
  let buffer = ''
  return (chunk) => {
    buffer += chunk.toString()
    const parts = buffer.split('\n')
    buffer = parts.pop() || ''
    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        onEvent(JSON.parse(payload))
      } catch {}
    }
  }
}

function openAiCompatibleStream({ baseUrl, apiKey, model, messages, tools, onEvent }) {
  const url = new URL(baseUrl || 'https://api.openai.com/v1/chat/completions')
  if (!url.pathname.endsWith('/chat/completions')) {
    url.pathname = url.pathname.replace(/\/$/, '') + '/chat/completions'
  }

  const body = {
    model: model || 'gpt-4o-mini',
    messages: normalizeMessagesForOpenAi(messages),
    stream: true,
    temperature: 0.7
  }
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }))
    body.tool_choice = 'auto'
  }

  const payload = JSON.stringify(body)
  const lib = url.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const toolCalls = new Map()
    let assistantText = ''

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 120000
      },
      (res) => {
        if (res.statusCode >= 400) {
          let errBody = ''
          res.on('data', (c) => { errBody += c })
          res.on('end', () => {
            try {
              const parsed = JSON.parse(errBody)
              reject(new Error(parsed.error?.message || `API error ${res.statusCode}`))
            } catch {
              reject(new Error(`API error ${res.statusCode}`))
            }
          })
          return
        }

        const handleChunk = parseSseStream((data) => {
          const choice = data.choices?.[0]
          if (!choice) return
          const delta = choice.delta || {}
          if (delta.content) {
            assistantText += delta.content
            onEvent({ type: 'token', content: delta.content })
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCalls.has(idx)) {
                toolCalls.set(idx, { id: tc.id || `call_${idx}`, name: '', arguments: '' })
              }
              const entry = toolCalls.get(idx)
              if (tc.id) entry.id = tc.id
              if (tc.function?.name) entry.name += tc.function.name
              if (tc.function?.arguments) entry.arguments += tc.function.arguments
            }
          }
          if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
            // wait for end
          }
        })

        res.on('data', handleChunk)
        res.on('end', () => {
          const calls = [...toolCalls.values()].filter((c) => c.name)
          if (calls.length) {
            onEvent({
              type: 'tool_calls',
              toolCalls: calls.map((c) => ({
                id: c.id,
                name: c.name,
                arguments: c.arguments
              }))
            })
          }
          onEvent({ type: 'done', content: assistantText })
          resolve({ content: assistantText, toolCalls: calls })
        })
      }
    )

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
    req.write(payload)
    req.end()
  })
}

function anthropicStream({ apiKey, model, messages, tools, onEvent }) {
  const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: m.tool_call_id,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
          }]
        }
      }
      if (m.role === 'assistant' && m.tool_calls?.length) {
        const content = []
        if (m.content) content.push({ type: 'text', text: m.content })
        for (const tc of m.tool_calls) {
          const name = getToolCallName(tc)
          if (!name) continue
          content.push({
            type: 'tool_use',
            id: tc.id,
            name,
            input: JSON.parse(getToolCallArgumentsString(tc) || '{}')
          })
        }
        return { role: 'assistant', content }
      }
      if (m.role === 'user') {
        return { role: 'user', content: normalizeUserMessageContentForAnthropic(m) }
      }
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }
    })

  const body = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: chatMessages,
    stream: true
  }
  if (systemParts) body.system = systemParts
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters
    }))
  }

  const payload = JSON.stringify(body)

  return new Promise((resolve, reject) => {
    let assistantText = ''
    const toolCalls = []
    let currentTool = null

    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 120000
      },
      (res) => {
        if (res.statusCode >= 400) {
          let errBody = ''
          res.on('data', (c) => { errBody += c })
          res.on('end', () => {
            try {
              const parsed = JSON.parse(errBody)
              reject(new Error(parsed.error?.message || `Anthropic error ${res.statusCode}`))
            } catch {
              reject(new Error(`Anthropic error ${res.statusCode}`))
            }
          })
          return
        }

        let buffer = ''
        res.on('data', (chunk) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const dataStr = line.slice(5).trim()
            if (!dataStr) continue
            try {
              const event = JSON.parse(dataStr)
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                assistantText += event.delta.text
                onEvent({ type: 'token', content: event.delta.text })
              }
              if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                currentTool = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  arguments: ''
                }
              }
              if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
                if (currentTool) currentTool.arguments += event.delta.partial_json || ''
              }
              if (event.type === 'content_block_stop' && currentTool) {
                toolCalls.push({ ...currentTool })
                currentTool = null
              }
            } catch {}
          }
        })
        res.on('end', () => {
          if (toolCalls.length) {
            onEvent({ type: 'tool_calls', toolCalls })
          }
          onEvent({ type: 'done', content: assistantText })
          resolve({ content: assistantText, toolCalls })
        })
      }
    )

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
    req.write(payload)
    req.end()
  })
}

async function bedrockStream({ accessKeyId, secretAccessKey, region, model, messages, onEvent }) {
  let BedrockRuntimeClient
  let ConverseStreamCommand
  try {
    ({ BedrockRuntimeClient, ConverseStreamCommand } = require('@aws-sdk/client-bedrock-runtime'))
  } catch {
    throw new Error('AWS Bedrock SDK not available')
  }

  const client = new BedrockRuntimeClient({
    region: region || 'us-east-1',
    credentials: { accessKeyId, secretAccessKey }
  })

  const systemParts = messages.filter((m) => m.role === 'system').map((m) => ({ text: m.content }))
  const convMessages = messages
    .filter((m) => m.role === 'user' || (m.role === 'assistant' && (m.content || m.tool_calls?.length)))
    .map((m) => {
      if (m.role === 'user') {
        return { role: 'user', content: normalizeUserMessageContentForBedrock(m) }
      }
      return {
        role: 'assistant',
        content: [{ text: String(m.content || '') }]
      }
    })

  const command = new ConverseStreamCommand({
    modelId: model || 'anthropic.claude-3-haiku-20240307-v1:0',
    system: systemParts.length ? systemParts : undefined,
    messages: convMessages,
    inferenceConfig: { maxTokens: 4096, temperature: 0.7 }
  })

  const response = await client.send(command)
  let assistantText = ''

  for await (const event of response.stream) {
    if (event.contentBlockDelta?.delta?.text) {
      assistantText += event.contentBlockDelta.delta.text
      onEvent({ type: 'token', content: event.contentBlockDelta.delta.text })
    }
  }

  onEvent({ type: 'done', content: assistantText })
  return { content: assistantText, toolCalls: [] }
}

async function streamChat({ agentSettings, providerId, model, messages, tools, onEvent }) {
  const resolved = resolveAgentProviderConfig(agentSettings, providerId)
  const provider = resolved.provider

  if (!isProviderConfigured(agentSettings, provider)) {
    throw new Error(`Provider "${provider}" is not enabled or configured. Enable it in Settings > AI Agent.`)
  }

  if (provider === 'anthropic') {
    if (!resolved.apiKey) throw new Error('Anthropic API key not configured in Settings > Agent')
    return anthropicStream({
      apiKey: resolved.apiKey,
      model: model || resolved.model,
      messages,
      tools,
      onEvent
    })
  }

  if (provider === 'openrouter') {
    if (!resolved.apiKey) throw new Error('OpenRouter API key not configured in Settings > Agent')
    return openAiCompatibleStream({
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: resolved.apiKey,
      model: model || resolved.model || 'openai/gpt-4o-mini',
      messages,
      tools,
      onEvent
    })
  }

  if (provider === 'bedrock') {
    if (!resolved.accessKeyId || !resolved.secretAccessKey) {
      throw new Error('AWS Bedrock credentials not configured in Settings > Agent')
    }
    return bedrockStream({
      accessKeyId: resolved.accessKeyId,
      secretAccessKey: resolved.secretAccessKey,
      region: resolved.region,
      model: model || resolved.model,
      messages,
      onEvent
    })
  }

  if (provider === 'local') {
    const baseUrl = resolved.baseUrl || 'http://127.0.0.1:11434/v1'
    return openAiCompatibleStream({
      baseUrl,
      apiKey: resolved.apiKey || 'ollama',
      model: model || resolved.model || 'llama3.2',
      messages,
      tools,
      onEvent
    })
  }

  // default: openai
  const apiKey = resolved.apiKey
  if (!apiKey) throw new Error('OpenAI API key not configured in Settings > Agent')
  return openAiCompatibleStream({
    baseUrl: resolved.baseUrl || 'https://api.openai.com/v1/chat/completions',
    apiKey,
    model: model || resolved.model || agentSettings?.defaultModel || 'gpt-4o-mini',
    messages,
    tools,
    onEvent
  })
}

async function generateChatTitle({ agentSettings, providerId, model, userMessage, assistantMessage }) {
  const userText = String(userMessage || '').trim().slice(0, 400)
  const assistantText = String(assistantMessage || '').trim().slice(0, 600)
  if (!userText && !assistantText) return 'New chat'

  let title = ''
  await streamChat({
    agentSettings,
    providerId,
    model,
    messages: [
      {
        role: 'system',
        content: 'Generate a short, descriptive chat title (max 8 words). No quotes, no punctuation at the end. Return only the title.'
      },
      {
        role: 'user',
        content: `User message:\n${userText}\n\nAssistant reply:\n${assistantText}`
      }
    ],
    tools: [],
    onEvent: (ev) => {
      if (ev.type === 'token') title += ev.content
    }
  })

  const cleaned = title
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 60)

  return cleaned || userText.slice(0, 48) || 'New chat'
}

async function testProvider(agentSettings, providerId) {
  const messages = [{ role: 'user', content: 'Reply with exactly: OK' }]
  let result = ''
  await streamChat({
    agentSettings,
    providerId,
    messages,
    tools: [],
    onEvent: (ev) => {
      if (ev.type === 'token') result += ev.content
    }
  })
  return { success: true, preview: result.trim().slice(0, 80) }
}

async function createEmbeddings({ agentSettings, texts }) {
  const openaiKey = agentSettings?.providers?.openai?.apiKey || agentSettings?._legacyChatGptKey
  if (!openaiKey) {
    throw new Error('OpenAI API key required for embeddings. Configure in Settings > Agent.')
  }

  const payload = JSON.stringify({
    model: 'text-embedding-3-small',
    input: texts
  })

  const res = await httpRequest('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload)

  if (res.statusCode >= 400) {
    let msg = `Embedding API error ${res.statusCode}`
    try {
      msg = JSON.parse(res.body).error?.message || msg
    } catch {}
    throw new Error(msg)
  }

  const parsed = JSON.parse(res.body)
  return parsed.data.map((d) => d.embedding)
}

module.exports = {
  streamChat,
  testProvider,
  createEmbeddings,
  generateChatTitle,
  resolveAgentProviderConfig
}
