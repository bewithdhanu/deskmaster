const {
  normalizeMessagesForOpenAi,
  repairPersistedMessages,
  toPersistedToolCall
} = require('../../agentMessageFormat')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function testLegacyToolCallsNormalizeForOpenAi() {
  const legacy = {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: 'call_WwObskykskLr0Is6O1rx9NOI',
      name: 'get_public_ip',
      arguments: '{}'
    }]
  }

  const normalized = normalizeMessagesForOpenAi([
    legacy,
    {
      role: 'tool',
      tool_call_id: 'call_WwObskykskLr0Is6O1rx9NOI',
      content: '{"ip":"1.2.3.4"}'
    }
  ])[0]
  assert(normalized.tool_calls[0].type === 'function', 'tool call must include type')
  assert(normalized.tool_calls[0].function.name === 'get_public_ip', 'tool name preserved')
  assert(normalized.tool_calls[0].function.arguments === '{}', 'tool arguments preserved')
}

function testPersistedRoundTrip() {
  const persisted = toPersistedToolCall({
    id: 'call_abc',
    name: 'get_public_ip',
    arguments: '{}'
  })
  assert(persisted.name === 'get_public_ip', 'persisted name')

  const apiReady = normalizeMessagesForOpenAi([
    {
      role: 'assistant',
      content: null,
      tool_calls: [persisted]
    },
    {
      role: 'tool',
      tool_call_id: 'call_abc',
      content: '{"ip":"1.2.3.4"}'
    }
  ])[0]
  assert(apiReady.tool_calls[0].type === 'function', 'round-trip type')
}

function testRepairPersistedMessages() {
  const repaired = repairPersistedMessages([
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_x', name: 'tool_a', arguments: '{}' }],
      timestamp: '2026-01-01T00:00:00.000Z'
    },
    {
      role: 'tool',
      tool_call_id: 'call_x',
      content: { ip: '1.2.3.4' },
      timestamp: '2026-01-01T00:00:00.000Z'
    }
  ])

  assert(repaired[0].timestamp, 'repair keeps metadata')
  assert(repaired[1].content === '{"ip":"1.2.3.4"}', 'repair stringifies tool content')
}

function testRepairOrphanedToolCalls() {
  const repaired = repairPersistedMessages([
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_orphan', name: 'tool_a', arguments: '{}' }]
    },
    {
      role: 'user',
      content: 'hello'
    }
  ])

  assert(!repaired[0].tool_calls, 'orphaned tool_calls removed without pending confirmation')
  assert(repaired[0].content.includes('interrupted'), 'placeholder content added')
  assert(repaired[1].role === 'user', 'user message kept')
}

function testRepairPendingConfirmationKeepsToolCalls() {
  const repaired = repairPersistedMessages([
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_orphan', name: 'tool_a', arguments: '{}' }]
    },
    {
      role: 'assistant',
      content: 'Please confirm to proceed.',
      pendingConfirmation: { toolCallId: 'call_orphan' }
    },
    {
      role: 'user',
      content: 'hello'
    }
  ])

  assert(repaired[0].tool_calls?.length === 1, 'pending confirmation keeps tool_calls')
  assert(repaired[0].tool_calls[0].id === 'call_orphan', 'tool call id preserved')
  assert(repaired[1].role === 'assistant', 'confirmation message kept')
}

function testNormalizeOpenAiStripsOrphanedToolCalls() {
  const normalized = normalizeMessagesForOpenAi([
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_MZz5Nhn6QN66kxQSAmGqkXwK', name: 'get_public_ip', arguments: '{}' }]
    },
    { role: 'user', content: 'try again' }
  ])

  assert(normalized.length === 2, 'assistant and user remain')
  assert(!normalized[0].tool_calls, 'orphaned tool_calls stripped before API')
}

function testUserMessageWithImagesForOpenAi() {
  const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
  const normalized = normalizeMessagesForOpenAi([{
    role: 'user',
    content: 'What is this?',
    images: [{ name: 'test.png', mediaType: 'image/png', dataUrl }]
  }])[0]

  assert(Array.isArray(normalized.content), 'multimodal content is array')
  assert(normalized.content[0].type === 'text', 'text part first')
  assert(normalized.content[1].type === 'image_url', 'image part second')
  assert(normalized.content[1].image_url.url === dataUrl, 'data url preserved')
}

function testImagesOnlyUserMessageForOpenAi() {
  const dataUrl = 'data:image/jpeg;base64,abc123'
  const normalized = normalizeMessagesForOpenAi([{
    role: 'user',
    content: '',
    images: [{ name: 'photo.jpg', mediaType: 'image/jpeg', dataUrl }]
  }])[0]

  assert(Array.isArray(normalized.content), 'images-only content is array')
  assert(normalized.content.length === 1, 'single image part')
  assert(normalized.content[0].type === 'image_url', 'image_url part')
}

testLegacyToolCallsNormalizeForOpenAi()
testPersistedRoundTrip()
testRepairPersistedMessages()
testRepairOrphanedToolCalls()
testRepairPendingConfirmationKeepsToolCalls()
testNormalizeOpenAiStripsOrphanedToolCalls()
testUserMessageWithImagesForOpenAi()
testImagesOnlyUserMessageForOpenAi()

console.log('agentMessageFormat unit tests passed')
