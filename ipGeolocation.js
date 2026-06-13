const https = require('https')

function fetchIpLocationResults(ips, apiKey) {
  if (!apiKey) {
    throw new Error('IPGeolocation API key not found. Please set it in Settings > API Keys')
  }

  const list = Array.isArray(ips) ? ips.filter(Boolean) : [ips].filter(Boolean)
  if (!list.length) {
    throw new Error('At least one IP address is required')
  }

  return Promise.all(
    list.map((ip) => new Promise((resolve) => {
      const url = `https://api.ipgeolocation.io/ipgeo?apiKey=${apiKey}&ip=${encodeURIComponent(ip)}`
      https.get(url, { timeout: 10000 }, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try {
            const result = JSON.parse(data)
            if (result.message || result.error) {
              resolve({ ip, error: result.message || result.error || 'Invalid IP address' })
            } else {
              resolve({
                ip: result.ip || ip,
                country: result.country_name,
                region: result.state_prov,
                city: result.city,
                zip: result.zipcode,
                lat: result.latitude,
                lon: result.longitude,
                isp: result.isp,
                org: result.organization || result.isp
              })
            }
          } catch {
            resolve({ ip, error: 'Failed to parse location data' })
          }
        })
      }).on('error', (error) => {
        resolve({ ip, error: error.message || 'Network error' })
      })
    }))
  )
}

module.exports = { fetchIpLocationResults }
