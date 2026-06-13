const agentProviders = require('./agentProviders')
const { getEnabledProviders, getProviderModel } = require('./agentProviderConfig')

const REFORMAT_TONE_INSTRUCTIONS = {
  casual: 'Casual: Use everyday language, contractions, and a relaxed style. Keep it conversational and approachable.',
  professional: 'Professional: Clear, polished, business-appropriate language. Correct grammar, concise and direct. Suitable for emails and reports.',
  managerial: 'Managerial: Formal, authoritative, executive-level. Precise language, commanding but respectful. Suited for leadership and senior-stakeholder communication.',
  friendly: 'Friendly: Warm, approachable, and personable. Use a positive and welcoming tone.',
  formal: 'Formal: Proper, reserved, and polished. Avoid contractions and colloquialisms; suitable for official documents.',
  concise: 'Concise: Short and to the point. Remove filler words and redundancy; keep only essential information.',
  empathetic: 'Empathetic: Acknowledge feelings and show understanding. Use supportive and considerate language.',
  assertive: 'Assertive: Direct and confident. State points clearly without being aggressive.',
  diplomatic: 'Diplomatic: Tactful and considerate. Soften potentially harsh points while staying clear.',
  funny: 'Funny: Light, witty, or humorous where appropriate. Add tasteful humor and playfulness without undermining the message.'
}

const AI_SELECTION_ACTIONS = {
  improve:
    'Rewrite the following text to be clearer and more polished while preserving meaning and tone. Output only the rewritten text, with no preamble or quotes.',
  shorten:
    'Shorten the following text while keeping every important fact and the overall tone. Output only the shortened text, with no preamble or quotes.',
  expand:
    'Expand the following text with useful detail and smoother sentences. Do not invent facts. Output only the expanded text, with no preamble or quotes.',
  'fix-grammar':
    'Fix grammar, spelling, and punctuation. Preserve meaning and tone. Output only the corrected text, with no preamble or quotes.',
  simplify:
    'Simplify the wording: use shorter sentences and simpler vocabulary where possible, while preserving the original meaning. Output only the simplified text, with no preamble or quotes.'
}

function buildAgentSettingsFromApp(appSettings) {
  const agent = appSettings?.agent || {}
  return {
    ...agent,
    _legacyChatGptKey: appSettings?.apiKeys?.chatgpt || ''
  }
}

function getProviderAttemptOrder(agentSettings) {
  const enabled = getEnabledProviders({ agent: agentSettings })
  if (!enabled.length) return []

  const preferred = agentSettings.defaultProvider || 'openai'
  const order = []
  if (enabled.includes(preferred)) order.push(preferred)
  for (const id of enabled) {
    if (!order.includes(id)) order.push(id)
  }
  return order
}

async function completeWithAgentProviders(appSettings, messages) {
  const agentSettings = buildAgentSettingsFromApp(appSettings)
  const order = getProviderAttemptOrder(agentSettings)
  if (!order.length) {
    throw new Error('No LLM provider configured. Set one up in Settings > AI Agent.')
  }

  let lastError = null
  for (const providerId of order) {
    try {
      const model = getProviderModel({ agent: agentSettings }, providerId) || undefined
      let result = ''
      await agentProviders.streamChat({
        agentSettings,
        providerId,
        model,
        messages,
        tools: [],
        onEvent: (ev) => {
          if (ev.type === 'token') result += ev.content
        }
      })
      const text = result.trim()
      if (!text) throw new Error('Empty response from model')
      return text
    } catch (error) {
      lastError = error
      console.warn(`Text LLM request failed via ${providerId}:`, error.message)
    }
  }

  throw lastError || new Error('All configured LLM providers failed')
}

function getReformatMessages(text, tones) {
  const selected = Array.isArray(tones) && tones.length > 0 ? tones : ['professional']
  const instructions = selected
    .map((t) => REFORMAT_TONE_INSTRUCTIONS[t])
    .filter(Boolean)
  const toneInstruction = instructions.length > 0
    ? `Apply the following tone(s) together: ${instructions.join(' ')}`
    : REFORMAT_TONE_INSTRUCTIONS.professional
  const systemPrompt = `You are an expert editor. Your task is to reformat the user's text so it is clear, correct, and easy to read.

Rules:
1. Fix all grammar, spelling, and punctuation.
2. Improve sentence structure and flow; break run-on sentences and tighten wordy phrases.
3. Use clear paragraph breaks where ideas change; keep paragraphs short (2–4 sentences when possible).
4. Preserve every fact, number, and piece of information; do not add or remove content.
5. Do not add headings, bullet points, or lists unless the original text already has them or they are clearly needed for clarity.
6. Use emojis where they fit the tone and add clarity or warmth (e.g. in casual, friendly, or funny tones). Use them sparingly in professional or formal tones; avoid overusing them.
7. Output only the reformatted text, with no preamble or explanation.

Tone: ${toneInstruction}`
  const userPrompt = `Reformat the following text according to the rules and tone given. Output only the reformatted text.\n\n---\n\n${text}`
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]
}

function getAiSelectionMessages(text, action, extra = {}) {
  const trimmed = typeof text === 'string' ? text.trim() : ''

  if (action === 'custom') {
    const instr = typeof extra.instruction === 'string' ? extra.instruction.trim() : ''
    return [
      {
        role: 'system',
        content:
          'Apply the following instruction to the user text. Output only the resulting text, with no preamble, quotes, or explanation.\n\nInstruction: ' +
          instr
      },
      { role: 'user', content: trimmed }
    ]
  }

  if (action === 'translate') {
    const lang =
      typeof extra.targetLanguage === 'string' && extra.targetLanguage.trim()
        ? extra.targetLanguage.trim()
        : 'English'
    return [
      {
        role: 'system',
        content: `Translate the following text into ${lang}. Preserve meaning and tone. Output only the translated text, with no preamble or quotes.`
      },
      { role: 'user', content: trimmed }
    ]
  }

  const instruction = AI_SELECTION_ACTIONS[action] || AI_SELECTION_ACTIONS.improve
  return [
    { role: 'system', content: instruction },
    { role: 'user', content: trimmed }
  ]
}

async function translateText(appSettings, text, targetLanguage) {
  if (!targetLanguage || !String(targetLanguage).trim()) {
    throw new Error('Target language is required')
  }
  const lang = String(targetLanguage).trim()
  const messages = [
    {
      role: 'system',
      content: `You are a professional translator. Translate the given text to ${lang}. Preserve the original meaning, tone, and style. Only provide the translation, no explanations or additional text.`
    },
    {
      role: 'user',
      content: `Translate the following text to ${lang}:\n\n${text}`
    }
  ]
  return completeWithAgentProviders(appSettings, messages)
}

async function reformatText(appSettings, text, tones) {
  const messages = getReformatMessages(text, tones)
  return completeWithAgentProviders(appSettings, messages)
}

async function aiEditText(appSettings, text, action, extra = {}) {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (!trimmed) throw new Error('Select some text first')

  const resolvedAction = typeof action === 'string' && action ? action : 'improve'
  if (resolvedAction === 'custom') {
    const instr = typeof extra?.instruction === 'string' ? extra.instruction.trim() : ''
    if (!instr) throw new Error('Enter a prompt for AI')
  }

  const messages = getAiSelectionMessages(trimmed, resolvedAction, extra && typeof extra === 'object' ? extra : {})
  return completeWithAgentProviders(appSettings, messages)
}

module.exports = {
  translateText,
  reformatText,
  aiEditText,
  getReformatMessages,
  getAiSelectionMessages,
  completeWithAgentProviders
}
