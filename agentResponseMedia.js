const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(([^)]+)\)/g
const MARKDOWN_VIDEO_RE = /\[([^\]]*)\]\((https?:\/\/[^\s)]+\.(?:mp4|webm|mov|m4v)(?:\?[^\s)]*)?)\)/gi
const DATA_IMAGE_RE = /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g
const URL_IMAGE_RE = /(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s"'<>]*)?)/gi
const URL_VIDEO_RE = /(https?:\/\/[^\s"'<>]+\.(?:mp4|webm|mov|m4v)(?:\?[^\s"'<>]*)?)/gi

function uniqueByUrl(items) {
  const seen = new Set()
  return items.filter((item) => {
    const key = item.url || item.dataUrl
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function extractMediaFromAssistantText(text) {
  const input = String(text || '')
  const attachments = []

  let match
  while ((match = MARKDOWN_IMAGE_RE.exec(input)) !== null) {
    const url = match[1].trim()
    if (url.startsWith('data:image/')) {
      attachments.push({ kind: 'image', dataUrl: url, name: 'Generated image' })
    } else {
      attachments.push({ kind: 'image', url, name: 'Image' })
    }
  }

  while ((match = MARKDOWN_VIDEO_RE.exec(input)) !== null) {
    attachments.push({ kind: 'video', url: match[2], name: match[1] || 'Video' })
  }

  for (const dataUrl of input.match(DATA_IMAGE_RE) || []) {
    attachments.push({ kind: 'image', dataUrl, name: 'Generated image' })
  }

  for (const url of input.match(URL_IMAGE_RE) || []) {
    attachments.push({ kind: 'image', url, name: 'Image' })
  }

  for (const url of input.match(URL_VIDEO_RE) || []) {
    attachments.push({ kind: 'video', url, name: 'Video' })
  }

  return uniqueByUrl(attachments)
}

function mergeAssistantAttachments(existing, incoming) {
  return uniqueByUrl([...(existing || []), ...(incoming || [])])
}

function attachmentFromInlineData(mimeType, base64, name = 'Generated image') {
  if (!mimeType || !base64) return null
  const kind = mimeType.startsWith('video/') ? 'video' : 'image'
  return {
    kind,
    mediaType: mimeType,
    dataUrl: `data:${mimeType};base64,${base64}`,
    name
  }
}

module.exports = {
  extractMediaFromAssistantText,
  mergeAssistantAttachments,
  attachmentFromInlineData
}
