const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')
const ExcelJS = require('exceljs')
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx')
const pptxgen = require('pptxgenjs')

function sanitizeFileName(name, fallback = 'document') {
  const base = String(name || fallback).replace(/[^\w.\-() ]+/g, '_').trim()
  return base || fallback
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getGeneratedDir() {
  const { app } = require('electron')
  return ensureDir(path.join(app.getPath('userData'), 'agent', 'generated'))
}

function splitParagraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

async function generatePdf({ title, content, fileName }) {
  const dir = getGeneratedDir()
  const safeName = sanitizeFileName(fileName, `${title || 'document'}.pdf`)
  const finalName = safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`
  const filePath = path.join(dir, finalName)

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const stream = fs.createWriteStream(filePath)
    doc.pipe(stream)
    if (title) {
      doc.fontSize(18).text(title, { underline: true })
      doc.moveDown()
    }
    for (const paragraph of splitParagraphs(content)) {
      doc.fontSize(11).text(paragraph)
      doc.moveDown()
    }
    doc.end()
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  return {
    path: filePath,
    name: finalName,
    mediaType: 'application/pdf',
    format: 'pdf'
  }
}

async function generateDocx({ title, content, fileName }) {
  const dir = getGeneratedDir()
  const safeName = sanitizeFileName(fileName, `${title || 'document'}.docx`)
  const finalName = safeName.endsWith('.docx') ? safeName : `${safeName}.docx`
  const filePath = path.join(dir, finalName)

  const children = []
  if (title) {
    children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }))
  }
  for (const paragraph of splitParagraphs(content)) {
    children.push(new Paragraph({ children: [new TextRun(paragraph)] }))
  }
  if (!children.length) {
    children.push(new Paragraph({ children: [new TextRun(' ')] }))
  }

  const doc = new Document({ sections: [{ children }] })
  const buffer = await Packer.toBuffer(doc)
  fs.writeFileSync(filePath, buffer)

  return {
    path: filePath,
    name: finalName,
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    format: 'docx'
  }
}

async function generateXlsx({ title, sheets, fileName }) {
  const dir = getGeneratedDir()
  const safeName = sanitizeFileName(fileName, `${title || 'spreadsheet'}.xlsx`)
  const finalName = safeName.endsWith('.xlsx') ? safeName : `${safeName}.xlsx`
  const filePath = path.join(dir, finalName)

  const workbook = new ExcelJS.Workbook()
  const sheetDefs = Array.isArray(sheets) && sheets.length
    ? sheets
    : [{ name: title || 'Sheet1', rows: [['Column A', 'Column B'], ['', '']] }]

  for (const sheetDef of sheetDefs) {
    const sheet = workbook.addWorksheet(String(sheetDef.name || 'Sheet1').slice(0, 31))
    const rows = Array.isArray(sheetDef.rows) ? sheetDef.rows : []
    for (const row of rows) {
      sheet.addRow(Array.isArray(row) ? row : [String(row)])
    }
  }

  await workbook.xlsx.writeFile(filePath)

  return {
    path: filePath,
    name: finalName,
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    format: 'xlsx'
  }
}

async function generatePptx({ title, slides, fileName }) {
  const dir = getGeneratedDir()
  const safeName = sanitizeFileName(fileName, `${title || 'presentation'}.pptx`)
  const finalName = safeName.endsWith('.pptx') ? safeName : `${safeName}.pptx`
  const filePath = path.join(dir, finalName)

  const pptx = new pptxgen()
  pptx.title = title || 'Presentation'
  const slideDefs = Array.isArray(slides) && slides.length
    ? slides
    : [{ title: title || 'Slide 1', bullets: splitParagraphs(title || 'Presentation') }]

  for (const slideDef of slideDefs) {
    const slide = pptx.addSlide()
    slide.addText(slideDef.title || title || 'Slide', { x: 0.5, y: 0.4, w: 9, h: 1, fontSize: 24, bold: true })
    const bullets = Array.isArray(slideDef.bullets) ? slideDef.bullets : splitParagraphs(slideDef.content || '')
    if (bullets.length) {
      slide.addText(bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })), {
        x: 0.7,
        y: 1.5,
        w: 8.5,
        h: 4.5,
        fontSize: 16
      })
    }
  }

  await pptx.writeFile({ fileName: filePath })

  return {
    path: filePath,
    name: finalName,
    mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    format: 'pptx'
  }
}

async function generateDocument(format, args) {
  switch (format) {
    case 'pdf':
      return generatePdf(args)
    case 'docx':
      return generateDocx(args)
    case 'xlsx':
      return generateXlsx(args)
    case 'pptx':
      return generatePptx(args)
    default:
      throw new Error(`Unsupported document format: ${format}`)
  }
}

function clearGeneratedDir() {
  const dir = getGeneratedDir()
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    try {
      fs.unlinkSync(path.join(dir, name))
    } catch {}
  }
}

function exportGeneratedPayload() {
  const dir = getGeneratedDir()
  const files = []
  if (!fs.existsSync(dir)) return { version: 1, files }

  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (!fs.statSync(full).isFile()) continue
    files.push({
      path: name,
      data: fs.readFileSync(full).toString('base64')
    })
  }

  return { version: 1, files }
}

function importGeneratedPayload(payload) {
  if (!payload || !Array.isArray(payload.files)) return
  clearGeneratedDir()
  const dir = getGeneratedDir()

  for (const f of payload.files) {
    const name = String(f.path || '')
    if (!name || name.includes('..') || path.isAbsolute(name)) continue
    const dest = path.join(dir, name)
    if (!dest.startsWith(dir)) continue
    fs.writeFileSync(dest, Buffer.from(String(f.data || ''), 'base64'))
  }
}

module.exports = {
  sanitizeFileName,
  getGeneratedDir,
  generateDocument,
  generatePdf,
  generateDocx,
  generateXlsx,
  generatePptx,
  exportGeneratedPayload,
  importGeneratedPayload,
  clearGeneratedDir
}
