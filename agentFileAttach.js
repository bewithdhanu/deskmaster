const fs = require('fs')
const path = require('path')
const { nativeImage } = require('electron')
const {
  DOCUMENT_EXTENSIONS,
  extractDocumentFromPath,
  MAX_FILE_BYTES
} = require('./agentDocumentExtract')

const MAX_CHAT_ATTACHMENTS = 8
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'])
const ALL_EXTENSIONS = [...new Set([...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS])]

function isImageExtension(ext) {
  return IMAGE_EXTENSIONS.has(String(ext || '').toLowerCase())
}

function readImageAttachmentFromPath(filePath) {
  const stat = fs.statSync(filePath)
  if (stat.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (max ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB): ${path.basename(filePath)}`)
  }

  const image = nativeImage.createFromPath(filePath)
  if (!image || image.isEmpty()) {
    throw new Error(`Could not read image: ${path.basename(filePath)}`)
  }

  const png = image.toPNG()
  const base64 = png.toString('base64')

  return {
    kind: 'image',
    name: path.basename(filePath),
    mediaType: 'image/png',
    dataUrl: `data:image/png;base64,${base64}`
  }
}

async function readAttachmentFromPath(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  if (!ALL_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type: ${path.basename(filePath)}`)
  }
  if (isImageExtension(ext)) {
    return readImageAttachmentFromPath(filePath)
  }
  return extractDocumentFromPath(filePath)
}

async function readAttachmentsFromPaths(filePaths, existingCount = 0) {
  const remaining = Math.max(0, MAX_CHAT_ATTACHMENTS - existingCount)
  if (!remaining) {
    throw new Error(`Maximum ${MAX_CHAT_ATTACHMENTS} attachments per message`)
  }

  const attachments = []
  for (const filePath of filePaths.slice(0, remaining)) {
    attachments.push(await readAttachmentFromPath(filePath))
  }
  return attachments
}

function splitAttachments(attachments) {
  const images = []
  const files = []
  for (const item of attachments || []) {
    if (!item) continue
    if (item.kind === 'image' || item.dataUrl) {
      images.push({
        name: item.name,
        mediaType: item.mediaType || 'image/png',
        dataUrl: item.dataUrl
      })
    } else if (item.kind === 'document' || item.extractedText) {
      files.push({
        kind: 'document',
        name: item.name,
        mediaType: item.mediaType || 'text/plain',
        extractedText: item.extractedText,
        size: item.size
      })
    }
  }
  return { images, files }
}

module.exports = {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_IMAGES: MAX_CHAT_ATTACHMENTS,
  MAX_IMAGE_BYTES,
  MAX_FILE_BYTES,
  IMAGE_EXTENSIONS,
  ALL_EXTENSIONS,
  readImageAttachmentFromPath,
  readImageAttachmentsFromPaths: readAttachmentsFromPaths,
  readAttachmentsFromPaths,
  readAttachmentFromPath,
  splitAttachments,
  isImageExtension
}
