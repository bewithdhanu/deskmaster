let ComposioClass = null

try {
  ({ Composio: ComposioClass } = require('@composio/core'))
} catch (error) {
  console.warn('Composio SDK not available:', error.message)
}

function getComposioClient(apiKey) {
  if (!ComposioClass) throw new Error('Composio SDK is not installed')
  if (!apiKey) throw new Error('Composio API key not configured in Settings > Agent')
  return new ComposioClass({ apiKey })
}

function normalizeToolkitSlug(slug) {
  return String(slug || '').toLowerCase().trim()
}

function matchesToolkit(accountToolkit, toolkitSlug) {
  return normalizeToolkitSlug(accountToolkit) === normalizeToolkitSlug(toolkitSlug)
}

const waitAbortControllers = new Map()

function cancelWaitForConnection(toolkitSlug) {
  const key = normalizeToolkitSlug(toolkitSlug)
  const controller = waitAbortControllers.get(key)
  if (controller) {
    controller.abort()
    waitAbortControllers.delete(key)
    return true
  }
  return false
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Connection cancelled'))
      return
    }
    const timer = setTimeout(resolve, ms)
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(new Error('Connection cancelled'))
        },
        { once: true }
      )
    }
  })
}

function getCustomToolkits(agentSettings) {
  return agentSettings?.composio?.customToolkits || []
}

function extractToolkitSlug(raw) {
  if (!raw) return ''
  if (typeof raw.toolkit === 'string') return raw.toolkit
  if (raw.toolkit?.slug) return raw.toolkit.slug
  if (raw.toolkitSlug) return raw.toolkitSlug
  if (raw.appName) return raw.appName
  if (raw.appUniqueId) return raw.appUniqueId
  return ''
}

function normalizeAccountStatus(status) {
  return String(status || '').trim().toUpperCase()
}

function isActiveAccountStatus(status) {
  const normalized = normalizeAccountStatus(status)
  return normalized === 'ACTIVE' || normalized === 'CONNECTED' || normalized === 'ENABLED'
}

function isPendingAccountStatus(status) {
  const normalized = normalizeAccountStatus(status)
  return normalized === 'INITIATED' || normalized === 'PENDING' || normalized === 'INITIALIZING'
}

function pickFirstString(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function isLikelyEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function isLikelySecretKey(key) {
  return /token|secret|password|api[_-]?key|access|refresh|bearer|oauth|credential|authorization|signature|private/i.test(
    String(key || '')
  )
}

function isLikelySecretValue(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return true
  if (trimmed.length > 160) return true
  if (/^(gho_|ghr_|ghp_|sk-|xox[baprs]-|Bearer\s)/i.test(trimmed)) return true
  if (/gAAAAA/.test(trimmed)) return true
  if (trimmed.endsWith('...') && trimmed.length <= 32) return true
  if (/^REDACTED$/i.test(trimmed)) return true
  return false
}

function unwrapToolResult(result) {
  if (!result) return result
  if (result.successful === false) return null

  if (typeof result.data === 'string') {
    try {
      const parsed = JSON.parse(result.data)
      return unwrapToolResult({ data: parsed })
    } catch {
      return result.data
    }
  }

  if (result.data && typeof result.data === 'object') {
    if (result.data.data && typeof result.data.data === 'object') return result.data.data
    return result.data
  }

  return result
}

function collectLabelCandidates(raw, depth = 0, keyPath = '') {
  if (!raw || depth > 6) return []

  if (typeof raw === 'string') {
    const value = raw.trim()
    if (!value || isLikelySecretValue(value)) return []
    return [{ value, keyPath, score: scoreLabelCandidate(keyPath, value) }]
  }

  if (Array.isArray(raw)) {
    return raw.flatMap((item, index) => collectLabelCandidates(item, depth + 1, `${keyPath}[${index}]`))
  }

  if (typeof raw !== 'object') return []

  const results = []
  for (const [key, value] of Object.entries(raw)) {
    if (isLikelySecretKey(key)) continue
    const nextPath = keyPath ? `${keyPath}.${key}` : key
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed && !isLikelySecretValue(trimmed)) {
        results.push({ value: trimmed, keyPath: nextPath, score: scoreLabelCandidate(nextPath, trimmed) })
      }
      continue
    }
    results.push(...collectLabelCandidates(value, depth + 1, nextPath))
  }
  return results
}

