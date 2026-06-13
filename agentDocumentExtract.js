const path = require('path')

const MAX_EXTRACTED_CHARS = 120000
const MAX_FILE_BYTES = 10 * 1024 * 1024

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'html', 'htm', 'csv', 'xml', 'yaml', 'yml',
  'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'log', 'rtf', 'sql', 'py', 'java', 'c', 'cpp', 'h'
])

const DOCUMENT_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'
])

function truncateText(text, max = MAX_EXTRACTED_CHARS) {
  const value = String(text || '').trim()
  if (value.length <= max) return value
  return `${value.slice(0, max)}\n\n[Truncated — file exceeds ${max} characters]`
}

function inferMediaType(fileName, providedType) {
  if (providedType) return providedType
  const ext = path.extname(fileName).slice(1).toLowerCase()
  const map = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    json: 'application/json',
    html: 'text/html',
    htm: 'text/html',
    csv: 'text/csv',
    xml: 'application/xml'
  }
  return map[ext] || 'text/plain'
}

async function extractPdfText(buffer) {
  return extractOfficeText(buffer)
}

async function extractDocxText(buffer) {
  const mammoth = require('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result?.value || ''
}

async function extractXlsxText(buffer) {
  const ExcelJS = require('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const lines = []
  workbook.eachSheet((sheet) => {
    lines.push(`Sheet: ${sheet.name}`)
    sheet.eachRow((row) => {
      const values = (row.values || []).slice(1).map((cell) => {
        if (cell == null) return ''
        if (typeof cell === 'object' && cell.text) return String(cell.text)
        if (typeof cell === 'object' && cell.result != null) return String(cell.result)
        return String(cell)
      })
      if (values.some(Boolean)) lines.push(values.join('\t'))
    })
    lines.push('')
  })
  return lines.join('\n').trim()
}

async function extractOfficeText(buffer) {
  const { parseOffice } = require('officeparser')
  const parsed = await parseOffice(buffer, { outputErrorToConsole: false })
  if (typeof parsed?.toText === 'function') return parsed.toText()
  if (typeof parsed === 'string') return parsed
  return JSON.stringify(parsed?.content || parsed, null, 2)
}

async function extractTextFromBuffer(buffer, fileName, mediaType) {
  if (!buffer || !buffer.length) throw new Error(`File is empty: ${fileName}`)
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(`File too large (max ${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB): ${fileName}`)
  }

  const ext = path.extname(fileName).slice(1).toLowerCase()
  if (!DOCUMENT_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type: ${fileName}`)
  }

  let text = ''
  if (TEXT_EXTENSIONS.has(ext)) {
    text = buffer.toString('utf8')
  } else if (ext === 'pdf') {
    text = await extractPdfText(buffer)
  } else if (ext === 'docx' || ext === 'doc') {
    text = ext === 'docx' ? await extractDocxText(buffer) : await extractOfficeText(buffer)
  } else if (ext === 'xlsx' || ext === 'xls') {
    text = ext === 'xlsx' ? await extractXlsxText(buffer) : await extractOfficeText(buffer)
  } else if (ext === 'pptx' || ext === 'ppt') {
    text = await extractOfficeText(buffer)
  } else {
    text = buffer.toString('utf8')
  }

  return truncateText(text)
}

async function extractDocumentFromPath(filePath) {
  const fs = require('fs')
  const buffer = fs.readFileSync(filePath)
  const name = path.basename(filePath)
  const extractedText = await extractTextFromBuffer(buffer, name)
  return {
    kind: 'document',
    name,
    mediaType: inferMediaType(name),
    extractedText,
    size: buffer.length
  }
}

module.exports = {
  MAX_FILE_BYTES,
  MAX_EXTRACTED_CHARS,
  DOCUMENT_EXTENSIONS,
  TEXT_EXTENSIONS,
  inferMediaType,
  extractTextFromBuffer,
  extractDocumentFromPath,
  truncateText
}
