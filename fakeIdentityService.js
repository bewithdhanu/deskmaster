const https = require('https')
const { URL } = require('url')
const {
  fakerEN_US,
  fakerEN_GB,
  fakerEN_CA,
  fakerEN_AU,
  fakerEN_IN,
  fakerEN_IE,
  fakerEN_ZA,
  fakerEN_NG,
  fakerDE,
  fakerDE_AT,
  fakerDE_CH,
  fakerFR,
  fakerFR_BE,
  fakerFR_CA,
  fakerES,
  fakerES_MX,
  fakerIT,
  fakerNL,
  fakerSV,
  fakerNB_NO,
  fakerDA,
  fakerFI,
  fakerPT_BR,
  fakerPT_PT,
  fakerPL,
  fakerJA,
  fakerKO,
  fakerZH_CN,
  fakerTR,
  fakerRU,
  fakerHE,
  fakerHU,
  fakerCS_CZ,
  fakerRO,
  fakerTH,
  fakerVI,
  fakerID_ID,
  fakerAR,
  fakerEN
} = require('@faker-js/faker')

const textLlmService = require('./textLlmService')

const BUILTIN_FIELDS = [
  { key: 'fullName', label: 'Full Name', source: 'faker' },
  { key: 'firstName', label: 'First Name', source: 'faker' },
  { key: 'lastName', label: 'Last Name', source: 'faker' },
  { key: 'address', label: 'Address', source: 'real' },
  { key: 'city', label: 'City', source: 'real' },
  { key: 'state', label: 'State / Region', source: 'real' },
  { key: 'zipCode', label: 'Postal Code', source: 'real' },
  { key: 'phone', label: 'Phone', source: 'faker' },
  { key: 'secondaryPhone', label: 'Secondary Phone', source: 'faker' },
  { key: 'email', label: 'Email', source: 'faker' },
  { key: 'workEmail', label: 'Work Email', source: 'faker' },
  { key: 'ssn', label: 'National ID / SSN', source: 'faker' },
  { key: 'jobRole', label: 'Job Role', source: 'faker' },
  { key: 'company', label: 'Company', source: 'faker' },
  { key: 'dateOfBirth', label: 'Date of Birth', source: 'faker' },
  { key: 'gender', label: 'Gender', source: 'faker' },
  { key: 'username', label: 'Username', source: 'faker' },
  { key: 'website', label: 'Website', source: 'faker' },
  { key: 'latitude', label: 'Latitude', source: 'real' },
  { key: 'longitude', label: 'Longitude', source: 'real' }
]

const WIDGET_FIELDS = ['fullName', 'email', 'phone', 'address', 'jobRole', 'city', 'latitude', 'longitude']

const DEFAULT_SELECTED_FIELDS = [
  'fullName',
  'address',
  'phone',
  'secondaryPhone',
  'email',
  'workEmail',
  'ssn',
  'jobRole',
  'latitude',
  'longitude'
]