function scoreLabelCandidate(keyPath, value) {
  const key = String(keyPath || '').toLowerCase()
  if (isLikelyEmail(value)) return 100
  if (/email|mail_address|emailaddress|primaryemail|user_email/.test(key)) return 95
  if (/displayname|full_name|fullname|real_name/.test(key)) return 85
  if (/^(name|username|login|user|account|company|organization|org|site_name|subdomain|domain)$/.test(key.split('.').pop() || '')) {
    return 80
  }
  if (/label|title|handle/.test(key)) return 70
  if (/url|uri|http/.test(key)) return 10
  return 40
}

function pickBestLabelCandidate(candidates) {
  if (!candidates.length) return ''
  const sorted = [...candidates].sort((a, b) => b.score - a.score)
  const email = sorted.find((candidate) => isLikelyEmail(candidate.value))
  if (email) return email.value

  const displayName = sorted.find((candidate) => /displayname|full_name|fullname|real_name|\.name$/i.test(candidate.keyPath))
  const login = sorted.find((candidate) => /login|username|handle/i.test(candidate.keyPath))
  if (displayName && login && displayName.value !== login.value) {
    const handle = login.value.replace(/^@/, '')
    return `${displayName.value} (@${handle})`
  }

  return sorted[0]?.value || ''
}

function isGenericAccountLabel(label) {
  if (!label) return true
  return label === 'Connected account' || /^Account …/.test(label)
}

const TOOLKIT_PROFILE_LOOKUPS = {
  gmail: [{ tool: 'GMAIL_GET_PROFILE', arguments: { user_id: 'me' } }],
  googlecalendar: [{ tool: 'GMAIL_GET_PROFILE', arguments: { user_id: 'me' } }],
  github: [{ tool: 'GITHUB_GET_THE_AUTHENTICATED_USER', arguments: {} }],
  bitbucket: [{ tool: 'BITBUCKET_GET_CURRENT_USER', arguments: {} }],
  outlook: [{ tool: 'OUTLOOK_GET_PROFILE', arguments: {} }],
  reddit: [{ tool: 'REDDIT_GET_MY_USER', arguments: {} }],
  microsoft_teams: [{ tool: 'MICROSOFT_TEAMS_GET_USER', arguments: {} }]
}

const accountLabelCache = new Map()

function deriveAccountLabel(raw) {
  const alias = pickFirstString([raw?.alias])
  if (alias) return alias

  const deprecatedLabels = raw?.deprecated?.labels
  if (Array.isArray(deprecatedLabels)) {
    const deprecatedLabel = pickFirstString(deprecatedLabels)
    if (deprecatedLabel) return deprecatedLabel
  }

  const member = raw?.member || raw?.memberInfo || raw?.user || {}
  const stateVal = raw?.state?.val || (raw?.state?.authScheme || raw?.state?.auth_scheme ? raw.state.val : raw?.state) || {}
  const params = raw?.connectionParams || raw?.connection_params || raw?.params || raw?.data || {}

  const direct = pickFirstString([
    member.email,
    member.primaryEmail,
    member.username,
    member.login,
    member.name,
    member.displayName,
    stateVal.email,
    stateVal.user_email,
    stateVal.userEmail,
    stateVal.username,
    stateVal.login,
    stateVal.name,
    stateVal.display_name,
    stateVal.displayName,
    stateVal.company,
    stateVal.organization,
    stateVal.account_url,
    stateVal.subdomain,
    stateVal.site_name,
    params.email,
    params.username,
    params.user,
    params.name,
    params.displayName,
    params.company,
    params.organization,
    raw?.email,
    raw?.username,
    raw?.name,
    raw?.displayName
  ])
  if (direct) return direct

  const candidates = collectLabelCandidates(raw)
  const best = pickBestLabelCandidate(candidates)
  if (best) return best

  const toolkit = extractToolkitSlug(raw)
  if (toolkit) return toolkit.replace(/_/g, ' ')
  return 'Connected account'
}

function extractLabelFromToolResult(result) {
  const unwrapped = unwrapToolResult(result)
  if (!unwrapped) return ''

  const direct = pickFirstString([
    unwrapped.emailAddress,
    unwrapped.email_address,
    unwrapped.email,
    unwrapped.mail,
    unwrapped.userPrincipalName,
    unwrapped.primaryEmail,
    unwrapped.login,
    unwrapped.username,
    unwrapped.name,
    unwrapped.display_name,
    unwrapped.displayName
  ])
  if (direct) return direct

  const candidates = collectLabelCandidates(unwrapped)
  return pickBestLabelCandidate(candidates)
}

