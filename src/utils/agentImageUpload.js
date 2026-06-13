export const MAX_CHAT_IMAGES = 5
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif'
]

const EXTENSION_MEDIA_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif'
}

function inferMediaType(file) {
  if (file?.type && file.type.startsWith('image/')) return file.type
  const name = String(file?.name || '')
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  return EXTENSION_MEDIA_TYPES[ext] || null
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
  if (mediaType === 'image/jpeg' || mediaType === 'image/png' || mediaType === 'image/gif' || mediaType === 'image/webp') {
    try {
      await loadImageElement(dataUrl)
      return { mediaType, dataUrl }
    } catch {
      // Fall through to canvas conversion below.
    }
  }

  try {
    const img = await loadImageElement(dataUrl)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || img.width
    canvas.height = img.naturalHeight || img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.drawImage(img, 0, 0)
    const convertedUrl = canvas.toDataURL('image/png')
    return { mediaType: 'image/png', dataUrl: convertedUrl }
  } catch {
    throw new Error(
      `${file.name} could not be previewed in the browser. Use JPG or PNG, or attach images from the desktop app.`
    )
  }
}

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const mediaType = inferMediaType(file)
    if (!mediaType) {
      reject(new Error(`Unsupported image type: ${file?.name || 'unknown'}`))
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error(`Image too large (max ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB): ${file.name}`))
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const normalized = await normalizeToDisplayableDataUrl(file, reader.result, mediaType)
        resolve({
          name: file.name,
          mediaType: normalized.mediaType,
          dataUrl: normalized.dataUrl
        })
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

export async function readImageFiles(fileList, existingCount = 0) {
  const files = Array.from(fileList || [])
  const remaining = Math.max(0, MAX_CHAT_IMAGES - existingCount)
  if (!remaining) {
    throw new Error(`Maximum ${MAX_CHAT_IMAGES} images per message`)
  }

  const selected = files.slice(0, remaining)
  const attachments = []
  for (const file of selected) {
    attachments.push(await readImageFile(file))
  }
  return attachments
}