const COUNTRY_CONFIG = {
  'United States': { faker: fakerEN_US, bbox: [-124.8, 24.5, -66.9, 49.4], countryCodes: ['us'] },
  'United Kingdom': { faker: fakerEN_GB, bbox: [-8.2, 49.9, 1.8, 58.7], countryCodes: ['gb'] },
  Canada: { faker: fakerEN_CA, bbox: [-141.0, 41.7, -52.6, 83.1], countryCodes: ['ca'] },
  Australia: { faker: fakerEN_AU, bbox: [113.0, -43.7, 153.7, -10.7], countryCodes: ['au'] },
  India: { faker: fakerEN_IN, bbox: [68.1, 6.7, 97.4, 35.5], countryCodes: ['in'] },
  Germany: { faker: fakerDE, bbox: [5.9, 47.3, 15.0, 55.1], countryCodes: ['de'] },
  France: { faker: fakerFR, bbox: [-5.1, 41.3, 9.6, 51.1], countryCodes: ['fr'] },
  Spain: { faker: fakerES, bbox: [-9.3, 36.0, 3.3, 43.8], countryCodes: ['es'] },
  Italy: { faker: fakerIT, bbox: [6.6, 36.6, 18.5, 47.1], countryCodes: ['it'] },
  Netherlands: { faker: fakerNL, bbox: [3.3, 50.8, 7.2, 53.5], countryCodes: ['nl'] },
  Sweden: { faker: fakerSV, bbox: [11.0, 55.3, 24.2, 69.1], countryCodes: ['se'] },
  Norway: { faker: fakerNB_NO, bbox: [4.5, 57.9, 31.1, 71.2], countryCodes: ['no'] },
  Denmark: { faker: fakerDA, bbox: [8.0, 54.6, 15.2, 57.8], countryCodes: ['dk'] },
  Finland: { faker: fakerFI, bbox: [20.5, 59.8, 31.6, 70.1], countryCodes: ['fi'] },
  Ireland: { faker: fakerEN_IE, bbox: [-10.5, 51.4, -5.9, 55.4], countryCodes: ['ie'] },
  Switzerland: { faker: fakerDE_CH, bbox: [5.9, 45.8, 10.5, 47.8], countryCodes: ['ch'] },
  Austria: { faker: fakerDE_AT, bbox: [9.5, 46.4, 17.2, 49.0], countryCodes: ['at'] },
  Belgium: { faker: fakerFR_BE, bbox: [2.5, 49.5, 6.4, 51.5], countryCodes: ['be'] },
  Portugal: { faker: fakerPT_PT, bbox: [-9.5, 36.9, -6.2, 42.2], countryCodes: ['pt'] },
  Poland: { faker: fakerPL, bbox: [14.1, 49.0, 24.1, 54.8], countryCodes: ['pl'] },
  Brazil: { faker: fakerPT_BR, bbox: [-74.0, -33.8, -34.8, 5.3], countryCodes: ['br'] },
  Mexico: { faker: fakerES_MX, bbox: [-118.4, 14.5, -86.7, 32.7], countryCodes: ['mx'] },
  Argentina: { faker: fakerES, bbox: [-73.6, -55.1, -53.6, -21.8], countryCodes: ['ar'] },
  Chile: { faker: fakerES, bbox: [-75.7, -55.9, -66.4, -17.5], countryCodes: ['cl'] },
  Colombia: { faker: fakerES, bbox: [-79.0, -4.2, -66.9, 12.5], countryCodes: ['co'] },
  Japan: { faker: fakerJA, bbox: [129.3, 31.0, 145.8, 45.5], countryCodes: ['jp'] },
  'South Korea': { faker: fakerKO, bbox: [126.1, 33.1, 129.6, 38.6], countryCodes: ['kr'] },
  China: { faker: fakerZH_CN, bbox: [73.5, 18.1, 134.8, 53.6], countryCodes: ['cn'] },
  Singapore: { faker: fakerEN, bbox: [103.6, 1.2, 104.1, 1.5], countryCodes: ['sg'] },
  Malaysia: { faker: fakerEN, bbox: [99.6, 0.9, 119.3, 7.4], countryCodes: ['my'] },
  Indonesia: { faker: fakerID_ID, bbox: [95.0, -11.0, 141.0, 6.1], countryCodes: ['id'] },
  Philippines: { faker: fakerEN, bbox: [116.9, 4.6, 126.6, 21.1], countryCodes: ['ph'] },
  Thailand: { faker: fakerTH, bbox: [97.3, 5.6, 105.6, 20.5], countryCodes: ['th'] },
  Vietnam: { faker: fakerVI, bbox: [102.1, 8.4, 109.5, 23.4], countryCodes: ['vn'] },
  'United Arab Emirates': { faker: fakerAR, bbox: [51.5, 22.6, 56.4, 26.1], countryCodes: ['ae'] },
  'Saudi Arabia': { faker: fakerAR, bbox: [34.5, 16.3, 55.7, 32.2], countryCodes: ['sa'] },
  'South Africa': { faker: fakerEN_ZA, bbox: [16.5, -34.8, 32.9, -22.1], countryCodes: ['za'] },
  Nigeria: { faker: fakerEN_NG, bbox: [2.7, 4.3, 14.7, 13.9], countryCodes: ['ng'] },
  Kenya: { faker: fakerEN, bbox: [33.9, -4.7, 41.9, 5.0], countryCodes: ['ke'] },
  Egypt: { faker: fakerAR, bbox: [24.7, 22.0, 36.9, 31.7], countryCodes: ['eg'] },
  'New Zealand': { faker: fakerEN_AU, bbox: [166.3, -47.3, 178.6, -34.0], countryCodes: ['nz'] },
  Israel: { faker: fakerHE, bbox: [34.2, 29.5, 35.9, 33.3], countryCodes: ['il'] },
  Turkey: { faker: fakerTR, bbox: [26.0, 36.0, 45.0, 42.1], countryCodes: ['tr'] },
  Russia: { faker: fakerRU, bbox: [27.3, 41.2, 180.0, 81.9], countryCodes: ['ru'] },
  Hungary: { faker: fakerHU, bbox: [16.1, 45.7, 22.9, 48.6], countryCodes: ['hu'] },
  'Czech Republic': { faker: fakerCS_CZ, bbox: [12.1, 48.5, 18.9, 51.1], countryCodes: ['cz'] },
  Romania: { faker: fakerRO, bbox: [20.3, 43.6, 29.7, 48.3], countryCodes: ['ro'] }
}

