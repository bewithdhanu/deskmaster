const path = require('path')
const os = require('os')
const fs = require('fs')
const Module = require('module')

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmaster-agent-test-'))

const originalRequire = Module.prototype.require
Module.prototype.require = function (id) {
  if (id === 'electron') {
    return {
      app: {
        getPath: (name) => (name === 'userData' ? userDataDir : os.tmpdir())
      }
    }
  }
  return originalRequire.apply(this, arguments)
}

const agentChatStore = require('../../agentChatStore')

function testCreateChat() {
  const chat = agentChatStore.createChat({
    capabilities: {
      knowledgeBase: false,
      deskMasterTools: false,
      composioIntegrations: false
    }
  })

  if (!chat?.id) {
    throw new Error('createChat did not return an id')
  }

  agentChatStore.appendMessage(chat.id, {
    role: 'user',
    content: 'hello',
    timestamp: new Date().toISOString()
  })

  const listed = agentChatStore.listChats()
  const found = listed.find((c) => c.id === chat.id)
  if (!found) {
    throw new Error('created chat not found in listChats')
  }

  console.log('agentChatStore unit test passed:', chat.id)
}

testCreateChat()

try {
  fs.rmSync(userDataDir, { recursive: true, force: true })
} catch {}
