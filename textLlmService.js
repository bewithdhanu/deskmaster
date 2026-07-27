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

const DEFAULT_IDENTITY_FIELDS = [
  { key: 'fullName', label: 'Full Name', description: 'A realistic full legal name that fits the selected country' },
  { key: 'address', label: 'Address', description: 'A realistic street address (street, city, region/state, postal code) in that country' },
  { key: 'phone', label: 'Phone', description: 'Primary phone number in a realistic local format for that country' },
  { key: 'secondaryPhone', label: 'Secondary Phone', description: 'A different alternate phone number in local format' },
  { key: 'email', label: 'Email', description: 'A realistic personal email address matching the name' },
  { key: 'workEmail', label: 'Work Email', description: 'A realistic work email that fits the job role and name' },
  { key: 'ssn', label: 'National ID / SSN', description: 'A fake national ID / SSN / tax ID in a plausible format for that country (must be clearly fictional)' },
  { key: 'jobRole', label: 'Job Role', description: 'A realistic job title / role' },
  { key: 'latitude', label: 'Latitude', description: 'Decimal latitude near the given address' },
  { key: 'longitude', label: 'Longitude', description: 'Decimal longitude near the given address' }
]

function normalizeCustomFields(customFields) {
  if (!Array.isArray(customFields)) return []
  return customFields
    .map((field, index) => {
      const name = typeof field?.name === 'string' ? field.name.trim() : ''
      const description = typeof field?.description === 'string' ? field.description.trim() : ''
      if (!name) return null
      const key = typeof field?.key === 'string' && field.key.trim()
        ? field.key.trim()
        : `custom_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || index}`
      return { key, name, description: description || name }
    })
    .filter(Boolean)
}

function parseJsonObjectFromModel(text) {
  const raw = String(text || '').trim()
  if (!raw) throw new Error('Empty response from model')

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : raw).trim()

  try {
    const parsed = JSON.parse(candidate)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch (_) {}

  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start !== -1 && end > start) {
    const sliced = candidate.slice(start, end + 1)
    const parsed = JSON.parse(sliced)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  }

  throw new Error('Model did not return valid JSON identity data')
}

function getFakeIdentityMessages(country, customFields = []) {
  const countryName = typeof country === 'string' && country.trim() ? country.trim() : 'United States'
  const extras = normalizeCustomFields(customFields)

  const fieldLines = [
    ...DEFAULT_IDENTITY_FIELDS.map((f) => `- "${f.key}": ${f.description}`),
    ...extras.map((f) => `- "${f.key}": ${f.description}`)
  ].join('\n')

  const keys = [
    ...DEFAULT_IDENTITY_FIELDS.map((f) => f.key),
    ...extras.map((f) => f.key)
  ]

  const systemPrompt = `You generate fictional identity profiles for software testing and UI demos only.
Rules:
1. All data must be fake and randomly generated — never use real people.
2. Names, addresses, phones, and IDs must match the conventions of the selected country.
3. Coordinates must be plausible for the address location.
4. Output a single JSON object only. No markdown, no commentary.
5. Use exactly these keys: ${keys.join(', ')}
6. Every value must be a string (including latitude/longitude).`

  const userPrompt = `Generate one random fake identity for country: ${countryName}.

Fields:
${fieldLines}

Return only the JSON object.`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]
}

async function generateFakeIdentity(appSettings, options = {}) {
  const country = typeof options.country === 'string' ? options.country : 'United States'
  const customFields = normalizeCustomFields(options.customFields)
  const messages = getFakeIdentityMessages(country, customFields)
  const text = await completeWithAgentProviders(appSettings, messages)
  const identity = parseJsonObjectFromModel(text)

  const result = { country }
  for (const field of DEFAULT_IDENTITY_FIELDS) {
    const value = identity[field.key]
    result[field.key] = value == null ? '' : String(value)
  }
  for (const field of customFields) {
    const value = identity[field.key]
    result[field.key] = value == null ? '' : String(value)
  }
  return result
}

module.exports = {
  translateText,
  reformatText,
  aiEditText,
  generateFakeIdentity,
  getReformatMessages,
  getAiSelectionMessages,
  getFakeIdentityMessages,
  DEFAULT_IDENTITY_FIELDS,
  completeWithAgentProviders
}