const COUNTRIES = Object.keys(COUNTRY_CONFIG)

function getCountryConfig(country) {
  return COUNTRY_CONFIG[country] || COUNTRY_CONFIG['United States']
}

function getFaker(country) {
  return getCountryConfig(country).faker || fakerEN_US
}

function normalizeCustomFields(customFields) {
  if (!Array.isArray(customFields)) return []
  return customFields
    .map((field, index) => {
      const name = typeof field?.name === 'string' ? field.name.trim() : ''
      const description = typeof field?.description === 'string' ? field.description.trim() : ''
      if (!name) return null
      const id = typeof field?.id === 'string' && field.id.trim() ? field.id.trim() : `cf_${index}`
      const key = typeof field?.key === 'string' && field.key.trim()
        ? field.key.trim()
        : `custom_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || index}`
      return { id, key, name, description: description || name }
    })
    .filter(Boolean)
}

function normalizeSelectedFields(selectedFields) {
  const allowed = new Set(BUILTIN_FIELDS.map((f) => f.key))
  const list = Array.isArray(selectedFields) ? selectedFields.filter((k) => allowed.has(k)) : []
  return list.length ? [...new Set(list)] : [...DEFAULT_SELECTED_FIELDS]
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min)
}

function httpsGetJson(urlString) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString)
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          'User-Agent': 'DeskMasterFakeIdentity/1.0 (local productivity app)',
          Accept: 'application/json'
        },
        timeout: 12000
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Address lookup failed (${res.statusCode})`))
            return
          }
          try {
            resolve(JSON.parse(body || 'null'))
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy(new Error('Address lookup timed out'))
    })
    req.end()
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchRealPlace(country, attempt = 0) {
  const config = getCountryConfig(country)
  const [minLon, minLat, maxLon, maxLat] = config.bbox
  const lat = randomInRange(minLat, maxLat)
  const lon = randomInRange(minLon, maxLon)
  const countryCodes = (config.countryCodes || []).join(',')

  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1` +
    (countryCodes ? `&countrycodes=${encodeURIComponent(countryCodes)}` : '')

  try {
    const data = await httpsGetJson(url)
    const address = data?.address || {}
    const hasUseful =
      address.road ||
      address.pedestrian ||
      address.residential ||
      address.suburb ||
      address.city ||
      address.town ||
      address.village

    if (!data || !hasUseful) {
      if (attempt < 4) {
        await sleep(1100)
        return fetchRealPlace(country, attempt + 1)
      }
      return null
    }

    const line1 = [address.house_number, address.road || address.pedestrian || address.residential]
      .filter(Boolean)
      .join(' ')
    const locality = address.city || address.town || address.village || address.suburb || address.county || ''
    const region = address.state || address.region || address.province || address.county || ''
    const postcode = address.postcode || ''
    const countryName = address.country || country
    const composed = [line1, locality, region, postcode, countryName].filter(Boolean).join(', ')

    return {
      address: composed || data.display_name || '',
      city: locality,
      state: region,
      zipCode: postcode,
      latitude: String(data.lat || lat),
      longitude: String(data.lon || lon),
      displayName: data.display_name || composed
    }
  } catch (error) {
    if (attempt < 3) {
      await sleep(1100)
      return fetchRealPlace(country, attempt + 1)
    }
    console.warn('Real address lookup failed:', error.message)
    return null
  }
}