async function fetchAccountLabelViaProfileTool(agentSettings, account) {
  const slug = normalizeToolkitSlug(account.toolkit)
  const lookups = TOOLKIT_PROFILE_LOOKUPS[slug]
  if (!lookups?.length) return ''

  const apiKey = agentSettings?.composio?.apiKey
  const userId = agentSettings?.composio?.userId || 'deskmaster-local-user'
  if (!apiKey || !account?.id) return ''

  const composio = getComposioClient(apiKey)

  for (const lookup of lookups) {
    try {
      const result = await composio.tools.execute(lookup.tool, {
        userId,
        connectedAccountId: account.id,
        arguments: lookup.arguments || {}
      })
      const label = extractLabelFromToolResult(result)
      if (label && !isGenericAccountLabel(label)) return label
    } catch (error) {
      console.warn(`Composio profile lookup ${lookup.tool} failed:`, error.message)
    }
  }

  return ''
}

async function resolveAccountDisplayLabel(agentSettings, raw, accountSeed = null) {
  const mapped = raw ? mapConnectedAccount(raw) : { ...(accountSeed || {}) }
  if (accountSeed) {
    mapped.id = accountSeed.id || mapped.id
    mapped.toolkit = accountSeed.toolkit || mapped.toolkit
    mapped.status = accountSeed.status || mapped.status
    mapped.alias = accountSeed.alias || mapped.alias
    if (!isGenericAccountLabel(accountSeed.label)) mapped.label = accountSeed.label
  }

  if (!isGenericAccountLabel(mapped.label)) {
    accountLabelCache.set(mapped.id, mapped.label)
    return mapped.label
  }

  const cached = accountLabelCache.get(mapped.id)
  if (cached && !isGenericAccountLabel(cached)) return cached

  const profileLabel = await fetchAccountLabelViaProfileTool(agentSettings, mapped)
  if (profileLabel) {
    accountLabelCache.set(mapped.id, profileLabel)
    return profileLabel
  }

  return mapped.label
}

function mapConnectedAccount(raw) {
  return {
    id: raw.id,
    toolkit: extractToolkitSlug(raw),
    status: normalizeAccountStatus(raw.status) || raw.status,
    alias: raw.alias || '',
    label: deriveAccountLabel(raw),
    createdAt: raw.createdAt
  }
}

async function enrichConnectedAccountLabel(agentSettings, account) {
  if (!account?.id) return account

  const cached = accountLabelCache.get(account.id)
  if (cached && !isGenericAccountLabel(cached)) {
    return { ...account, label: cached }
  }

  if (!isGenericAccountLabel(account.label)) {
    accountLabelCache.set(account.id, account.label)
    return account
  }

  const apiKey = agentSettings?.composio?.apiKey
  if (!apiKey) return account

  try {
    const composio = getComposioClient(apiKey)
    const full = await composio.connectedAccounts.get(account.id)
    const label = await resolveAccountDisplayLabel(agentSettings, full, {
      ...account,
      toolkit: account.toolkit || extractToolkitSlug(full),
      status: account.status || normalizeAccountStatus(full.status) || full.status,
      alias: full.alias || account.alias
    })
    return {
      ...account,
      label,
      alias: full.alias || account.alias,
      toolkit: account.toolkit || extractToolkitSlug(full),
      status: account.status || normalizeAccountStatus(full.status) || full.status
    }
  } catch (error) {
    const profileLabel = await fetchAccountLabelViaProfileTool(agentSettings, account)
    if (profileLabel) {
      accountLabelCache.set(account.id, profileLabel)
      return { ...account, label: profileLabel }
    }
    return account
  }
}

async function getConnectedToolkits(agentSettings) {
  const apiKey = agentSettings?.composio?.apiKey
  const userId = agentSettings?.composio?.userId || 'deskmaster-local-user'
  if (!apiKey) return []

  try {
    const composio = getComposioClient(apiKey)
    const accounts = await composio.connectedAccounts.list({ userIds: [userId] })
    const items = accounts?.items || accounts?.data || accounts || []
    const mapped = items.map((a) => mapConnectedAccount(a))
    return Promise.all(mapped.map((account) => enrichConnectedAccountLabel(agentSettings, account)))
  } catch (error) {
    console.error('Composio list connected accounts error:', error.message)
    return []
  }
}

