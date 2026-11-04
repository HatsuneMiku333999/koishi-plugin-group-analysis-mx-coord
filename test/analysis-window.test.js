const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const filename = path.join(__dirname, '..', 'lib', 'service', 'analysis.js')
const source = fs.readFileSync(filename, 'utf8')
const exported = {}
vm.runInNewContext('(function(require, exports) {' + source + '\n})', { console })(
  (module) => {
    if (module === 'koishi') return { Service: class {} }
    if (module === 'js-yaml' || module === '../utils') return {}
    throw new Error(`Unexpected module: ${module}`)
  },
  exported,
)
const { AnalysisService } = exported

function createService() {
  const calls = []
  const service = Object.create(AnalysisService.prototype)
  service.config = { maxMessages: 2000 }
  service.ctx = {
    logger: { info() {}, warn() {} },
    group_analysis_message: {
      async getHistoricalMessages(filter) {
        calls.push(filter)
        return []
      },
    },
  }
  return { service, calls }
}

test('day-only analysis window is rolling 24 hours, not since midnight', async () => {
  const { service, calls } = createService()
  const before = Date.now()
  await service._getGroupHistoryFromMessageService('bot', { guildId: 'group', channelId: 'channel' }, 1)
  const after = Date.now()

  assert.equal(calls.length, 1)
  const { startTime, endTime } = calls[0]
  assert.equal(Object.prototype.toString.call(startTime), '[object Date]')
  assert.equal(Object.prototype.toString.call(endTime), '[object Date]')
  assert.ok(Math.abs((endTime.getTime() - startTime.getTime()) - 24 * 60 * 60 * 1000) < 5)
  assert.ok(endTime.getTime() >= before && endTime.getTime() <= after)
})

test('day/hour/minute values are combined into one rolling duration', async () => {
  const { service, calls } = createService()
  await service._getGroupHistoryFromMessageService('bot', { guildId: 'group' }, 1, 2, 30)

  const { startTime, endTime } = calls[0]
  assert.equal(endTime.getTime() - startTime.getTime(), (24 * 60 + 2 * 60 + 30) * 60 * 1000)
})

test('zero or invalid window does not query history', async () => {
  const { service, calls } = createService()
  await service._getGroupHistoryFromMessageService('bot', { guildId: 'group' }, 0, 0, 0)
  await service._getGroupHistoryFromMessageService('bot', { guildId: 'group' }, Number.NaN, 1, 0)
  assert.equal(calls.length, 0)
})
