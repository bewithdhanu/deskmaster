const fs = require('fs')
const path = require('path')
const { nativeImage } = require('electron')

const MAX_CHAT_IMAGES = 5
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'])

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
    name: path.basename(filePath),
    mediaType: 'image/png',
    dataUrl: `data:image/png;base64,${base64}`
  }
}

function readImageAttachmentsFromPaths(filePaths, existingCount = 0) {
  const remaining = Math.max(0, MAX_CHAT_IMAGES - existingCount)
  if (!remaining) {
    throw new Error(`Maximum ${MAX_CHAT_IMAGES} images per message`)
  }

  const attachments = []
  for (const filePath of filePaths.slice(0, remaining)) {
    const ext = path.extname(filePath).slice(1).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported image type: ${path.basename(filePath)}`)
    }
    attachments.push(readImageAttachmentFromPath(filePath))
  }
  return attachments
}

module.exports = {
  MAX_CHAT_IMAGES,
  MAX_IMAGE_BYTES,
  IMAGE_EXTENSIONS,
  readImageAttachmentFromPath,
  readImageAttachmentsFromPaths
}
