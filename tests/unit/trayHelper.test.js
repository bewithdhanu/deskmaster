const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { buildTrayState, resolveHelperPath, createTrayHelper } = require('../../trayHelper')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trayhelper-'))
const fakeHelper = (name, body) => {
  const file = path.join(tmp, name)
  fs.writeFileSync(file, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 })
  return file
}
const waitFor = async (predicate, ms = 4000) => {
  const end = Date.now() + ms
  while (!predicate()) {
    if (Date.now() > end) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 20))
  }
}

async function main() {
  // 1. state builder: order, toggles, uptime, formats
  const state = buildTrayState({
    stats: { cpu: 12, ram: 64, disk: 92, net: { up: '3 KB', down: '1 MB' }, battery: { percent: 12, charging: false } },
    timezones: [{ label: 'IST', timezone: 'Asia/Kolkata' }],
    settings: { datetimeFormat: 'HH:mm', stats: { cpu: true, ram: false, disk: true, network: true, battery: true } },
    uptime: { down: 1, sslAttention: 0, domainAttention: 2 }
  })
  assert.deepStrictEqual(state.cells.map((c) => c.label), ['CPU', 'DISK', 'BAT', 'NET', 'IST', ''])
  assert.strictEqual(state.timeFormat, 'HH:mm')
  assert.deepStrictEqual(state.cells[0].ring, { value: 12, color: '#5e9eff' }, 'calm CPU keeps its own colour')
  assert.deepStrictEqual(state.cells[1].ring, { value: 92, color: '#ff9f0a' }, 'disk warns at 85%, red only at 95%')
  assert.deepStrictEqual(state.cells[2].ring, { value: 12, color: '#ff453a' }, 'low battery on battery power is red')
  assert.strictEqual(buildTrayState({ stats: { battery: { percent: 12, charging: true } }, settings: { stats: { battery: true } } }).cells[0].label, '⚡BAT')
  assert.deepStrictEqual(state.cells[3], { label: 'NET', up: '3 KB', down: '1 MB', reserve: '8888 MB' })
  assert.deepStrictEqual(state.cells[4], { label: 'IST', tz: 'Asia/Kolkata' }, 'short format stays without seconds')

  const dated = buildTrayState({
    stats: { cpu: 1, ram: 1, disk: 1, net: {} },
    timezones: [
      { label: 'UTC', timezone: 'UTC' },
      { label: 'Local', timezone: 'Asia/Kolkata' },
      { label: 'Central', timezone: 'America/Chicago' }
    ],
    settings: { datetimeFormat: 'MMM DD, HH:mm', stats: {} },
    localTimezone: 'Asia/Kolkata'
  })
  assert.strictEqual(dated.timeFormat, 'MMM DD, HH:mm')
  assert.deepStrictEqual(dated.cells[0], { label: '', calendar: true, tz: 'Asia/Kolkata' }, 'date moves into one calendar icon')
  assert.strictEqual(dated.cells.find((c) => c.label === 'UTC').timeFormat, 'HH:mm')
  assert.strictEqual(dated.cells.find((c) => c.label === 'Local').timeFormat, 'HH:mm:ss')
  assert.strictEqual(dated.cells.find((c) => c.label === 'Central').timeFormat, 'HH:mm')

  const twelve = buildTrayState({
    stats: { cpu: 1, ram: 1, disk: 1, net: {} },
    timezones: [{ label: 'Other', timezone: 'UTC' }],
    settings: { datetimeFormat: 'MMM DD, h:mm A', stats: {} },
    localTimezone: 'Asia/Kolkata'
  })
  assert.strictEqual(twelve.cells[1].timeFormat, 'h:mm:ss A', 'falls back to the first clock')
  assert.deepStrictEqual(state.cells[5].segments, [
    { symbol: 'arrowtriangle.down.fill', text: '1', color: '#ff453a' },
    { symbol: 'globe', text: '2', color: '#ff9f0a' }
  ], 'zero counts are left out')
  const quiet = buildTrayState({ stats: { cpu: 1, ram: 1, disk: 1, net: {} }, settings: { stats: {} }, uptime: { down: 0 } })
  assert.deepStrictEqual(quiet.cells, [], 'no uptime cell when nothing needs attention')
  assert.strictEqual(quiet.timeFormat, 'HH:mm:ss')

  // 2. supervisor: state in, click out
  const echo = fakeHelper('echo', `
    process.stdout.write('{"type":"ready"}\\n')
    process.stdin.setEncoding('utf8').on('data', () => process.stdout.write('{"type":"click","x":1,"y":2,"width":3,"height":4}\\n'))
  `)
  const events = []
  const ok = createTrayHelper({ binaryPath: echo, onEvent: (e) => events.push(e), onUnavailable: () => assert.fail('should not give up') })
  ok.send(state)
  await waitFor(() => events.length > 0)
  assert.strictEqual(events[0].type, 'click')
  ok.stop()

  // 3. supervisor: crash loop -> falls back exactly once
  const crasher = fakeHelper('crash', 'process.exit(1)')
  let gaveUp = 0
  createTrayHelper({ binaryPath: crasher, restartDelayMs: 10, onUnavailable: () => gaveUp++ })
  await waitFor(() => gaveUp > 0)
  await new Promise((r) => setTimeout(r, 100))
  assert.strictEqual(gaveUp, 1, 'onUnavailable fires once')

  // 4. supervisor: missing binary -> falls back
  let missing = 0
  createTrayHelper({ binaryPath: path.join(tmp, 'nope'), onUnavailable: () => missing++ })
  await waitFor(() => missing > 0)

  // 5. real binary smoke test (macOS dev machines that built it)
  const real = resolveHelperPath(null, path.join(__dirname, '..', '..'))
  if (process.platform === 'darwin' && real) {
    const png = path.join(tmp, 'preview.png')
    execFileSync(real, ['--render', png], { input: JSON.stringify({ type: 'state', ...state }) })
    assert.strictEqual(fs.readFileSync(png).subarray(1, 4).toString(), 'PNG', 'native render produces a PNG')
  } else {
    console.log('trayHelper: native binary not built, skipping render smoke test')
  }

  fs.rmSync(tmp, { recursive: true, force: true })
  console.log('trayHelper: all checks passed')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
