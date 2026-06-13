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

  const normalized = normalizeMessagesForOpenAi([legacy])[0]
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

  const apiReady = normalizeMessagesForOpenAi([{
    role: 'assistant',
    content: null,
    tool_calls: [persisted]
  }])[0]
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
testUserMessageWithImagesForOpenAi()
testImagesOnlyUserMessageForOpenAi()

console.log('agentMessageFormat unit tests passed')
