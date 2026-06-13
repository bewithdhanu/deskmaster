export const PROVIDER_META = {
  openai: { label: 'OpenAI' },
  anthropic: { label: 'Anthropic' },
  openrouter: { label: 'OpenRouter' },
  bedrock: { label: 'AWS Bedrock' },
  local: { label: 'Local Server' }
}

function providerHasCredentials(providerId, p) {
  if (!p) return false
  switch (providerId) {
    case 'openai':
    case 'anthropic':
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

export function isProviderEnabled(agentSettings, providerId) {
  const agent = agentSettings?.agent || agentSettings || {}
  return providerHasCredentials(providerId, agent.providers?.[providerId])
}

export function getEnabledProviders(agentSettings) {
  return Object.keys(PROVIDER_META).filter((id) => isProviderEnabled(agentSettings, id))
}

export function getProviderModel(agentSettings, providerId) {
  const agent = agentSettings?.agent || agentSettings || {}
  const p = agent.providers?.[providerId]
  return p?.model || agent.defaultModel || ''
}
