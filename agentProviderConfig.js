const PROVIDER_META = {
  openai: { label: 'OpenAI' },
  anthropic: { label: 'Anthropic' },
  openrouter: { label: 'OpenRouter' },
  bedrock: { label: 'AWS Bedrock' },
  local: { label: 'Local Server' }
}

function isProviderConfigured(agentSettings, providerId) {
  const agent = agentSettings?.agent || agentSettings || {}
  const p = agent.providers?.[providerId]
  if (!p) return false

  switch (providerId) {
    case 'openai':
      return Boolean(p.apiKey || agent._legacyChatGptKey)
    case 'anthropic':
      return Boolean(p.apiKey)
    case 'openrouter':
      return Boolean(p.apiKey)
    case 'bedrock':
      return Boolean(p.accessKeyId && p.secretAccessKey)
    case 'local':
      return Boolean(p.baseUrl)
    default:
      return false
  }
}

function getEnabledProviders(agentSettings) {
  return Object.keys(PROVIDER_META).filter((id) => isProviderConfigured(agentSettings, id))
}

function getProviderModel(agentSettings, providerId) {
  const agent = agentSettings?.agent || agentSettings || {}
  const p = agent.providers?.[providerId]
  return p?.model || agent.defaultModel || ''
}

module.exports = {
  PROVIDER_META,
  isProviderConfigured,
  getEnabledProviders,
  getProviderModel
}
