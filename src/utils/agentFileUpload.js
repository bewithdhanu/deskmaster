export const MAX_CHAT_ATTACHMENTS = 8
export const MAX_CHAT_IMAGES = MAX_CHAT_ATTACHMENTS
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif'
]

export const ACCEPTED_DOCUMENT_EXTENSIONS = [
  'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt',
  'txt', 'md', 'markdown', 'json', 'html', 'htm', 'csv', 'xml', 'yaml', 'yml',
  'js', 'jsx', 'ts', 'tsx', 'css', 'log', 'sql', 'py', 'java', 'rtf'
]

const EXTENSION_MEDIA_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  json: 'application/json',
  html: 'text/html',
  htm: 'text/html',
  csv: 'text/csv'
}

function inferMediaType(file) {
  if (file?.type) return file.type
  const name = String(file?.name || '')
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  return EXTENSION_MEDIA_TYPES[ext] || 'application/octet-stream'
}

function isImageFile(file) {
  const mediaType = inferMediaType(file)
  if (mediaType.startsWith('image/')) return true
  const ext = String(file?.name || '').split('.').pop()?.toLowerCase()
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(ext)
}

function isDocumentFile(file) {
  const ext = String(file?.name || '').split('.').pop()?.toLowerCase()
  return ACCEPTED_DOCUMENT_EXTENSIONS.includes(ext)
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode image'))
    img.src = dataUrl
  })
}

async function normalizeToDisplayableDataUrl(file, dataUrl, mediaType) {
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
    try {
      await loadImageElement(dataUrl)
      return { mediaType, dataUrl }
    } catch {
      // Fall through.
    }
  }

  const img = await loadImageElement(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(img, 0, 0)
  return { mediaType: 'image/png', dataUrl: canvas.toDataURL('image/png') }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

export async function readDocumentFile(file, ipcRenderer) {
  if (!isDocumentFile(file)) {
    throw new Error(`Unsupported document type: ${file?.name || 'unknown'}`)
  }
  if (!ipcRenderer) throw new Error('Document extraction unavailable')
  const base64 = await readFileAsBase64(file)
  return ipcRenderer.invoke('agent:extract-document', {
    name: file.name,
    mediaType: inferMediaType(file),
    base64
  })
}

export async function readAttachmentFile(file, ipcRenderer) {
  if (isImageFile(file)) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large (max ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB): ${file.name}`)
    }
    const dataUrl = await readFileAsDataUrl(file)
    const mediaType = inferMediaType(file)
    const normalized = await normalizeToDisplayableDataUrl(file, dataUrl, mediaType)
    return {
      kind: 'image',
      name: file.name,
      mediaType: normalized.mediaType,
      dataUrl: normalized.dataUrl
    }
  }
  return readDocumentFile(file, ipcRenderer)
}

export async function readAttachmentFiles(fileList, existingCount = 0, ipcRenderer) {
  const files = Array.from(fileList || [])
  const remaining = Math.max(0, MAX_CHAT_ATTACHMENTS - existingCount)
  if (!remaining) {
    throw new Error(`Maximum ${MAX_CHAT_ATTACHMENTS} attachments per message`)
  }

  const attachments = []
  for (const file of files.slice(0, remaining)) {
    attachments.push(await readAttachmentFile(file, ipcRenderer))
  }
  return attachments
}

export const readImageFiles = readAttachmentFiles