function buildFakerRecord(faker, selectedFields, usedEmails) {
  const sex = faker.person.sexType()
  const firstName = faker.person.firstName(sex)
  const lastName = faker.person.lastName()
  const fullName = `${firstName} ${lastName}`
  const company = faker.company.name()
  const jobRole = faker.person.jobTitle()

  let email = faker.internet.email({ firstName, lastName }).toLowerCase()
  let guard = 0
  while (usedEmails.has(email) && guard < 20) {
    email = faker.internet.email({ firstName, lastName, provider: faker.internet.domainName() }).toLowerCase()
    guard += 1
  }
  usedEmails.add(email)

  const domain = String(company)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18) || 'company'
  const workEmail = `${firstName}.${lastName}@${domain}.com`.toLowerCase().replace(/\s+/g, '')

  const all = {
    fullName,
    firstName,
    lastName,
    phone: faker.phone.number(),
    secondaryPhone: faker.phone.number(),
    email,
    workEmail,
    ssn: typeof faker.helpers.replaceSymbols === 'function'
      ? faker.helpers.replaceSymbols('###-##-####')
      : `${faker.number.int({ min: 100, max: 999 })}-${faker.number.int({ min: 10, max: 99 })}-${faker.number.int({ min: 1000, max: 9999 })}`,
    jobRole,
    company,
    dateOfBirth: faker.date.birthdate({ min: 18, max: 70, mode: 'age' }).toISOString().slice(0, 10),
    gender: sex,
    username: faker.internet.username({ firstName, lastName }).toLowerCase(),
    website: faker.internet.url()
  }

  const record = {}
  for (const key of selectedFields) {
    if (Object.prototype.hasOwnProperty.call(all, key)) {
      record[key] = String(all[key] ?? '')
    }
  }
  return record
}

function needsRealAddress(selectedFields) {
  return selectedFields.some((k) => ['address', 'city', 'state', 'zipCode', 'latitude', 'longitude'].includes(k))
}

function applyRealPlace(record, selectedFields, place, faker) {
  if (!place) {
    // Fallback: faker-formatted address if OSM fails
    if (selectedFields.includes('address')) {
      record.address = faker.location.streetAddress({ useFullAddress: true })
    }
    if (selectedFields.includes('city')) record.city = faker.location.city()
    if (selectedFields.includes('state')) record.state = faker.location.state()
    if (selectedFields.includes('zipCode')) record.zipCode = faker.location.zipCode()
    if (selectedFields.includes('latitude')) record.latitude = String(faker.location.latitude())
    if (selectedFields.includes('longitude')) record.longitude = String(faker.location.longitude())
    return record
  }

  if (selectedFields.includes('address')) record.address = place.address || place.displayName || ''
  if (selectedFields.includes('city')) record.city = place.city || ''
  if (selectedFields.includes('state')) record.state = place.state || ''
  if (selectedFields.includes('zipCode')) record.zipCode = place.zipCode || ''
  if (selectedFields.includes('latitude')) record.latitude = place.latitude || ''
  if (selectedFields.includes('longitude')) record.longitude = place.longitude || ''
  return record
}

