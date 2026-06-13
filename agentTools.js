const FORBIDDEN_TOOL_PREFIXES = ['clipboard_', 'authenticator_', 'get_totp', 'get_clipboard', 'search_clipboard']

let deps = null

function initAgentTools(dependencies) {
  deps = dependencies
}

function isForbiddenToolName(name) {
  const lower = String(name || '').toLowerCase()
  return FORBIDDEN_TOOL_PREFIXES.some((p) => lower.includes(p))
}

function buildToolDefinitions(enabledCategories = null) {
  if (!deps) return []
  const tools = getAllToolDefinitions()
  if (!enabledCategories) return tools.filter((t) => !isForbiddenToolName(t.name))
  return tools.filter((t) => enabledCategories.includes(t.category) && !isForbiddenToolName(t.name))
}

function getAllToolDefinitions() {
  return [
    {
      name: 'get_system_stats',
      description: 'Get current real-time CPU, RAM, disk, network, battery, and temperature statistics (snapshot only, not historical).',
      category: 'system',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      requiresConfirm: false
    },
    {
      name: 'query_system_stats_history',
      description: 'Query historical system performance from DeskMaster\'s Performance screen database (up to ~30 days). Returns sample counts, averages, min/max, and optional threshold counts (e.g. how many samples had CPU above 50%). Use for questions about past CPU/RAM/disk/network usage.',
      category: 'system',
      parameters: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            enum: ['1h', '6h', '24h', '7d', '30d'],
            description: 'Preset time range relative to now'
          },
          startTime: {
            type: 'string',
            description: 'Optional ISO start datetime (use with endTime for custom range)'
          },
          endTime: {
            type: 'string',
            description: 'Optional ISO end datetime (defaults to now)'
          },
          cpuThreshold: {
            type: 'number',
            description: 'If set, count how many stored samples had CPU usage >= this percent (e.g. 50 for above 50%)'
          }
        },
        additionalProperties: false
      },
      requiresConfirm: false
    },
    {
      name: 'get_app_version',
      description: 'Get the DeskMaster application version.',
      category: 'system',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      requiresConfirm: false
    },
    {
      name: 'notes_search',
      description: 'Search DeskMaster notes by keyword and return matching page titles and snippets.',
      category: 'notes',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query'],
        additionalProperties: false
      },
      requiresConfirm: false
    },
    {
      name: 'notes_get_page',
      description: 'Get the full text content of a note page by its ID.',
      category: 'notes',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Note page ID' }
        },
        required: ['id'],
        additionalProperties: false
      },
      requiresConfirm: false
    },
    {
      name: 'notes_create_page',
      description: 'Create a new note page with optional title and type (canvas, markdown, or text).',
      category: 'notes',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['canvas', 'markdown', 'text'] },
          parentId: { type: 'string', description: 'Optional parent note ID' }
        },
        required: ['title'],
        additionalProperties: false
      },
      requiresConfirm: true
    },
    {
      name: 'notes_save_page',
      description: 'Save text content to an existing text or markdown note page.',
      category: 'notes',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          text: { type: 'string' }
        },
        required: ['id', 'text'],
        additionalProperties: false
      },
      requiresConfirm: true
    },
    {
      name: 'bcrypt_generate',
      description: 'Generate a bcrypt hash for the given text.',
      category: 'tools',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false
      },
      requiresConfirm: false
    },
    {
      name: 'bcrypt_verify',
      description: 'Verify text against a bcrypt hash.',
      category: 'tools',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          hash: { type: 'string' }
        },
        required: ['text', 'hash'],
        additionalProperties: false
      },
      requiresConfirm: false
    },
    {
      name: 'get_public_ip',
      description: 'Get the public IP address of this machine.',
      category: 'tools',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      requiresConfirm: false
    },
    {
      name: 'get_ip_location',
      description: 'Look up geographic location, ISP, and coordinates for IP address(es) using the built-in IP Location Lookup tool (IPGeolocation.io). If no IP is given, looks up the current public IP.',
      category: 'tools',
      parameters: {
        type: 'object',
        properties: {
          ip: { type: 'string', description: 'Single IP address to look up' },
          ips: {
            type: 'array',
            items: { type: 'string' },
            description: 'Multiple IP addresses to look up'
          }
        },
        additionalProperties: false
      },
      requiresConfirm: false
    },
    {
      name: 'translate_text',
      description: 'Translate text to a target language using AI.',
      category: 'tools',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          targetLanguage: { type: 'string' }
        },
        required: ['text', 'targetLanguage'],
        additionalProperties: false
      },
      requiresConfirm: false
    },
    {
      name: 'reformat_text',
      description: 'Reformat or rewrite text with optional tone instructions.',
      category: 'tools',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          tones: { type: 'string', description: 'Optional tone instructions' }
        },
        required: ['text'],
        additionalProperties: false
      },
      requiresConfirm: false
    },
    {
      name: 'uptime_list_monitors',
      description: 'List Uptime Kuma monitors if Uptime Kuma is enabled and configured.',
      category: 'uptime',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      requiresConfirm: false
    },
    {
      name: 'gdrive_status',
      description: 'Get Google Drive backup connection and last backup status.',
      category: 'cloud',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      requiresConfirm: false
    },
    {
      name: 'gdrive_backup_now',
      description: 'Trigger an immediate Google Drive backup.',
      category: 'cloud',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      requiresConfirm: true
    },
    {
      name: 'get_settings_summary',
      description: 'Get a non-sensitive summary of DeskMaster settings (theme, enabled stats, timezone count).',
      category: 'settings',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      requiresConfirm: false
    },
    {
      name: 'kb_search',
      description: 'Semantic search across the knowledge base (notes and custom documents).',
      category: 'kb',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' }
        },
        required: ['query'],
        additionalProperties: false
      },
      requiresConfirm: false
    },
    {
      name: 'kb_list_documents',
      description: 'List custom knowledge base documents.',
      category: 'kb',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      requiresConfirm: false
    },
    {
      name: 'kb_create_document',
      description: 'Create a new custom knowledge base document.',
      category: 'kb',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['title', 'content'],
        additionalProperties: false
      },
      requiresConfirm: true
    },
    {
      name: 'kb_update_document',
      description: 'Update an existing custom knowledge base document.',
      category: 'kb',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      },
      requiresConfirm: true
    }
  ]
}

