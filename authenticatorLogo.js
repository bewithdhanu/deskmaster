const https = require('https')

const FAVICON_SIZE = 64

function getFaviconUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${FAVICON_SIZE}`
}

function fetchBuffer(url, redirectCount = 0) {
  return new Promise((resolve) => {
    if (redirectCount > 5) {
      resolve(null)
      return
    }

    https.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBuffer(res.headers.location, redirectCount + 1).then(resolve)
        return
      }

      if (res.statusCode !== 200) {
        res.resume()
        resolve(null)
        return
      }

      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        if (!buffer.length) {
          resolve(null)
          return
        }
        resolve({
          buffer,
          contentType: res.headers['content-type'] || 'image/png'
        })
      })
    }).on('error', (error) => {
      console.warn('Favicon fetch failed:', url, error.message)
      resolve(null)
    })
  })
}

async function fetchFaviconDataUrl(domain) {
  if (!domain || typeof domain !== 'string') return null

  const result = await fetchBuffer(getFaviconUrl(domain.trim()))
  if (!result) return null

  const { buffer, contentType } = result
  return `data:${contentType};base64,${buffer.toString('base64')}`
}

module.exports = {
  getFaviconUrl,
  fetchFaviconDataUrl
}