function parseJsonArrayFromModel(text) {
  const raw = String(text || '').trim()
  if (!raw) throw new Error('Empty AI response for custom fields')
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : raw).trim()

  const tryParse = (value) => {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) return parsed.records
    throw new Error('Expected JSON array')
  }

  try {
    return tryParse(candidate)
  } catch (_) {
    const start = candidate.indexOf('[')
    const end = candidate.lastIndexOf(']')
    if (start !== -1 && end > start) return tryParse(candidate.slice(start, end + 1))
    throw new Error('Model did not return custom field JSON')
  }
}

async function fillCustomFieldsWithAi(appSettings, country, records, customFields) {
  if (!customFields.length || !records.length) return records

  const keys = customFields.map((f) => f.key)
  const fieldLines = customFields.map((f) => `- "${f.key}": ${f.description}`).join('\n')
  const context = records.map((record, index) => ({
    index: index + 1,
    fullName: record.fullName || record.firstName || `Person ${index + 1}`,
    city: record.city || '',
    jobRole: record.jobRole || '',
    company: record.company || '',
    email: record.email || ''
  }))

  const messages = [
    {
      role: 'system',
      content: `You fill ONLY custom identity fields for fictional test profiles.
Rules:
1. Return a JSON array with exactly ${records.length} objects.
2. Each object must contain only these keys: ${keys.join(', ')}
3. Values must be strings and unique across the array when possible.
4. Keep values consistent with the provided person context and country (${country}).
5. No markdown, no commentary.`
    },
    {
      role: 'user',
      content: `Country: ${country}

Custom fields:
${fieldLines}

People context:
${JSON.stringify(context, null, 2)}

Return only the JSON array.`
    }
  ]

  try {
    const text = await textLlmService.completeWithAgentProviders(appSettings, messages)
    const extras = parseJsonArrayFromModel(text)
    return records.map((record, index) => {
      const extra = extras[index] && typeof extras[index] === 'object' ? extras[index] : {}
      const next = { ...record }
      for (const field of customFields) {
        next[field.key] = extra[field.key] == null ? '' : String(extra[field.key])
      }
      return next
    })
  } catch (error) {
    console.warn('Custom field AI fill failed:', error.message)
    // Leave custom fields empty but keep faker records
    return records.map((record) => {
      const next = { ...record }
      for (const field of customFields) {
        if (next[field.key] == null) next[field.key] = ''
      }
      return next
    })
  }
}

async function generateIdentities(appSettings, options = {}) {
  const country = typeof options.country === 'string' && options.country.trim()
    ? options.country.trim()
    : 'United States'
  const count = Math.max(1, Math.min(20, Number(options.count) || 1))
  const selectedFields = normalizeSelectedFields(options.selectedFields)
  const customFields = options.libraryOnly ? [] : normalizeCustomFields(options.customFields)
  const libraryOnly = Boolean(options.libraryOnly)
  const faker = getFaker(country)
  const usedEmails = new Set()
  const records = []

  for (let i = 0; i < count; i += 1) {
    let record = buildFakerRecord(faker, selectedFields, usedEmails)
    if (needsRealAddress(selectedFields)) {
      // Nominatim asks for max 1 request/second
      if (i > 0) await sleep(1100)
      const place = await fetchRealPlace(country)
      record = applyRealPlace(record, selectedFields, place, faker)
    }
    record.country = country
    records.push(record)
  }

  if (!libraryOnly && customFields.length) {
    return fillCustomFieldsWithAi(appSettings, country, records, customFields)
  }

  return records
}

module.exports = {
  BUILTIN_FIELDS,
  WIDGET_FIELDS,
  DEFAULT_SELECTED_FIELDS,
  COUNTRIES,
  generateIdentities,
  normalizeCustomFields,
  normalizeSelectedFields
}