function getToolMeta(name) {
  return getAllToolDefinitions().find((t) => t.name === name)
}

async function executeTool(name, args, { confirmed = false, agentSettings } = {}) {
  if (!deps) throw new Error('Agent tools not initialized')
  if (isForbiddenToolName(name)) {
    throw new Error('This tool is not available to the agent for security reasons.')
  }

  const meta = getToolMeta(name)
  if (!meta) throw new Error(`Unknown tool: ${name}`)
  if (meta.requiresConfirm && !confirmed) {
    return {
      requiresConfirmation: true,
      tool: name,
      arguments: args,
      message: `Tool "${name}" requires user confirmation before execution.`
    }
  }

  switch (name) {
    case 'get_system_stats':
      return deps.getSystemStats()
    case 'query_system_stats_history':
      return deps.querySystemStatsHistory(args)
    case 'get_app_version':
      return { version: deps.getAppVersion() }
    case 'notes_search':
      return deps.notesSearch(args.query)
    case 'notes_get_page':
      return deps.notesGetPage(args.id)
    case 'notes_create_page':
      return deps.notesCreatePage(args)
    case 'notes_save_page':
      return deps.notesSavePage(args.id, args.text)
    case 'bcrypt_generate':
      return deps.bcryptGenerate(args.text)
    case 'bcrypt_verify':
      return deps.bcryptVerify(args.text, args.hash)
    case 'get_public_ip':
      return deps.getPublicIp()
    case 'get_ip_location': {
      let ips = Array.isArray(args.ips) ? args.ips.filter(Boolean) : []
      if (args.ip) ips.push(args.ip)
      if (!ips.length) {
        const publicIp = await deps.getPublicIp()
        ips = [publicIp]
      }
      return deps.getIpLocation(ips)
    }
    case 'translate_text':
      return { translated: await deps.translateText(args.text, args.targetLanguage) }
    case 'reformat_text':
      return { result: await deps.reformatText(args.text, args.tones) }
    case 'uptime_list_monitors':
      return deps.uptimeListMonitors()
    case 'gdrive_status':
      return deps.gdriveStatus()
    case 'gdrive_backup_now':
      return deps.gdriveBackupNow()
    case 'get_settings_summary':
      return deps.getSettingsSummary()
    case 'kb_search':
      return deps.kbSearch(args.query, args.limit, agentSettings)
    case 'kb_list_documents':
      return deps.kbListDocuments()
    case 'kb_create_document':
      return deps.kbCreateDocument(args.title, args.content, agentSettings)
    case 'kb_update_document':
      return deps.kbUpdateDocument(args.id, args, agentSettings)
    default:
      throw new Error(`Tool handler not implemented: ${name}`)
  }
}

module.exports = {
  initAgentTools,
  buildToolDefinitions,
  getToolMeta,
  executeTool,
  isForbiddenToolName,
  FORBIDDEN_TOOL_PREFIXES
}