async function listAvailableToolkits(agentSettings) {
  const custom = getCustomToolkits(agentSettings)
  const connected = await getConnectedToolkits(agentSettings)

  return custom.map((slug) => {
    const accounts = connected.filter(
      (account) => matchesToolkit(account.toolkit, slug) && isActiveAccountStatus(account.status)
    )
    return {
      slug,
      name: slug,
      accounts,
      connected: accounts.length > 0,
      accountId: accounts[0]?.id
    }
  })
}

async function cleanupPendingConnections(agentSettings, toolkitSlug) {
  const accounts = await getConnectedToolkits(agentSettings)
  for (const account of accounts) {
    if (matchesToolkit(account.toolkit, toolkitSlug) && !isActiveAccountStatus(account.status)) {
      try {
        await disconnectToolkit(agentSettings, account.id)
      } catch (error) {
        console.warn(`Composio cleanup pending account ${account.id}:`, error.message)
      }
    }
  }
}

async function initiateToolkitConnection(agentSettings, toolkitSlug, openExternal, options = {}) {
  const apiKey = agentSettings?.composio?.apiKey
  const userId = agentSettings?.composio?.userId || 'deskmaster-local-user'
  const composio = getComposioClient(apiKey)

  const existing = await getConnectedToolkits(agentSettings)
  const sameToolkit = existing.filter((account) => matchesToolkit(account.toolkit, toolkitSlug))
  const knownAccountIds = sameToolkit.map((account) => account.id)

  cancelWaitForConnection(toolkitSlug)
  await cleanupPendingConnections(agentSettings, toolkitSlug)

  const alias =
    options.alias ||
    (sameToolkit.length > 0 ? `${normalizeToolkitSlug(toolkitSlug)}-${sameToolkit.length + 1}` : undefined)

  let redirectUrl = null
  let connectionRequestId = null

  try {
    const linkOptions = {
      ...(alias ? { alias } : {}),
      ...(sameToolkit.length > 0 ? { allowMultiple: true } : {})
    }
    const link = await composio.connectedAccounts.link(userId, toolkitSlug, linkOptions)
    redirectUrl = link?.redirectUrl || link?.redirect_url || link?.url
    connectionRequestId = link?.id || link?.connectedAccountId || link?.connected_account_id || null
  } catch (linkErr) {
    try {
      const session = await composio.create(userId, {
        multiAccount: { enable: true, maxAccountsPerToolkit: 10 }
      })
      const authorizeOptions = {
        ...(alias ? { alias } : {}),
        ...(sameToolkit.length > 0 ? { allowMultiple: true } : {})
      }
      const initiate = await session.authorize(toolkitSlug, authorizeOptions)
      redirectUrl = initiate?.redirectUrl || initiate?.redirect_url || initiate?.url
      connectionRequestId = initiate?.id || initiate?.connectedAccountId || null
    } catch (authErr) {
      throw new Error(linkErr.message || authErr.message || 'Failed to initiate OAuth')
    }
  }

  if (!redirectUrl) throw new Error('Composio did not return an OAuth URL')

  if (openExternal) await openExternal(redirectUrl)

  return {
    redirectUrl,
    toolkit: toolkitSlug,
    knownAccountIds,
    connectionRequestId,
    alias: alias || null
  }
}

async function waitForConnection(
  agentSettings,
  toolkitSlug,
  { timeoutMs = 120000, pollMs = 3000, signal, knownAccountIds = [], connectionRequestId } = {}
) {
  const key = normalizeToolkitSlug(toolkitSlug)
  const controller = new AbortController()
  waitAbortControllers.set(key, controller)

  const onExternalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  const apiKey = agentSettings?.composio?.apiKey
  const composio = apiKey ? getComposioClient(apiKey) : null
  const knownIds = new Set(Array.isArray(knownAccountIds) ? knownAccountIds : [])

  try {
    if (connectionRequestId && composio?.connectedAccounts?.waitForConnection) {
      try {
        const account = await composio.connectedAccounts.waitForConnection(connectionRequestId, {
          timeout: timeoutMs
        })
        if (account) {
          invalidateAgentSession()
          const mapped = mapConnectedAccount(account)
          const label = await resolveAccountDisplayLabel(agentSettings, account, mapped)
          return { ...mapped, label }
        }
      } catch (error) {
        console.warn(`Composio waitForConnection(${connectionRequestId}) failed:`, error.message)
      }
    }

    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (controller.signal.aborted) throw new Error('Connection cancelled')

      const connected = await getConnectedToolkits(agentSettings)
      const match = connected.find(
        (account) =>
          matchesToolkit(account.toolkit, toolkitSlug) &&
          isActiveAccountStatus(account.status) &&
          !knownIds.has(account.id)
      )
      if (match) {
        invalidateAgentSession()
        const label = await resolveAccountDisplayLabel(agentSettings, null, match)
        return { ...match, label }
      }

      await delay(pollMs, controller.signal)
    }

    throw new Error(`Connection to ${toolkitSlug} timed out. Complete OAuth in your browser and try again.`)
  } finally {
    waitAbortControllers.delete(key)
    if (signal) signal.removeEventListener('abort', onExternalAbort)
  }
}

