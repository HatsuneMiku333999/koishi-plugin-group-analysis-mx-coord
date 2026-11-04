const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const filename = path.join(__dirname, '..', 'lib', 'plugins', 'command.js')
const source = fs.readFileSync(filename, 'utf8')

function setup(configOverrides = {}) {
  const actions = new Map()
  const calls = []
  const listenerGroups = [
    { platform: 'qq', selfId: 'bot', guildId: 'A', channelId: 'A-channel', enabled: true },
    { platform: 'qq', selfId: 'bot', guildId: 'B', channelId: 'B-channel', enabled: true },
  ]
  const config = {
    listenerGroups,
    personaBlacklist: [],
    customPrompt: 'summarize',
    customPromptEnabled: false,
    customPromptDays: 0,
    customPromptHours: 1,
    cronAnalysisDays: 0,
    cronAnalysisHours: 1,
    cronAnalysisMinutes: 0,
    ...configOverrides,
  }
  const command = (name) => {
    const chain = {
      usage() { return chain },
      alias() { return chain },
      option() { return chain },
      subcommand(subname) { return command(name + subname) },
      action(handler) { actions.set(name, handler); return chain },
    }
    return chain
  }
  const ctx = {
    config,
    command,
    logger: { info() {} },
    group_analysis: {
      async executeGroupAnalysis(...args) { calls.push({ method: 'normal', args }) },
      async executeGroupQuery(...args) { calls.push({ method: 'query', args }) },
      async executeCustomAnalysis(...args) { calls.push({ method: 'custom', args }) },
      async executeDailyComic(...args) { calls.push({ method: 'comic', args }) },
    },
  }
  const exported = {}
  const fakeRequire = (module) => {
    assert.equal(module, '../utils')
    return {
      shouldListenToMessage(session, listeners) {
        return listeners.some((listener) => listener.enabled &&
          listener.platform === session.platform && listener.selfId === session.selfId &&
          (Boolean(session.guildId && listener.guildId === session.guildId) ||
            Boolean(session.channelId && listener.channelId === session.channelId)))
      },
    }
  }
  vm.runInNewContext('(function(require, exports) {' + source + '\n})', { console })(fakeRequire, exported)
  exported.apply(ctx, config)
  const session = { platform: 'qq', selfId: 'bot', guildId: 'A', channelId: 'A-channel', userId: 'user', isDirect: false }
  return { actions, calls, session }
}

test('explicit -g analyses B and replies to A without mixing channel IDs', async () => {
  const { actions, calls, session } = setup()
  await actions.get('群分析 [query:text]')({ session, options: { group: 'B' } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'normal')
  assert.deepEqual({ ...calls[0].args[1] }, { guildId: 'B', channelId: 'B-channel' })
  assert.equal(calls[0].args[5], session)
})

test('explicit -c resolves the matching guild, not the current guild', async () => {
  const { actions, calls, session } = setup()
  await actions.get('群分析 [query:text]')({ session, options: { channel: 'B-channel' } })
  assert.deepEqual({ ...calls[0].args[1] }, { guildId: 'B', channelId: 'B-channel' })
})

test('without options, the current group is still analyzed', async () => {
  const { actions, calls, session } = setup()
  await actions.get('群分析 [query:text]')({ session, options: {} })
  assert.deepEqual({ ...calls[0].args[1] }, { guildId: 'A', channelId: 'A-channel' })
})

test('custom prompt and query routes also use the target group', async () => {
  for (const [configOverrides, query, method] of [
    [{ customPromptEnabled: true }, undefined, 'custom'],
    [{}, 'recent events', 'query'],
  ]) {
    const { actions, calls, session } = setup(configOverrides)
    await actions.get('群分析 [query:text]')({ session, options: { group: 'B' } }, query)
    assert.equal(calls[0].method, method)
    assert.equal(calls[0].args[0], session)
    assert.deepEqual({ ...calls[0].args[1] }, { guildId: 'B', channelId: 'B-channel' })
  }
})

test('unknown -g never inherits the current channel when all groups are allowed', async () => {
  const { actions, calls, session } = setup({ enableAllGroupsByDefault: true })
  await actions.get('群分析 [query:text]')({ session, options: { group: 'C' } })
  assert.deepEqual({ ...calls[0].args[1] }, { guildId: 'C', channelId: undefined })
})