async function disconnectToolkit(agentSettings, accountId) {
  const apiKey = agentSettings?.composio?.apiKey
  const composio = getComposioClient(apiKey)
  await composio.connectedAccounts.delete(accountId)
  accountLabelCache.delete(accountId)
  invalidateAgentSession()
  return { success: true }
}

async function getActiveToolkitSlugs(agentSettings) {
  const connected = await getConnectedToolkits(agentSettings)
  return [...new Set(connected.filter((c) => isActiveAccountStatus(c.status)).map((c) => c.toolkit).filter(Boolean))]
}

let cachedAgentSession = null
let cachedSessionKey = null

function invalidateAgentSession() {
  cachedAgentSession = null
  cachedSessionKey = null
}

async function resolveAgentSessionToolkits(agentSettings) {
  const connectedSlugs = await getActiveToolkitSlugs(agentSettings)
  const customSlugs = getCustomToolkits(agentSettings).map(normalizeToolkitSlug).filter(Boolean)
  return [...new Set([...connectedSlugs, ...customSlugs].map(normalizeToolkitSlug).filter(Boolean))]
}

/**
 * One Tool Router session per connected-toolkit set. Uses Composio meta tools
 * (search / schema / multi-execute) so any connected app works without hardcoded slugs.
 */
async function getOrCreateAgentSession(agentSettings) {
  const apiKey = agentSettings?.composio?.apiKey
  const userId = agentSettings?.composio?.userId || 'deskmaster-local-user'
  if (!apiKey) return null

  const toolkits = await resolveAgentSessionToolkits(agentSettings)
  if (!toolkits.length) return null

  const sessionKey = `${userId}:${toolkits.sort().join(',')}`
  if (cachedAgentSession && cachedSessionKey === sessionKey) {
    return { session: cachedAgentSession, toolkits }
  }

  const composio = getComposioClient(apiKey)
  const session = await composio.create(userId, {
    toolkits,
    multiAccount: { enable: true, maxAccountsPerToolkit: 10 }
  })

  cachedAgentSession = session
  cachedSessionKey = sessionKey
  return { session, toolkits }
}

function mapComposioToolDefinitions(tools) {
  if (!Array.isArray(tools)) return []

  return tools.map((tool) => ({
    name: tool.name || tool.function?.name,
    description: tool.description || tool.function?.description || '',
    parameters: tool.parameters || tool.function?.parameters || { type: 'object', properties: {} },
    composio: true,
    composioToolName: tool.name || tool.function?.name
  })).filter((t) => t.name)
}

async function getComposioTools(agentSettings) {
  const sessionInfo = await getOrCreateAgentSession(agentSettings)
  if (!sessionInfo?.session) return []

  try {
    const tools = await sessionInfo.session.tools()
    return mapComposioToolDefinitions(tools)
  } catch (error) {
    console.error('Composio session.tools() failed:', error.message)
    invalidateAgentSession()
    return []
  }
}

async function executeComposioTool(agentSettings, toolName, args) {
  const sessionInfo = await getOrCreateAgentSession(agentSettings)
  if (!sessionInfo?.session) {
    throw new Error('No Composio integrations are connected')
  }

  const toolArgs = { ...(args && typeof args === 'object' ? args : {}) }
  const connectedAccountId = toolArgs.connectedAccountId || toolArgs.account || undefined
  delete toolArgs.connectedAccountId
  delete toolArgs.account

  const executeOptions = connectedAccountId ? { account: connectedAccountId } : undefined
  return await sessionInfo.session.execute(toolName, toolArgs, executeOptions)
}

module.exports = {
  listAvailableToolkits,
  getConnectedToolkits,
  initiateToolkitConnection,
  waitForConnection,
  cancelWaitForConnection,
  disconnectToolkit,
  getComposioTools,
  executeComposioTool,
  invalidateAgentSession,
  getActiveToolkitSlugs,
  deriveAccountLabel,
  mapConnectedAccount
}
