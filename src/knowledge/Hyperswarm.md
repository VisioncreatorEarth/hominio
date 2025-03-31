This file is a merged representation of the entire codebase, combined into a single document by Repomix. The content has been processed where security check has been disabled.

# File Summary

## Purpose
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Security check has been disabled - content may contain sensitive information

## Additional Info

# Directory Structure
```
.github/
  workflows/
    test-node.yml
lib/
  bulk-timer.js
  connection-set.js
  peer-discovery.js
  peer-info.js
  retry-timer.js
test/
  helpers/
    index.js
  manual/
    measure-reconnect.js
  all.js
  bulk-timer.js
  chaos.js
  dups.js
  firewall.js
  peer-join.js
  retry-timer.js
  stats.js
  suspend.js
  swarm.js
  update.js
.gitignore
.travis.yml
example.js
index.js
LICENSE
package.json
README.md
```

# Files

## File: .github/workflows/test-node.yml
````yaml
name: Build Status
on:
  push:
    branches:
      - main
    tags: # To trigger the canary
      - '*'
  pull_request:
    branches:
      - main
jobs:
  build:
    if: ${{ !startsWith(github.ref, 'refs/tags/')}} # Already runs for the push of the commit, no need to run again for the tag
    strategy:
      matrix:
        node-version: [lts/*]
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1 https://github.com/actions/checkout/releases/tag/v4.1.1
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@1a4442cacd436585916779262731d5b162bc6ec7 # v3.8.2 https://github.com/actions/setup-node/releases/tag/v3.8.2
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm install
      - run: npm test
  trigger_canary:
    if: startsWith(github.ref, 'refs/tags/') # Only run when a new package is published (detects when a new tag is pushed)
    runs-on: ubuntu-latest
    steps:
      - name: trigger canary
        run: |
          curl -L -X POST \
          -H "Accept: application/vnd.github+json" \
          -H "Authorization: Bearer ${{ secrets.CANARY_DISPATCH_PAT }}" \
          -H "X-GitHub-Api-Version: 2022-11-28" \
          https://api.github.com/repos/holepunchto/canary-tests/dispatches \
          -d '{"event_type":"triggered-by-${{ github.event.repository.name }}-${{ github.ref_name }}"}'
````

## File: lib/bulk-timer.js
````javascript
module.exports = class BulkTimer {
  constructor (time, fn) {
    this._time = time
    this._fn = fn
    this._interval = null
    this._next = []
    this._pending = []
    this._destroyed = false
  }

  destroy () {
    if (this._destroyed) return
    this._destroyed = true
    clearInterval(this._interval)
    this._interval = null
  }

  _ontick () {
    if (!this._next.length && !this._pending.length) return
    if (this._next.length) this._fn(this._next)
    this._next = this._pending
    this._pending = []
  }

  add (info) {
    if (this._destroyed) return
    if (!this._interval) {
      this._interval = setInterval(this._ontick.bind(this), Math.floor(this._time * 0.66))
    }

    this._pending.push(info)
  }
}
````

## File: lib/connection-set.js
````javascript
const b4a = require('b4a')

module.exports = class ConnectionSet {
  constructor () {
    this._byPublicKey = new Map()
  }

  [Symbol.iterator] () {
    return this._byPublicKey.values()
  }

  get size () {
    return this._byPublicKey.size
  }

  has (publicKey) {
    return this._byPublicKey.has(b4a.toString(publicKey, 'hex'))
  }

  get (publicKey) {
    return this._byPublicKey.get(b4a.toString(publicKey, 'hex'))
  }

  add (connection) {
    this._byPublicKey.set(b4a.toString(connection.remotePublicKey, 'hex'), connection)
  }

  delete (connection) {
    const keyString = b4a.toString(connection.remotePublicKey, 'hex')
    const existing = this._byPublicKey.get(keyString)
    if (existing !== connection) return
    this._byPublicKey.delete(keyString)
  }
}
````

## File: lib/peer-discovery.js
````javascript
const safetyCatch = require('safety-catch')
const b4a = require('b4a')

const REFRESH_INTERVAL = 1000 * 60 * 10 // 10 min
const RANDOM_JITTER = 1000 * 60 * 2 // 2 min
const DELAY_GRACE_PERIOD = 1000 * 30 // 30s

module.exports = class PeerDiscovery {
  constructor (swarm, topic, { wait = null, suspended = false, onpeer = noop, onerror = safetyCatch }) {
    this.swarm = swarm
    this.topic = topic
    this.isClient = false
    this.isServer = false
    this.destroyed = false
    this.destroying = null
    this.suspended = suspended

    this._sessions = []
    this._clientSessions = 0
    this._serverSessions = 0

    this._onpeer = onpeer
    this._onerror = onerror

    this._activeQuery = null
    this._timer = null
    this._currentRefresh = null
    this._closestNodes = null
    this._firstAnnounce = true
    this._needsUnannounce = false
    this._refreshes = 0
    this._wait = wait
  }

  session ({ server = true, client = true, onerror = safetyCatch }) {
    if (this.destroyed) throw new Error('PeerDiscovery is destroyed')
    const session = new PeerDiscoverySession(this)
    session.refresh({ server, client }).catch(onerror)
    this._sessions.push(session)
    return session
  }

  _refreshLater (eager) {
    const jitter = Math.round(Math.random() * RANDOM_JITTER)
    const delay = !eager
      ? REFRESH_INTERVAL + jitter
      : jitter

    if (this._timer) clearTimeout(this._timer)

    const startTime = Date.now()
    this._timer = setTimeout(() => {
      // If your laptop went to sleep, and is coming back online...
      const overdue = Date.now() - startTime > delay + DELAY_GRACE_PERIOD
      if (overdue) this._refreshLater(true)
      else this.refresh().catch(this._onerror)
    }, delay)
  }

  _isActive () {
    return !this.destroyed && !this.suspended
  }

  // TODO: Allow announce to be an argument to this
  // TODO: Maybe announce should be a setter?
  async _refresh () {
    if (this.suspended) return
    const clock = ++this._refreshes

    if (this._wait) {
      await this._wait
      this._wait = null
      if (clock !== this._refreshes || !this._isActive()) return
    }

    const clear = this.isServer && this._firstAnnounce
    if (clear) this._firstAnnounce = false

    const opts = {
      clear,
      closestNodes: this._closestNodes
    }

    if (this.isServer) {
      await this.swarm.listen()
      // if a parallel refresh is happening, yield to the new one
      if (clock !== this._refreshes || !this._isActive()) return
      this._needsUnannounce = true
    }

    const announcing = this.isServer
    const query = this._activeQuery = announcing
      ? this.swarm.dht.announce(this.topic, this.swarm.keyPair, this.swarm.server.relayAddresses, opts)
      : this._needsUnannounce
        ? this.swarm.dht.lookupAndUnannounce(this.topic, this.swarm.keyPair, opts)
        : this.swarm.dht.lookup(this.topic, opts)

    try {
      for await (const data of this._activeQuery) {
        if (!this.isClient || !this._isActive()) continue
        for (const peer of data.peers) {
          this._onpeer(peer, data)
        }
      }
    } catch (err) {
      if (this._isActive()) throw err
    } finally {
      if (this._activeQuery === query) {
        this._activeQuery = null
        if (!this.destroyed && !this.suspended) this._refreshLater(false)
      }
    }

    // This is set at the very end, when the query completes successfully.
    this._closestNodes = query.closestNodes

    if (clock !== this._refreshes) return

    // In this is the latest query, unannounce has been fulfilled as well
    if (!announcing) this._needsUnannounce = false
  }

  async refresh () {
    if (this.destroyed) throw new Error('PeerDiscovery is destroyed')

    const server = this._serverSessions > 0
    const client = this._clientSessions > 0

    if (this.suspended) return

    if (server === this.isServer && client === this.isClient) {
      if (this._currentRefresh) return this._currentRefresh
      this._currentRefresh = this._refresh()
    } else {
      if (this._activeQuery) this._activeQuery.destroy()
      this.isServer = server
      this.isClient = client
      this._currentRefresh = this._refresh()
    }

    const refresh = this._currentRefresh
    try {
      await refresh
    } catch {
      return false
    } finally {
      if (refresh === this._currentRefresh) {
        this._currentRefresh = null
      }
    }

    return true
  }

  async flushed () {
    if (this.swarm.listening) await this.swarm.listening

    try {
      await this._currentRefresh
      return true
    } catch {
      return false
    }
  }

  async _destroyMaybe () {
    if (this.destroyed) return

    try {
      if (this._sessions.length === 0) await this.swarm.leave(this.topic)
      else if (this._serverSessions === 0 && this._needsUnannounce) await this.refresh()
    } catch (err) { // ignore network failures here, as we are tearing down
      safetyCatch(err)
    }
  }

  destroy () {
    if (this.destroying) return this.destroying
    this.destroying = this._destroy()
    return this.destroying
  }

  async _abort () {
    if (this._wait) await this._wait

    if (this._activeQuery) {
      this._activeQuery.destroy()
      this._activeQuery = null
    }
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }

    let nodes = this._closestNodes

    if (this._currentRefresh) {
      try {
        await this._currentRefresh
      } catch {
        // If the destroy causes the refresh to fail, suppress it.
      }
    }

    if (this._isActive()) return

    if (!nodes) nodes = this._closestNodes
    else if (this._closestNodes !== nodes) {
      const len = nodes.length
      for (const newer of this._closestNodes) {
        if (newer.id && !hasNode(nodes, len, newer)) nodes.push(newer)
      }
    }

    if (this._needsUnannounce) {
      if (nodes && nodes.length) await this.swarm.dht.unannounce(this.topic, this.swarm.keyPair, { closestNodes: nodes, onlyClosestNodes: true })
      this._needsUnannounce = false
    }
  }

  _destroy () {
    if (this.destroyed) return
    this.destroyed = true
    return this._abort()
  }

  async suspend () {
    if (this.suspended) return
    this.suspended = true
    try {
      await this._abort()
    } catch {
      // ignore
    }
  }

  resume () {
    if (!this.suspended) return
    this.suspended = false
    this.refresh().catch(noop)
  }
}

class PeerDiscoverySession {
  constructor (discovery) {
    this.discovery = discovery
    this.isClient = false
    this.isServer = false
    this.destroyed = false
  }

  get swarm () {
    return this.discovery.swarm
  }

  get topic () {
    return this.discovery.topic
  }

  async refresh ({ client = this.isClient, server = this.isServer } = {}) {
    if (this.destroyed) throw new Error('PeerDiscovery is destroyed')
    if (!client && !server) throw new Error('Cannot refresh with neither client nor server option')

    if (client !== this.isClient) {
      this.isClient = client
      this.discovery._clientSessions += client ? 1 : -1
    }

    if (server !== this.isServer) {
      this.isServer = server
      this.discovery._serverSessions += server ? 1 : -1
    }

    return this.discovery.refresh()
  }

  async flushed () {
    return this.discovery.flushed()
  }

  async destroy () {
    if (this.destroyed) return
    this.destroyed = true

    if (this.isClient) this.discovery._clientSessions--
    if (this.isServer) this.discovery._serverSessions--

    const index = this.discovery._sessions.indexOf(this)
    const head = this.discovery._sessions.pop()

    if (head !== this) this.discovery._sessions[index] = head

    return this.discovery._destroyMaybe()
  }
}

function hasNode (nodes, len, node) {
  for (let i = 0; i < len; i++) {
    const existing = nodes[i]
    if (existing.id && b4a.equals(existing.id, node.id)) return true
  }

  return false
}

function noop () {}
````

## File: lib/peer-info.js
````javascript
const { EventEmitter } = require('events')
const b4a = require('b4a')
const unslab = require('unslab')

const MIN_CONNECTION_TIME = 15000

const VERY_LOW_PRIORITY = 0
const LOW_PRIORITY = 1
const NORMAL_PRIORITY = 2
const HIGH_PRIORITY = 3
const VERY_HIGH_PRIORITY = 4

module.exports = class PeerInfo extends EventEmitter {
  constructor ({ publicKey, relayAddresses }) {
    super()

    this.publicKey = unslab(publicKey)
    this.relayAddresses = relayAddresses

    this.reconnecting = true
    this.proven = false
    this.connectedTime = -1
    this.disconnectedTime = 0
    this.banned = false
    this.tried = false
    this.explicit = false
    this.waiting = false
    this.forceRelaying = false

    // Set by the Swarm
    this.queued = false
    this.client = false
    this.topics = [] // TODO: remove on next major (check with mafintosh for context)

    this.attempts = 0
    this.priority = NORMAL_PRIORITY

    // Used by shuffled-priority-queue
    this._index = 0

    // Used for flush management
    this._flushTick = 0

    // Used for topic multiplexing
    this._seenTopics = new Set()
  }

  get server () {
    return !this.client
  }

  get prioritized () {
    return this.priority >= NORMAL_PRIORITY
  }

  _getPriority () {
    const peerIsStale = this.tried && !this.proven
    if (peerIsStale || this.attempts > 3) return VERY_LOW_PRIORITY
    if (this.attempts === 3) return LOW_PRIORITY
    if (this.attempts === 2) return HIGH_PRIORITY
    if (this.attempts === 1) return VERY_HIGH_PRIORITY
    return NORMAL_PRIORITY
  }

  _connected () {
    this.proven = true
    this.connectedTime = Date.now()
  }

  _disconnected () {
    this.disconnectedTime = Date.now()
    if (this.connectedTime > -1) {
      if ((this.disconnectedTime - this.connectedTime) >= MIN_CONNECTION_TIME) this.attempts = 0 // fast retry
      this.connectedTime = -1
    }
    this.attempts++
  }

  _deprioritize () {
    this.attempts = 3
  }

  _reset () {
    this.client = false
    this.proven = false
    this.tried = false
    this.attempts = 0
  }

  _updatePriority () {
    if (this.explicit && this.attempts > 3) this._deprioritize()
    if (this.banned || this.queued || this.attempts > 3) return false
    this.priority = this._getPriority()
    return true
  }

  _topic (topic) {
    const topicString = b4a.toString(topic, 'hex')
    if (this._seenTopics.has(topicString)) return
    this._seenTopics.add(topicString)
    this.topics.push(topic)
    this.emit('topic', topic)
  }

  reconnect (val) {
    this.reconnecting = !!val
  }

  ban (val) {
    this.banned = !!val
  }

  shouldGC () {
    return !(this.banned || this.queued || this.explicit || this.waiting)
  }
}
````

## File: lib/retry-timer.js
````javascript
const BulkTimer = require('./bulk-timer')

const BACKOFF_JITTER = 500
const BACKOFF_S = 1000 + Math.round(BACKOFF_JITTER * Math.random())
const BACKOFF_M = 5000 + Math.round(2 * BACKOFF_JITTER * Math.random())
const BACKOFF_L = 15000 + Math.round(4 * BACKOFF_JITTER * Math.random())
const BACKOFF_X = 1000 * 60 * 10 + Math.round(240 * BACKOFF_JITTER * Math.random())

module.exports = class RetryTimer {
  constructor (push, { backoffs = [BACKOFF_S, BACKOFF_M, BACKOFF_L, BACKOFF_X], jitter = BACKOFF_JITTER } = {}) {
    this.jitter = jitter
    this.backoffs = backoffs

    this._sTimer = new BulkTimer(backoffs[0] + Math.round(jitter * Math.random()), push)
    this._mTimer = new BulkTimer(backoffs[1] + Math.round(jitter * Math.random()), push)
    this._lTimer = new BulkTimer(backoffs[2] + Math.round(jitter * Math.random()), push)
    this._xTimer = new BulkTimer(backoffs[3] + Math.round(jitter * Math.random()), push)
  }

  _selectRetryTimer (peerInfo) {
    if (peerInfo.banned || !peerInfo.reconnecting) return null

    if (peerInfo.attempts > 3) {
      return peerInfo.explicit ? this._xTimer : null
    }

    if (peerInfo.attempts === 0) return this._sTimer
    if (peerInfo.proven) {
      switch (peerInfo.attempts) {
        case 1: return this._sTimer
        case 2: return this._mTimer
        case 3: return this._lTimer
      }
    } else {
      switch (peerInfo.attempts) {
        case 1: return this._mTimer
        case 2: return this._lTimer
        case 3: return this._lTimer
      }
    }

    return null
  }

  add (peerInfo) {
    const timer = this._selectRetryTimer(peerInfo)
    if (!timer) return false

    timer.add(peerInfo)
    return true
  }

  destroy () {
    this._sTimer.destroy()
    this._mTimer.destroy()
    this._lTimer.destroy()
    this._xTimer.destroy()
  }
}
````

## File: test/helpers/index.js
````javascript
exports.timeout = function timeout (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

exports.flushConnections = async function (swarm) {
  await swarm.flush()
  await Promise.all(Array.from(swarm.connections).map(e => e.flush()))
  await new Promise(resolve => setImmediate(resolve))
}
````

## File: test/manual/measure-reconnect.js
````javascript
/**
 * The goal of this test is to measure how quickly a client reconnects
 * after manually switching networks / e.g. from wifi to mobile data.
 *
 * It requires some extra modules to get the relays:
 * npm install --no-save hypertrace hypercore-id-encoding @holepunchto/keet-default-config
 */

function customLogger (data) {
  console.log(`   ... ${data.id} ${Object.keys(data.caller.props || []).join(',')} ${data.caller.filename}:${data.caller.line}:${data.caller.column}`)
}
require('hypertrace').setTraceFunction(customLogger)

const { DEV_BLIND_RELAY_KEYS } = require('@holepunchto/keet-default-config')
const HypercoreId = require('hypercore-id-encoding')
const DEV_RELAY_KEYS = DEV_BLIND_RELAY_KEYS.map(HypercoreId.decode)
const relayThrough = (force) => force ? DEV_RELAY_KEYS : null

const Hyperswarm = require('../..')

const topic = Buffer.alloc(32).fill('measure-reconnect')
const seed = Buffer.alloc(32).fill('measure-reconnect' + require('os').hostname())

const swarm = new Hyperswarm({ seed, relayThrough })

swarm.dht.on('network-change', () => {
  console.log('NETWORK CHANGE')
  console.time('RECONNECTION TIME')
})

let connected = false

swarm.on('connection', async (conn) => {
  console.log(conn.rawStream.remoteHost)
  conn.on('error', console.log.bind(console))
  conn.on('close', console.log.bind(console))
  conn.on('data', (data) => console.log(data.toString('utf8')))
  conn.setKeepAlive(5000)
  conn.write('hello')
  if (!connected) {
    connected = true
    console.timeEnd('INITIAL CONNECTION TIME')
    return
  }
  console.timeEnd('RECONNECTION TIME')
})

console.time('INITIAL CONNECTION TIME')
swarm.join(topic)

// process.on('SIGINT', () => {
//   swarm.leave(topic).then(() => process.exit())
// })
````

## File: test/all.js
````javascript
// This runner is auto-generated by Brittle

runTests()

async function runTests () {
  const test = (await import('brittle')).default

  test.pause()

  await import('./bulk-timer.js')
  await import('./chaos.js')
  await import('./dups.js')
  await import('./firewall.js')
  await import('./peer-join.js')
  await import('./retry-timer.js')
  await import('./suspend.js')
  await import('./stats.js')
  await import('./swarm.js')
  await import('./update.js')

  test.resume()
}
````

## File: test/bulk-timer.js
````javascript
const test = require('brittle')

const BulkTimer = require('../lib/bulk-timer')

const TEST_INTERVAL = 500

test('bulk timer queue', async (t) => {
  t.plan(1)

  const timer = new BulkTimer(TEST_INTERVAL, batch => {
    t.alike(batch, [1, 2])
  })

  timer.add(1)
  timer.add(2)

  await waitForCalls(1)
  timer.destroy()
})

test('bulk timer queue (async)', async (t) => {
  t.plan(1)

  const timer = new BulkTimer(TEST_INTERVAL, batch => {
    t.alike(batch, [1, 2])
    timer.destroy()
  })

  timer.add(1)
  await new Promise(resolve => setImmediate(resolve))
  timer.add(2)

  await waitForCalls(1)
})

test('bulk timer queue different batch', async (t) => {
  t.plan(2)

  let calls = 0
  const timer = new BulkTimer(TEST_INTERVAL, batch => {
    if (calls++ === 0) {
      t.alike(batch, [1])
      return
    }
    t.alike(batch, [2])
    timer.destroy()
  })

  timer.add(1)
  await waitForCalls(1)

  timer.add(2)
  await waitForCalls(1)
})

test('bulk timer - nothing pending', async (t) => {
  let calls = 0
  const timer = new BulkTimer(TEST_INTERVAL, () => calls++)

  timer.add(1)
  await waitForCalls(1) // nothing should be pending after this
  t.alike(calls, 1)

  await waitForCalls(1)
  t.alike(calls, 1)

  timer.destroy()
})

function waitForCalls (n) {
  return new Promise(resolve => setTimeout(resolve, n * (TEST_INTERVAL * 1.5)))
}
````

## File: test/chaos.js
````javascript
const test = require('brittle')
const crypto = require('hypercore-crypto')
const createTestnet = require('hyperdht/testnet')
const { timeout } = require('./helpers')

const Hyperswarm = require('..')

const NUM_SWARMS = 10
const NUM_TOPICS = 15
const NUM_FORCE_DISCONNECTS = 30

const STARTUP_DURATION = 1000 * 5
const TEST_DURATION = 1000 * 45
const CHAOS_DURATION = 1000 * 10

const BACKOFFS = [
  100,
  1000,
  CHAOS_DURATION, // Summed value till here should be > CHAOS_DURATION, and this particular value should be less than TEST_DURATION - CHAOS_DURATION
  10000 // Note: the fourth backoff is irrelevant for this test, as it only triggers when peerInfo.explicit is true
]

test('chaos - recovers after random disconnections (takes ~60s)', async (t) => {
  t.timeout(90000)

  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarms = []
  const topics = []
  const connections = []
  const peersBySwarm = new Map()

  for (let i = 0; i < NUM_SWARMS; i++) {
    const swarm = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
    swarms.push(swarm)
    peersBySwarm.set(swarm, new Set())
    swarm.on('connection', conn => {
      connections.push(conn)

      conn.on('error', noop)
      conn.on('close', () => {
        clearInterval(timer)
        const idx = connections.indexOf(conn)
        if (idx === -1) return
        connections.splice(idx, 1)
      })

      const timer = setInterval(() => {
        conn.write(Buffer.alloc(10))
      }, 100)
      conn.write(Buffer.alloc(10))
    })
  }
  for (let i = 0; i < NUM_TOPICS; i++) {
    const topic = crypto.randomBytes(32)
    topics.push(topic)
  }

  for (const topic of topics) {
    const numSwarms = Math.round(Math.random() * NUM_SWARMS)
    const topicSwarms = new Set()
    for (let i = 0; i < numSwarms; i++) {
      topicSwarms.add(swarms[Math.floor(Math.random() * NUM_SWARMS)])
    }
    for (const swarm of topicSwarms) {
      const peers = peersBySwarm.get(swarm)
      for (const s of topicSwarms) {
        if (swarm === s) continue
        peers.add(s.keyPair.publicKey.toString('hex'))
      }
      await swarm.join(topic).flushed()
    }
  }

  for (const s of swarms) await s.flush()
  await timeout(STARTUP_DURATION)

  for (const [swarm, expectedPeers] of peersBySwarm) {
    t.alike(swarm.connections.size, expectedPeers.size, 'swarm has the correct number of connections after startup')
    const missingKeys = []
    for (const conn of swarm.connections) {
      const key = conn.remotePublicKey.toString('hex')
      if (!expectedPeers.has(key)) missingKeys.push(key)
    }
    t.alike(missingKeys.length, 0, 'swarm is not missing any expected peers after startup')
  }

  // Randomly destroy connections during the chaos period.
  for (let i = 0; i < NUM_FORCE_DISCONNECTS; i++) {
    const timeout = Math.floor(Math.random() * CHAOS_DURATION) // Leave a lot of room at the end for reestablishing connections (timeouts)
    setTimeout(() => {
      if (!connections.length) return
      const idx = Math.floor(Math.random() * connections.length)
      const conn = connections[idx]
      conn.destroy()
    }, timeout)
  }

  await timeout(TEST_DURATION) // Wait for the chaos to resolve

  for (const [swarm, expectedPeers] of peersBySwarm) {
    t.alike(swarm.connections.size, expectedPeers.size, 'swarm has the correct number of connections')
    const missingKeys = []
    for (const conn of swarm.connections) {
      const key = conn.remotePublicKey.toString('hex')
      if (!expectedPeers.has(key)) missingKeys.push(key)
    }
    t.alike(missingKeys.length, 0, 'swarm is not missing any expected peers')
  }

  for (const swarm of swarms) await swarm.destroy()
})

function noop () {}
````

## File: test/dups.js
````javascript
const test = require('brittle')
const createTestnet = require('hyperdht/testnet')
const Hyperswarm = require('../')

test('many servers', async t => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const topic = Buffer.alloc(32).fill('hello')

  const sub = t.test()
  const cnt = 10

  sub.plan(cnt)

  const swarms = []
  for (let i = 0; i < cnt; i++) {
    swarms.push(new Hyperswarm({ bootstrap }))
  }

  for (const swarm of swarms) {
    const missing = new Set()
    let done = false

    swarm.on('connection', conn => {
      missing.add(conn.remotePublicKey.toString('hex'))

      conn.on('error', noop)
      conn.on('close', function () {
        missing.delete(conn.remotePublicKey.toString('hex'))
      })

      if (!done && missing.size === cnt - 1) {
        done = true
        sub.pass('swarm fully connected')
      }
    })
  }

  const discovery = swarms[0].join(topic, { server: true })
  await discovery.flushed()

  for (const swarm of swarms) swarm.join(topic, { client: false, server: true })

  await Promise.all(swarms.map(s => s.flush()))

  for (const swarm of swarms) swarm.join(topic)

  const then = Date.now()
  await sub

  t.pass('fully connected swarm in ' + (Date.now() - then) + 'ms')

  for (const swarm of swarms) await swarm.destroy()
})

function noop () {}
````

## File: test/firewall.js
````javascript
const test = require('brittle')
const createTestnet = require('hyperdht/testnet')
const { timeout, flushConnections } = require('./helpers')

const Hyperswarm = require('..')

const BACKOFFS = [
  100,
  200,
  300,
  400
]

test('firewalled server - bad client is rejected', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
  const swarm2 = new Hyperswarm({
    bootstrap,
    backoffs: BACKOFFS,
    jitter: 0,
    firewall: remotePublicKey => {
      return remotePublicKey.equals(swarm1.keyPair.publicKey)
    }
  })

  let serverConnections = 0
  swarm2.on('connection', () => serverConnections++)

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm2.join(topic, { client: false, server: true }).flushed()

  swarm1.join(topic, { client: true, server: false })
  await flushConnections(swarm1)

  t.alike(serverConnections, 0, 'server did not receive an incoming connection')

  await swarm1.destroy()
  await swarm2.destroy()
})

test('firewalled client - bad server is rejected', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  t.plan(2)

  const swarm1 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
  const swarm2 = new Hyperswarm({
    bootstrap,
    backoffs: BACKOFFS,
    jitter: 0,
    firewall: remotePublicKey => {
      const firewalled = remotePublicKey.equals(swarm1.keyPair.publicKey)
      t.ok(firewalled, 'The peer got firewalled')
      return firewalled
    }
  })

  let clientConnections = 0
  swarm2.on('connection', () => clientConnections++)

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic, { client: false, server: true }).flushed()

  swarm2.join(topic, { client: true, server: false })
  await flushConnections(swarm2)

  t.alike(clientConnections, 0, 'client did not receive an incoming connection')

  await swarm1.destroy()
  await swarm2.destroy()
})

test('firewalled server - rejection does not trigger retry cascade', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })

  let firewallCalls = 0
  const swarm2 = new Hyperswarm({
    bootstrap,
    backoffs: BACKOFFS,
    jitter: 0,
    firewall: remotePublicKey => {
      firewallCalls++
      return remotePublicKey.equals(swarm1.keyPair.publicKey)
    }
  })

  let serverConnections = 0
  swarm2.on('connection', () => serverConnections++)

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm2.join(topic).flushed()

  swarm1.join(topic)

  await timeout(BACKOFFS[2] * 5) // Wait for many retries -- there should only be 3

  t.alike(serverConnections, 0, 'server did not receive an incoming connection')
  t.alike(firewallCalls, 1, 'client retried mulitple times but server cached it')

  await swarm1.destroy()
  await swarm2.destroy()
})
````

## File: test/peer-join.js
````javascript
const test = require('brittle')
const createTestnet = require('hyperdht/testnet')

const Hyperswarm = require('..')

test('join peer - can establish direct connections to public keys', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })

  await swarm2.listen() // Ensure that swarm2's public key is being announced

  const firstConnection = t.test('first connection')
  firstConnection.plan(2)

  const connections = t.test('connections')
  connections.plan(4)

  let s2Connected = false
  let s1Connected = false

  swarm2.on('connection', conn => {
    conn.on('error', noop)
    if (!s2Connected) {
      firstConnection.pass('swarm2 got its first connection')
      s2Connected = true
    }
    connections.pass('swarm2 got a connection')
  })
  swarm1.on('connection', conn => {
    conn.on('error', noop)
    if (!s1Connected) {
      firstConnection.pass('swarm1 got its first connection')
      s1Connected = true
    }
    connections.pass('swarm1 got a connection')
  })

  swarm1.joinPeer(swarm2.keyPair.publicKey)
  await firstConnection

  for (const conn of swarm1.connections) {
    conn.end()
  }
  for (const conn of swarm2.connections) {
    conn.end()
  }
  await swarm1.flush() // Should reconnect

  await connections

  await swarm1.destroy()
  await swarm2.destroy()
})

test('join peer - attempt to connect to self is a no-op', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm = new Hyperswarm({ bootstrap })
  await swarm.listen()

  swarm.joinPeer(swarm.keyPair.publicKey)
  t.alike(swarm._queue.length, 0)

  await swarm.destroy()
})

test('leave peer - will stop reconnecting to previously joined peers', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })

  await swarm2.listen() // Ensure that swarm2's public key is being announced

  const open = t.test('open')
  open.plan(2)

  const close = t.test('close')
  close.plan(2)

  swarm2.on('connection', conn => {
    conn.once('close', () => close.pass('swarm2 connection closed'))
    open.pass('swarm2 got a connection')
  })
  swarm1.on('connection', conn => {
    conn.once('close', conn => close.pass('swarm1 connection closed'))
    open.pass('swarm1 got a connection')
  })

  swarm1.joinPeer(swarm2.keyPair.publicKey)

  await open

  swarm1.removeAllListeners('connection')
  swarm2.removeAllListeners('connection')

  swarm1.leavePeer(swarm2.keyPair.publicKey)
  t.alike(swarm1.explicitPeers.size, 0)
  t.alike(swarm1.connections.size, 1)
  t.alike(swarm2.connections.size, 1)

  swarm2.on('connection', conn => {
    t.fail('swarm2 got a connection after leave')
  })
  swarm1.on('connection', conn => {
    t.fail('swarm1 got a connection after leave')
  })

  for (const conn of swarm1.connections) {
    conn.end()
  }
  for (const conn of swarm2.connections) {
    conn.end()
  }
  await close

  t.alike(swarm1.connections.size, 0)
  t.alike(swarm2.connections.size, 0)

  await swarm1.destroy()
  await swarm2.destroy()
})

test('leave peer - no memory leak if other side closed connection first', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  t.plan(9)

  // No need to wait between retries, we just want to test
  // that it cleans up after the failed retry
  const instaBackoffs = [0, 0, 0, 0]
  const swarm1 = new Hyperswarm({ bootstrap, backoffs: instaBackoffs, jitter: 0 })
  const swarm2 = new Hyperswarm({ bootstrap })

  let hasBeen1 = false
  swarm1.on('update', async () => {
    if (swarm1.peers.size > 0) hasBeen1 = true
    if (hasBeen1 && swarm1.peers.size === 0) {
      t.pass('No peerInfo memory leak')
      t.is(swarm1.explicitPeers.size, 0)
      t.is(swarm1.connections.size, 0)

      swarm1.destroy()
    }
  })

  await swarm2.listen() // Ensure that swarm2's public key is being announced

  const open = t.test('open')
  open.plan(2)

  const close = t.test('close')
  close.plan(2)

  swarm2.on('connection', conn => {
    conn.once('close', () => close.pass('swarm2 connection closed'))
    open.pass('swarm2 got a connection')
    conn.on('error', noop)
  })
  swarm1.on('connection', conn => {
    conn.once('close', () => close.pass('swarm1 connection closed'))
    open.pass('swarm1 got a connection')
    conn.on('error', noop)
  })

  swarm1.joinPeer(swarm2.keyPair.publicKey)

  await open

  swarm1.removeAllListeners('connection')
  swarm2.removeAllListeners('connection')

  t.is(swarm1.connections.size, 1)

  await swarm2.destroy()
  await close

  t.is(swarm1.connections.size, 0)
  t.is(swarm1.peers.size, 1)
  t.is(swarm1.explicitPeers.size, 1)

  swarm1.leavePeer(swarm2.keyPair.publicKey)
})

function noop () {}
````

## File: test/retry-timer.js
````javascript
const test = require('brittle')
const crypto = require('hypercore-crypto')
const { timeout } = require('./helpers')

const RetryTimer = require('../lib/retry-timer')
const PeerInfo = require('../lib/peer-info')

const BACKOFFS = [
  50,
  150,
  250,
  350
]
const MAX_JITTER = 20

const isLinux = process.platform === 'linux'

// Windows and Mac CI are slow, running on Linux only is enough
test('retry timer - proven peer reinsertion', { skip: !isLinux }, async (t) => {
  let calls = 0
  const rt = new RetryTimer(() => calls++, {
    backoffs: BACKOFFS,
    jitter: MAX_JITTER
  })

  const peerInfo = randomPeerInfo()

  rt.add(peerInfo)

  const msMargin = 50
  await timeout(BACKOFFS[0] + MAX_JITTER + msMargin)
  t.is(calls, 1)

  setQuickRetry(peerInfo)
  rt.add(peerInfo)

  await timeout(BACKOFFS[0] + MAX_JITTER + msMargin)

  t.is(calls, 2)

  rt.destroy()
})

test('retry timer - forget unresponsive', async (t) => {
  let calls = 0
  const rt = new RetryTimer(() => calls++, {
    backoffs: BACKOFFS,
    jitter: MAX_JITTER
  })

  const peerInfo = randomPeerInfo()

  rt.add(peerInfo)

  await timeout(BACKOFFS[0] + MAX_JITTER)

  setUnresponsive(peerInfo)
  rt.add(peerInfo)

  await timeout(BACKOFFS[2] + MAX_JITTER)

  t.is(calls, 1) // The second `add` should not trigger any more retries

  rt.destroy()
})

test('retry timer - does not retry banned peers', async (t) => {
  let calls = 0
  const rt = new RetryTimer(() => calls++, {
    backoffs: BACKOFFS,
    jitter: MAX_JITTER
  })

  const peerInfo = randomPeerInfo()
  rt.add(peerInfo)

  await timeout(BACKOFFS[0] + MAX_JITTER)

  peerInfo.ban(true)
  rt.add(peerInfo)

  await timeout(BACKOFFS[2] + MAX_JITTER)

  t.is(calls, 1) // The second `add` should not trigger any more retries

  rt.destroy()
})

function randomPeerInfo () {
  return new PeerInfo({
    publicKey: crypto.randomBytes(32)
  })
}

function setQuickRetry (peerInfo) {
  peerInfo.proven = true
  peerInfo.reconnect(true)
  peerInfo.attempts = 1
}

function setUnresponsive (peerInfo) {
  peerInfo.proven = false
  peerInfo.reconnect(true)
  peerInfo.attempts = 4
}
````

## File: test/stats.js
````javascript
const test = require('brittle')
const createTestnet = require('hyperdht/testnet')

const Hyperswarm = require('..')

test('connectionsOpened and connectionsClosed stats', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })

  const tOpen = t.test('Open connection')
  tOpen.plan(3)
  const tClose = t.test('Close connection')
  tClose.plan(4)

  t.teardown(async () => {
    await swarm1.destroy()
    await swarm2.destroy()
  })

  swarm2.on('connection', (conn) => {
    conn.on('error', noop)

    tOpen.is(swarm2.stats.connects.client.opened, 1, 'opened connection is in stats')
    tOpen.is(swarm2.stats.connects.client.attempted, 1, 'attemped connection is in stats')
    tClose.is(swarm2.stats.connects.client.closed, 0, 'sanity check')

    conn.on('close', () => {
      tClose.is(swarm2.stats.connects.client.closed, 1, 'closed connection is in stats')
    })

    conn.end()
  })

  swarm1.on('connection', (conn) => {
    conn.on('error', () => noop)

    conn.on('open', () => {
      tOpen.is(swarm1.stats.connects.server.opened, 1, 'opened server connection is in stats')
      tClose.is(swarm1.stats.connects.server.closed, 0, 'Sanity check')
    })

    conn.on('close', () => {
      tClose.is(swarm1.stats.connects.server.closed, 1, 'closed connections is in stats')
    })

    conn.end()
  })

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic, { server: true, client: false }).flushed()
  swarm2.join(topic, { client: true, server: false })

  await tClose
})

function noop () {}
````

## File: test/suspend.js
````javascript
const test = require('brittle')
const createTestnet = require('hyperdht/testnet')

const Hyperswarm = require('..')

test('suspend + resume', async (t) => {
  t.plan(4)

  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })

  t.teardown(async () => {
    await swarm1.destroy()
    await swarm2.destroy()
  })

  const topic = Buffer.alloc(32).fill('hello world')

  swarm1.on('connection', function (socket) {
    t.pass('swarm1 received connection')
    socket.on('error', () => {})
  })

  swarm2.on('connection', function (socket) {
    t.pass('swarm2 received connection')
    socket.on('error', () => {})
  })

  const discovery = swarm1.join(topic, { server: true, client: false })
  await discovery.flushed()

  swarm2.join(topic, { client: true, server: false })
  await swarm2.flush()

  t.comment('suspended swarm2')
  swarm2.suspend()

  setTimeout(() => {
    t.comment('resumed swarm2')
    swarm2.resume()
  }, 2000)
})
````

## File: test/swarm.js
````javascript
const test = require('brittle')
const createTestnet = require('hyperdht/testnet')
const { timeout, flushConnections } = require('./helpers')
const b4a = require('b4a')

const Hyperswarm = require('..')

const BACKOFFS = [
  100,
  200,
  300,
  400
]

test('one server, one client - first connection', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })

  t.plan(1)

  t.teardown(async () => {
    await swarm1.destroy()
    await swarm2.destroy()
  })

  swarm2.on('connection', (conn) => {
    t.pass('swarm2')
    conn.on('error', noop)
    conn.end()
  })
  swarm1.on('connection', (conn) => {
    conn.on('error', noop)
    conn.end()
  })

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic, { server: true, client: false }).flushed()
  swarm2.join(topic, { client: true, server: false })
})

test('two servers - first connection', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })

  const connection1Test = t.test('connection1')
  const connection2Test = t.test('connection2')

  connection1Test.plan(1)
  connection2Test.plan(1)

  t.teardown(async () => {
    await swarm1.destroy()
    await swarm2.destroy()
  })

  swarm1.on('connection', (conn) => {
    conn.on('error', noop)
    connection1Test.pass('swarm1')
    conn.end()
  })
  swarm2.on('connection', (conn) => {
    conn.on('error', noop)
    connection2Test.pass('swarm2')
    conn.end()
  })

  const topic = Buffer.alloc(32).fill('hello world')

  await swarm1.join(topic).flushed()
  await swarm2.join(topic).flushed()
})

test('one server, one client - single reconnect', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
  const swarm2 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })

  const serverReconnectsTest = t.test('server reconnects')
  const clientReconnectsTest = t.test('client reconnects')

  serverReconnectsTest.plan(1)
  clientReconnectsTest.plan(1)

  t.teardown(async () => {
    await swarm1.destroy()
    await swarm2.destroy()
  })

  let hasClientConnected = false
  let serverDisconnected = false

  swarm2.on('connection', (conn) => {
    conn.on('error', noop)

    if (!hasClientConnected) {
      hasClientConnected = true
      return
    }

    clientReconnectsTest.pass('client reconnected')
  })

  swarm1.on('connection', async (conn) => {
    conn.on('error', noop)

    if (!serverDisconnected) {
      serverDisconnected = true

      // Ensure connection is setup for client too
      // before we destroy it
      await flushConnections(swarm2)
      if (!hasClientConnected) t.fail('Logical error in the test: the client should be connected by now')

      conn.destroy()
      return
    }
    serverReconnectsTest.pass('Server reconnected')
  })

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic, { client: false, server: true }).flushed()
  swarm2.join(topic, { client: true, server: false })
})

test('one server, one client - maximum reconnects', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
  const swarm2 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })

  let connections = 0
  swarm2.on('connection', (conn, info) => {
    connections++
    conn.on('error', noop)
    conn.destroy()
  })
  swarm1.on('connection', (conn) => {
    conn.on('error', noop)
  })

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic, { client: false, server: true }).flushed()
  swarm2.join(topic, { client: true, server: false })

  await timeout(BACKOFFS[2] * 4)
  t.ok(connections > 1, 'client saw more than one retry (' + connections + ')')
  t.ok(connections < 5, 'client saw less than five attempts')

  await swarm1.destroy()
  await swarm2.destroy()
})

test('one server, one client - banned peer does not reconnect', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
  const swarm2 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })

  let connections = 0
  swarm2.on('connection', (conn, info) => {
    connections++
    info.ban(true)
    conn.on('error', noop)
    conn.destroy()
  })
  swarm1.on('connection', (conn) => {
    conn.on('error', noop)
  })

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic, { client: false, server: true }).flushed()
  swarm2.join(topic, { client: true, server: false })

  await timeout(BACKOFFS[2] * 2) // Wait for 2 long backoffs
  t.is(connections, 1, 'banned peer was not retried')

  await swarm1.destroy()
  await swarm2.destroy()
})

test('two servers, two clients - simple deduplication', async (t) => {
  const connection1Test = t.test('connection1')
  const connection2Test = t.test('connection2')

  connection1Test.plan(1)
  connection2Test.plan(1)

  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
  const swarm2 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })

  t.teardown(async () => {
    await swarm1.destroy()
    await swarm2.destroy()
  })

  swarm1.on('connection', (conn) => {
    connection1Test.pass('Swarm 1 connection')
    conn.on('error', noop)
  })
  swarm2.on('connection', (conn) => {
    connection2Test.pass('Swarm 2 connection')
    conn.on('error', noop)
  })

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic).flushed()
  await swarm2.join(topic).flushed()
})

test('one server, two clients - topic multiplexing', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
  const swarm2 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })

  let clientConnections = 0
  let peerInfo = null

  swarm2.on('connection', (conn, info) => {
    clientConnections++
    peerInfo = info
    conn.on('error', noop)
  })

  swarm1.on('connection', (conn) => conn.on('error', noop))

  const topic1 = Buffer.alloc(32).fill('hello world')
  const topic2 = Buffer.alloc(32).fill('hi world')

  await swarm1.join(topic1, { client: false, server: true }).flushed()
  await swarm1.join(topic2, { client: false, server: true }).flushed()
  swarm2.join(topic1, { client: true, server: false })
  swarm2.join(topic2, { client: true, server: false })

  await swarm2.flush()
  await swarm1.flush()

  t.is(clientConnections, 1)
  t.is(peerInfo.topics.length, 2)

  await swarm1.destroy()
  await swarm2.destroy()
})

test('one server, two clients - first connection', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })
  const swarm3 = new Hyperswarm({ bootstrap })

  const connection1To2Test = t.test('connection 1 to 2')
  const connection1To3Test = t.test('connection 1 to 3')

  const connection2Test = t.test('connection2')
  const connection3Test = t.test('connection3')

  connection1To2Test.plan(1)
  connection1To3Test.plan(1)
  connection2Test.plan(1)
  connection3Test.plan(1)

  t.teardown(async () => {
    await swarm1.destroy()
    await swarm2.destroy()
    await swarm3.destroy()
  })

  swarm1.on('connection', (conn, info) => {
    if (b4a.equals(info.publicKey, swarm2.keyPair.publicKey)) {
      connection1To2Test.pass('Swarm1 connected with swarm2')
    } else if (b4a.equals(info.publicKey, swarm3.keyPair.publicKey)) {
      connection1To3Test.pass('Swarm1 connected with swarm3')
    } else {
      t.fail('Unexpected connection')
    }
    conn.on('error', noop)
  })
  swarm2.on('connection', (conn, info) => {
    connection2Test.ok(b4a.equals(info.publicKey, swarm1.keyPair.publicKey), 'swarm2 connected with swarm1')
    conn.on('error', noop)
  })
  swarm3.on('connection', (conn, info) => {
    connection3Test.ok(b4a.equals(info.publicKey, swarm1.keyPair.publicKey), 'swarm3 connected with swarm1')
    conn.on('error', noop)
  })

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic, { server: true, client: false }).flushed()
  swarm2.join(topic, { server: false, client: true })
  swarm3.join(topic, { server: false, client: true })
})

test('one server, two clients - if a second client joins after the server leaves, they will not connect', async (t) => {
  t.plan(2)

  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
  const swarm2 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
  const swarm3 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })

  swarm1.on('connection', (conn) => {
    conn.on('error', noop)
  })

  swarm2.on('connection', (conn) => conn.on('error', noop))
  swarm3.on('connection', (conn) => conn.on('error', noop))

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic).flushed()

  swarm2.join(topic, { client: true, server: false })

  await flushConnections(swarm2)

  await swarm1.leave(topic)
  await flushConnections(swarm1)

  swarm3.join(topic, { client: true, server: false })
  await flushConnections(swarm3)

  t.is(swarm2.connections.size, 1)
  t.is(swarm3.connections.size, 0)

  await swarm1.destroy()
  await swarm2.destroy()
  await swarm3.destroy()
})

test('two servers, one client - refreshing a peer discovery instance discovers new server', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
  const swarm2 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
  const swarm3 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })

  let clientConnections = 0
  swarm3.on('connection', (conn) => {
    clientConnections++
    conn.on('error', noop)
  })

  swarm1.on('connection', (conn) => conn.on('error', noop))
  swarm2.on('connection', (conn) => conn.on('error', noop))

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic).flushed()
  const discovery = swarm3.join(topic, { client: true, server: false })

  await flushConnections(swarm3)
  t.is(clientConnections, 1)

  await swarm2.join(topic).flushed()
  await flushConnections(swarm2)
  t.is(clientConnections, 1)

  await discovery.refresh()
  await flushConnections(swarm3)
  t.is(clientConnections, 2)

  await swarm1.destroy()
  await swarm2.destroy()
  await swarm3.destroy()
})

test('one server, one client - correct deduplication when a client connection is destroyed', async (t) => {
  t.plan(4)
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
  const swarm2 = new Hyperswarm({ bootstrap, backoffs: BACKOFFS, jitter: 0 })
  t.teardown(async () => {
    await swarm1.destroy()
    await swarm2.destroy()
  })

  let clientConnections = 0
  let serverConnections = 0
  let clientData = 0
  let serverData = 0

  swarm1.on('connection', (conn) => {
    serverConnections++
    conn.on('error', noop)
    conn.on('data', () => {
      if (++serverData >= 2) {
        t.is(serverConnections, 2, 'Server opened second connection')
        t.pass(serverData, 2, 'Received data from second connection')
      }
    })
    conn.write('hello world')
  })
  swarm2.on('connection', (conn) => {
    clientConnections++
    conn.on('error', noop)
    conn.on('data', () => {
      if (++clientData >= 2) {
        t.is(clientConnections, 2, 'Client opened second connection')
        t.is(clientData, 2, 'Received data from second connection')
      }
    })
    conn.write('hello world')

    if (clientConnections === 1) setTimeout(() => conn.destroy(), 50) // Destroy the first client connection
  })

  const topic = Buffer.alloc(32).fill('hello world')

  await swarm1.join(topic, { server: true, client: false }).flushed()
  swarm2.join(topic, { server: false, client: true })
})

test('flush when max connections reached', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap, maxPeers: 1 })
  const swarm3 = new Hyperswarm({ bootstrap, maxPeers: 1 })

  const topic = Buffer.alloc(32).fill('hello world')

  await swarm1.join(topic, { server: true }).flushed()

  await swarm2
    .on('connection', (conn) => conn.on('error', noop))
    .join(topic, { client: true })
    .flushed()

  await swarm3
    .on('connection', (conn) => conn.on('error', noop))
    .join(topic, { client: true })
    .flushed()

  await swarm2.flush()
  await swarm3.flush()

  t.pass('flush resolved')

  await swarm1.destroy()
  await swarm2.destroy()
  await swarm3.destroy()
})

test('rejoining with different client/server opts refreshes', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })

  const topic = Buffer.alloc(32).fill('hello world')

  swarm1.join(topic, { client: true, server: false })
  await swarm1.join(topic, { client: true, server: true }).flushed()

  await swarm2
    .on('connection', (conn) => conn.on('error', noop))
    .join(topic, { client: true })
    .flushed()

  await swarm2.flush()

  t.is(swarm2.connections.size, 1)

  await swarm1.destroy()
  await swarm2.destroy()
})

test('topics returns peer-discovery objects', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm = new Hyperswarm({ bootstrap })
  const topic1 = Buffer.alloc(32).fill('topic 1')
  const topic2 = Buffer.alloc(32).fill('topic 2')

  swarm.join(topic1)
  swarm.join(topic2)

  const peerDiscoveries = swarm.topics()

  t.alike(peerDiscoveries.next().value.topic, topic1)
  t.alike(peerDiscoveries.next().value.topic, topic2)

  await swarm.destroy()
})

test('multiple discovery sessions with different opts', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })

  const topic = Buffer.alloc(32).fill('hello world')

  const connection1Test = t.test('connection1')
  const connection2Test = t.test('connection2')

  connection1Test.plan(1)
  connection2Test.plan(1)

  t.teardown(async () => {
    await swarm1.destroy()
    await swarm2.destroy()
  })

  swarm1.on('connection', (conn) => {
    connection1Test.pass('swarm1')
    conn.on('error', noop)
  })

  swarm2.on('connection', (conn) => {
    connection2Test.pass('swarm2')
    conn.on('error', noop)
  })

  await swarm1.join(topic).flushed()
  await swarm1.flush()

  const discovery1 = swarm2.join(topic, { client: true, server: false })
  swarm2.join(topic, { client: false, server: true })

  await discovery1.destroy() // should not prevent server connections
})

test('closing all discovery sessions clears all peer-discovery objects', async t => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm = new Hyperswarm({ bootstrap })

  const topic1 = Buffer.alloc(32).fill('hello')
  const topic2 = Buffer.alloc(32).fill('world')

  const discovery1 = swarm.join(topic1, { client: true, server: false })
  const discovery2 = swarm.join(topic2, { client: false, server: true })

  t.is(swarm._discovery.size, 2)

  await Promise.all([discovery1.destroy(), discovery2.destroy()])

  t.is(swarm._discovery.size, 0)

  await swarm.destroy()
})

test('peer-discovery object deleted when corresponding connection closes (server)', async t => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })

  const connected = t.test('connection')
  connected.plan(1)

  const otherConnected = t.test('connection')
  otherConnected.plan(1)

  swarm2.on('connection', (conn) => {
    connected.pass('swarm2')
    conn.on('error', noop)
  })

  let resolveConnClosed = null
  const connClosed = new Promise(resolve => {
    resolveConnClosed = resolve
  })
  swarm1.on('connection', (conn) => {
    otherConnected.pass('swarm1')
    conn.on('error', noop)
    conn.on('close', resolveConnClosed)
  })

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic, { server: true, client: false }).flushed()

  swarm2.join(topic, { client: true, server: false })
  await swarm2.flush()

  await connected
  await otherConnected

  t.is(swarm1.peers.size, 1)
  await swarm2.destroy()

  // Ensure other side detects closed connection
  await connClosed

  t.is(swarm1.peers.size, 0, 'No peerInfo memory leak')

  await swarm1.destroy()
})

test('peer-discovery object deleted when corresponding connection closes (client)', async t => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  t.plan(3)
  // We want to test it eventually gets gc'd after all the retries
  // so we don't care about waiting between retries
  const instaBackoffs = [0, 0, 0, 0]
  const swarm1 = new Hyperswarm({ bootstrap, backoffs: instaBackoffs, jitter: 0 })
  const swarm2 = new Hyperswarm({ bootstrap, backoffs: instaBackoffs, jitter: 0 })

  let hasBeen1 = false
  swarm2.on('update', async () => {
    if (swarm2.peers.size > 0) hasBeen1 = true
    if (hasBeen1 && swarm2.peers.size === 0) {
      t.pass('No peerInfo memory leak')
      swarm2.destroy()
    }
  })

  const connected = t.test('connection')
  connected.plan(1)

  swarm2.on('connection', (conn) => {
    connected.pass('swarm2')
    conn.on('error', noop)
  })
  swarm1.on('connection', (conn) => {
    conn.on('error', noop)
  })

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic, { server: true, client: false }).flushed()

  swarm2.join(topic, { client: true, server: false })
  await swarm2.flush()

  t.is(swarm2.peers.size, 1)
  await swarm1.destroy()
})

test('no default error handler set when connection event is emitted', async (t) => {
  t.plan(2)

  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })

  t.teardown(async () => {
    await swarm1.destroy()
    await swarm2.destroy()
  })

  swarm2.on('connection', (conn) => {
    t.is(conn.listeners('error').length, 0, 'no error listeners')
    conn.on('error', noop)
    conn.end()
  })
  swarm1.on('connection', (conn) => {
    t.is(conn.listeners('error').length, 0, 'no error listeners')
    conn.on('error', noop)
    conn.end()
  })

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic, { server: true, client: false }).flushed()
  swarm2.join(topic, { client: true, server: false })
})

test('peerDiscovery has unslabbed closestNodes', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })

  const tConnect = t.test('connected')
  tConnect.plan(2)

  t.teardown(async () => {
    await swarm1.destroy()
    await swarm2.destroy()
  })

  swarm2.on('connection', (conn) => {
    conn.on('error', noop)
    tConnect.pass('swarm2 connected')
  })
  swarm1.on('connection', (conn) => {
    conn.on('error', noop)
    tConnect.pass('swarm1 connected')
  })

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic, { server: true, client: false }).flushed()
  swarm2.join(topic, { client: true, server: false })

  await tConnect

  const closestNodes = [...swarm1._discovery.values()][0]._closestNodes
  const bufferSizes = closestNodes.map(n => n.id.buffer.byteLength)
  t.is(bufferSizes[0], 32, 'unslabbed clostestNodes entry')

  const hasUnslabbeds = bufferSizes.filter(s => s !== 32).length !== 0
  t.is(hasUnslabbeds, false, 'sanity check: all are unslabbed')
})

test('topic and peer get unslabbed in PeerInfo', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })

  t.plan(3)

  t.teardown(async () => {
    await swarm1.destroy()
    await swarm2.destroy()
  })

  swarm2.on('connection', (conn) => {
    t.is(
      [...swarm2.peers.values()][0].publicKey.buffer.byteLength,
      32,
      'unslabbed publicKey in peerInfo'
    )
    t.is([...swarm2.peers.values()][0].topics[0].buffer.byteLength,
      32,
      'unslabbed topic in peerInfo'
    )

    conn.on('error', noop)
    conn.end()
  })
  swarm1.on('connection', (conn) => {
    t.is(
      [...swarm1.peers.values()][0].publicKey.buffer.byteLength,
      32,
      'unslabbed publicKey in peerInfo'
    )

    conn.on('error', noop)
    conn.end()
  })

  const topic = Buffer.alloc(32).fill('hello world')
  await swarm1.join(topic, { server: true, client: false }).flushed()
  swarm2.join(topic, { client: true, server: false })
})

test('port opt gets passed on to hyperdht', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap, port: [10000, 10100] })
  t.alike(swarm1.dht.io.portRange, [10000, 10100])
  await swarm1.destroy()
})

function noop () {}
````

## File: test/update.js
````javascript
const test = require('brittle')
const Hyperswarm = require('..')
const createTestnet = require('hyperdht/testnet')

test('connecting', async (t) => {
  t.plan(5)

  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })
  const topic = Buffer.alloc(32).fill('hello world')

  t.teardown(async () => {
    await swarm1.destroy()
    await swarm2.destroy()
  })

  t.is(swarm2.connecting, 0)

  swarm2.on('update', function onUpdate1 () {
    if (swarm2.connecting === 1) {
      t.pass('connecting (1)')

      swarm2.off('update', onUpdate1)

      swarm2.on('update', function onUpdate0 () {
        if (swarm2.connecting === 0) {
          t.pass('connecting (0)')
          swarm2.off('update', onUpdate0)
        }
      })
    }
  })

  swarm1.on('connection', function (socket) {
    socket.end()
    socket.on('close', () => t.pass())
  })

  swarm2.on('connection', function (socket) {
    socket.end()
    socket.on('close', () => t.pass())
  })

  const discovery = swarm1.join(topic, { server: true, client: false })
  await discovery.flushed()

  swarm2.join(topic, { client: true, server: false })
  await swarm2.flush()
})
````

## File: .gitignore
````
node_modules
package-lock.json
sandbox.js
sandbox
.nyc_output
coverage
*.0x
````

## File: .travis.yml
````yaml
language: node_js
sudo: true
node_js:
  - 10
  - 12
  - 14
os:
  - windows
  - linux
  - osx
script:
  - npm run ci
````

## File: example.js
````javascript
const Swarm = require('.')

start()

async function start () {
  const swarm1 = new Swarm({ seed: Buffer.alloc(32).fill(4) })
  const swarm2 = new Swarm({ seed: Buffer.alloc(32).fill(5) })

  console.log('SWARM 1 KEYPAIR:', swarm1.keyPair)
  console.log('SWARM 2 KEYPAIR:', swarm2.keyPair)

  swarm1.on('connection', function (connection, info) {
    console.log('swarm 1 got a server connection:', connection.remotePublicKey, connection.publicKey, connection.handshakeHash)
    connection.on('error', err => console.error('1 CONN ERR:', err))
    // Do something with `connection`
    // `info` is a PeerInfo object
  })
  swarm2.on('connection', function (connection, info) {
    console.log('swarm 2 got a client connection:', connection.remotePublicKey, connection.publicKey, connection.handshakeHash)
    connection.on('error', err => console.error('2 CONN ERR:', err))
  })

  const key = Buffer.alloc(32).fill(7)

  const discovery1 = swarm1.join(key)
  await discovery1.flushed() // Wait for the first lookup/annnounce to complete.

  swarm2.join(key)

  // await swarm2.flush()
  // await discovery.destroy() // Stop lookup up and announcing this topic.
}
````

## File: index.js
````javascript
const { EventEmitter } = require('events')
const DHT = require('hyperdht')
const spq = require('shuffled-priority-queue')
const b4a = require('b4a')
const unslab = require('unslab')

const PeerInfo = require('./lib/peer-info')
const RetryTimer = require('./lib/retry-timer')
const ConnectionSet = require('./lib/connection-set')
const PeerDiscovery = require('./lib/peer-discovery')

const MAX_PEERS = 64
const MAX_PARALLEL = 3
const MAX_CLIENT_CONNECTIONS = Infinity // TODO: Change
const MAX_SERVER_CONNECTIONS = Infinity

const ERR_MISSING_TOPIC = 'Topic is required and must be a 32-byte buffer'
const ERR_DESTROYED = 'Swarm has been destroyed'
const ERR_DUPLICATE = 'Duplicate connection'

module.exports = class Hyperswarm extends EventEmitter {
  constructor (opts = {}) {
    super()
    const {
      seed,
      relayThrough,
      keyPair = DHT.keyPair(seed),
      maxPeers = MAX_PEERS,
      maxClientConnections = MAX_CLIENT_CONNECTIONS,
      maxServerConnections = MAX_SERVER_CONNECTIONS,
      maxParallel = MAX_PARALLEL,
      firewall = allowAll
    } = opts
    this.keyPair = keyPair

    this.dht = opts.dht || new DHT({
      bootstrap: opts.bootstrap,
      nodes: opts.nodes,
      port: opts.port
    })
    this.server = this.dht.createServer({
      firewall: this._handleFirewall.bind(this),
      relayThrough: this._maybeRelayConnection.bind(this)
    }, this._handleServerConnection.bind(this))

    this.destroyed = false
    this.suspended = false
    this.maxPeers = maxPeers
    this.maxClientConnections = maxClientConnections
    this.maxServerConnections = maxServerConnections
    this.maxParallel = maxParallel
    this.relayThrough = relayThrough || null

    this.connecting = 0
    this.connections = new Set()
    this.peers = new Map()
    this.explicitPeers = new Set()
    this.listening = null
    this.stats = {
      updates: 0,
      connects: {
        client: {
          opened: 0,
          closed: 0,
          attempted: 0
        },
        server: {
          // Note: there is no notion of 'attempts' for server connections
          opened: 0,
          closed: 0
        }
      }
    }

    this._discovery = new Map()
    this._timer = new RetryTimer(this._requeue.bind(this), {
      backoffs: opts.backoffs,
      jitter: opts.jitter
    })
    this._queue = spq()

    this._allConnections = new ConnectionSet()
    this._pendingFlushes = []
    this._flushTick = 0

    this._drainingQueue = false
    this._clientConnections = 0
    this._serverConnections = 0
    this._firewall = firewall

    this.dht.on('network-change', this._handleNetworkChange.bind(this))
    this.on('update', this._handleUpdate)
  }

  _maybeRelayConnection (force) {
    if (!this.relayThrough) return null
    return this.relayThrough(force)
  }

  _enqueue (peerInfo) {
    if (peerInfo.queued) return
    peerInfo.queued = true
    peerInfo._flushTick = this._flushTick
    this._queue.add(peerInfo)

    this._attemptClientConnections()
  }

  _requeue (batch) {
    if (this.suspended) return
    for (const peerInfo of batch) {
      peerInfo.waiting = false

      if ((peerInfo._updatePriority() === false) || this._allConnections.has(peerInfo.publicKey) || peerInfo.queued) continue
      peerInfo.queued = true
      peerInfo._flushTick = this._flushTick
      this._queue.add(peerInfo)
    }

    this._attemptClientConnections()
  }

  _flushMaybe (peerInfo) {
    for (let i = 0; i < this._pendingFlushes.length; i++) {
      const flush = this._pendingFlushes[i]
      if (peerInfo._flushTick > flush.tick) continue
      if (--flush.missing > 0) continue
      flush.onflush(true)
      this._pendingFlushes.splice(i--, 1)
    }
  }

  _flushAllMaybe () {
    if (this.connecting > 0 || (this._allConnections.size < this.maxPeers && this._clientConnections < this.maxClientConnections)) {
      return false
    }

    while (this._pendingFlushes.length) {
      const flush = this._pendingFlushes.pop()
      flush.onflush(true)
    }

    return true
  }

  _shouldConnectExplicit () {
    return !this.destroyed &&
      !this.suspended &&
      this.connecting < this.maxParallel
  }

  _shouldConnect () {
    return !this.destroyed &&
      !this.suspended &&
      this.connecting < this.maxParallel &&
      this._allConnections.size < this.maxPeers &&
      this._clientConnections < this.maxClientConnections
  }

  _shouldRequeue (peerInfo) {
    if (this.suspended) return false
    if (peerInfo.explicit) return true
    for (const topic of peerInfo.topics) {
      if (this._discovery.has(b4a.toString(topic, 'hex')) && !this.destroyed) {
        return true
      }
    }
    return false
  }

  _connect (peerInfo, queued) {
    if (peerInfo.banned || this._allConnections.has(peerInfo.publicKey)) {
      if (queued) this._flushMaybe(peerInfo)
      return
    }

    // TODO: Support async firewalling at some point.
    if (this._handleFirewall(peerInfo.publicKey, null)) {
      peerInfo.ban(true)
      if (queued) this._flushMaybe(peerInfo)
      return
    }

    const relayThrough = this._maybeRelayConnection(peerInfo.forceRelaying)
    const conn = this.dht.connect(peerInfo.publicKey, {
      relayAddresses: peerInfo.relayAddresses,
      keyPair: this.keyPair,
      relayThrough
    })
    this._allConnections.add(conn)

    this.stats.connects.client.attempted++

    this.connecting++
    this._clientConnections++
    let opened = false

    const onerror = (err) => {
      if (this.relayThrough && shouldForceRelaying(err.code)) {
        peerInfo.forceRelaying = true
        // Reset the attempts in order to fast connect to relay
        peerInfo.attempts = 0
      }
    }

    // Removed once a connection is opened
    conn.on('error', onerror)

    conn.on('open', () => {
      opened = true
      this.stats.connects.client.opened++

      this._connectDone()
      this.connections.add(conn)
      conn.removeListener('error', onerror)
      peerInfo._connected()
      peerInfo.client = true
      this.emit('connection', conn, peerInfo)
      if (queued) this._flushMaybe(peerInfo)

      this.emit('update')
    })
    conn.on('close', () => {
      if (!opened) this._connectDone()
      this.stats.connects.client.closed++

      this.connections.delete(conn)
      this._allConnections.delete(conn)
      this._clientConnections--
      peerInfo._disconnected()

      peerInfo.waiting = this._shouldRequeue(peerInfo) && this._timer.add(peerInfo)
      this._maybeDeletePeer(peerInfo)

      if (!opened && queued) this._flushMaybe(peerInfo)

      this._attemptClientConnections()

      this.emit('update')
    })

    this.emit('update')
  }

  _connectDone () {
    this.connecting--

    if (this.connecting < this.maxParallel) this._attemptClientConnections()
    if (this.connecting === 0) this._flushAllMaybe()
  }

  // Called when the PeerQueue indicates a connection should be attempted.
  _attemptClientConnections () {
    // Guard against re-entries - unsure if it still needed but doesn't hurt
    if (this._drainingQueue) return
    this._drainingQueue = true

    for (const peerInfo of this.explicitPeers) {
      if (!this._shouldConnectExplicit()) break
      if (peerInfo.attempts >= 5 || (Date.now() - peerInfo.disconnectedTime) < peerInfo.attempts * 1000) continue
      this._connect(peerInfo, false)
    }

    while (this._queue.length && this._shouldConnect()) {
      const peerInfo = this._queue.shift()
      peerInfo.queued = false
      this._connect(peerInfo, true)
    }
    this._drainingQueue = false
    if (this.connecting === 0) this._flushAllMaybe()
  }

  _handleFirewall (remotePublicKey, payload) {
    if (this.suspended) return true
    if (b4a.equals(remotePublicKey, this.keyPair.publicKey)) return true

    const peerInfo = this.peers.get(b4a.toString(remotePublicKey, 'hex'))
    if (peerInfo && peerInfo.banned) return true

    return this._firewall(remotePublicKey, payload)
  }

  _handleServerConnectionSwap (existing, conn) {
    let closed = false

    existing.on('close', () => {
      if (closed) return

      conn.removeListener('error', noop)
      conn.removeListener('close', onclose)

      this._handleServerConnection(conn)
    })

    conn.on('error', noop)
    conn.on('close', onclose)

    function onclose () {
      closed = true
    }
  }

  // Called when the DHT receives a new server connection.
  _handleServerConnection (conn) {
    if (this.destroyed) {
      // TODO: Investigate why a final server connection can be received after close
      conn.on('error', noop)
      return conn.destroy(ERR_DESTROYED)
    }

    const existing = this._allConnections.get(conn.remotePublicKey)

    if (existing) {
      // If both connections are from the same peer,
      // - pick the new one if the existing stream is already established (has sent and received bytes),
      //   because the other client must have lost that connection and be reconnecting
      // - otherwise, pick the one thats expected to initiate in a tie break
      const existingIsOutdated = existing.rawBytesRead > 0 && existing.rawBytesWritten > 0
      const expectedInitiator = b4a.compare(conn.publicKey, conn.remotePublicKey) > 0
      const keepNew = existingIsOutdated || (expectedInitiator === conn.isInitiator)

      if (keepNew === false) {
        existing.sendKeepAlive()
        conn.on('error', noop)
        conn.destroy(new Error(ERR_DUPLICATE))
        return
      }

      existing.on('error', noop)
      existing.destroy(new Error(ERR_DUPLICATE))
      this._handleServerConnectionSwap(existing, conn)
      return
    }

    // When reaching here, the connection will always be 'opened' next tick
    this.stats.connects.server.opened++

    const peerInfo = this._upsertPeer(conn.remotePublicKey, null)

    this.connections.add(conn)
    this._allConnections.add(conn)
    this._serverConnections++

    conn.on('close', () => {
      this.connections.delete(conn)
      this._allConnections.delete(conn)
      this._serverConnections--
      this.stats.connects.server.closed++

      this._maybeDeletePeer(peerInfo)

      this._attemptClientConnections()

      this.emit('update')
    })
    peerInfo.client = false
    this.emit('connection', conn, peerInfo)

    this.emit('update')
  }

  _upsertPeer (publicKey, relayAddresses) {
    if (b4a.equals(publicKey, this.keyPair.publicKey)) return null
    const keyString = b4a.toString(publicKey, 'hex')
    let peerInfo = this.peers.get(keyString)

    if (peerInfo) {
      peerInfo.relayAddresses = relayAddresses // new is always better
      return peerInfo
    }

    peerInfo = new PeerInfo({
      publicKey,
      relayAddresses
    })

    this.peers.set(keyString, peerInfo)
    return peerInfo
  }

  _handleUpdate () {
    this.stats.updates++
  }

  _maybeDeletePeer (peerInfo) {
    if (!peerInfo.shouldGC()) return

    const hasActiveConn = this._allConnections.has(peerInfo.publicKey)
    if (hasActiveConn) return

    const keyString = b4a.toString(peerInfo.publicKey, 'hex')
    this.peers.delete(keyString)
  }

  /*
   * Called when a peer is actively discovered during a lookup.
   *
   * Three conditions:
   *  1. Not a known peer -- insert into queue
   *  2. A known peer with normal priority -- do nothing
   *  3. A known peer with low priority -- bump priority, because it's been rediscovered
   */
  _handlePeer (peer, topic) {
    const peerInfo = this._upsertPeer(peer.publicKey, peer.relayAddresses)
    if (peerInfo) peerInfo._topic(topic)
    if (!peerInfo || this._allConnections.has(peer.publicKey)) return
    if (!peerInfo.prioritized || peerInfo.server) peerInfo._reset()
    if (peerInfo._updatePriority()) {
      this._enqueue(peerInfo)
    }
  }

  async _handleNetworkChange () {
    // prioritize figuring out if existing connections are dead
    for (const conn of this._allConnections) {
      conn.sendKeepAlive()
    }

    const refreshes = []

    for (const discovery of this._discovery.values()) {
      refreshes.push(discovery.refresh())
    }

    await Promise.allSettled(refreshes)
  }

  status (key) {
    return this._discovery.get(b4a.toString(key, 'hex')) || null
  }

  listen () {
    if (!this.listening) this.listening = this.server.listen(this.keyPair)
    return this.listening
  }

  // Object that exposes a cancellation method (destroy)
  // TODO: When you rejoin, it should reannounce + bump lookup priority
  join (topic, opts = {}) {
    if (!topic) throw new Error(ERR_MISSING_TOPIC)
    topic = unslab(topic)

    const topicString = b4a.toString(topic, 'hex')

    let discovery = this._discovery.get(topicString)

    if (discovery && !discovery.destroyed) {
      return discovery.session(opts)
    }

    discovery = new PeerDiscovery(this, topic, {
      wait: discovery ? discovery.destroy() : null,
      suspended: this.suspended,
      onpeer: peer => this._handlePeer(peer, topic)
    })
    this._discovery.set(topicString, discovery)
    return discovery.session(opts)
  }

  // Returns a promise
  async leave (topic) {
    if (!topic) throw new Error(ERR_MISSING_TOPIC)
    const topicString = b4a.toString(topic, 'hex')
    if (!this._discovery.has(topicString)) return Promise.resolve()

    const discovery = this._discovery.get(topicString)

    try {
      await discovery.destroy()
    } catch {
      // ignore, prop network
    }

    if (this._discovery.get(topicString) === discovery) {
      this._discovery.delete(topicString)
    }
  }

  joinPeer (publicKey) {
    const peerInfo = this._upsertPeer(publicKey, null)
    if (!peerInfo) return
    if (!this.explicitPeers.has(peerInfo)) {
      peerInfo.explicit = true
      this.explicitPeers.add(peerInfo)
    }
    if (this._allConnections.has(publicKey)) return
    if (peerInfo._updatePriority()) {
      this._enqueue(peerInfo)
    }
  }

  leavePeer (publicKey) {
    const keyString = b4a.toString(publicKey, 'hex')
    if (!this.peers.has(keyString)) return

    const peerInfo = this.peers.get(keyString)
    peerInfo.explicit = false
    this.explicitPeers.delete(peerInfo)
    this._maybeDeletePeer(peerInfo)
  }

  // Returns a promise
  async flush () {
    const allFlushed = [...this._discovery.values()].map(v => v.flushed())
    await Promise.all(allFlushed)
    if (this._flushAllMaybe()) return true
    const pendingSize = this._allConnections.size - this.connections.size
    if (!this._queue.length && !pendingSize) return true
    return new Promise((resolve) => {
      this._pendingFlushes.push({
        onflush: resolve,
        missing: this._queue.length + pendingSize,
        tick: this._flushTick++
      })
    })
  }

  async clear () {
    const cleared = Promise.allSettled([...this._discovery.values()].map(d => d.destroy()))
    this._discovery.clear()
    return cleared
  }

  async destroy ({ force } = {}) {
    if (this.destroyed && !force) return
    this.destroyed = true

    this._timer.destroy()

    if (!force) await this.clear()

    await this.server.close()

    while (this._pendingFlushes.length) {
      const flush = this._pendingFlushes.pop()
      flush.onflush(false)
    }

    await this.dht.destroy({ force })
  }

  async suspend () {
    if (this.suspended) return

    const promises = []

    promises.push(this.server.suspend())

    for (const discovery of this._discovery.values()) {
      promises.push(discovery.suspend())
    }

    for (const connection of this._allConnections) {
      connection.destroy()
    }

    this.suspended = true

    await Promise.allSettled(promises)
    await this.dht.suspend()
  }

  async resume () {
    if (!this.suspended) return

    await this.dht.resume()
    await this.server.resume()

    for (const discovery of this._discovery.values()) {
      discovery.resume()
    }

    this._attemptClientConnections()
    this.suspended = false
  }

  topics () {
    return this._discovery.values()
  }
}

function noop () { }

function allowAll () {
  return false
}

function shouldForceRelaying (code) {
  return (code === 'HOLEPUNCH_ABORTED') ||
    (code === 'HOLEPUNCH_DOUBLE_RANDOMIZED_NATS') ||
    (code === 'REMOTE_NOT_HOLEPUNCHABLE')
}
````

## File: LICENSE
````
The MIT License (MIT)

Copyright (c) 2019 Mathias Buus, Paul Frazee, David Mark Clements and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
````

## File: package.json
````json
{
  "name": "hyperswarm",
  "version": "4.11.1",
  "description": "A distributed networking stack for connecting peers",
  "files": [
    "index.js",
    "lib/**.js"
  ],
  "imports": {
    "events": {
      "bare": "bare-events",
      "default": "events"
    }
  },
  "dependencies": {
    "b4a": "^1.3.1",
    "bare-events": "^2.2.0",
    "hyperdht": "^6.11.0",
    "safety-catch": "^1.0.2",
    "shuffled-priority-queue": "^2.1.0",
    "unslab": "^1.3.0"
  },
  "devDependencies": {
    "brittle": "^3.0.2",
    "hypercore-crypto": "^3.4.0",
    "standard": "^17.0.0"
  },
  "scripts": {
    "test": "standard && node test/all.js",
    "test:generate": "brittle -r test/all.js test/*.js"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/holepunchto/hyperswarm.git"
  },
  "author": "Mathias Buus (@mafintosh)",
  "contributors": [
    "David Mark Clements (@davidmarkclem)",
    "Andrew Osheroff (@andrewosh)"
  ],
  "license": "MIT",
  "bugs": {
    "url": "https://github.com/holepunchto/hyperswarm/issues"
  },
  "homepage": "https://github.com/holepunchto/hyperswarm"
}
````

## File: README.md
````markdown
# hyperswarm

### [See the full API docs at docs.holepunch.to](https://docs.holepunch.to/building-blocks/hyperswarm)

A high-level API for finding and connecting to peers who are interested in a "topic."

## Installation
```
npm install hyperswarm
```

## Usage
```js
const Hyperswarm = require('hyperswarm')

const swarm1 = new Hyperswarm()
const swarm2 = new Hyperswarm()

swarm1.on('connection', (conn, info) => {
  // swarm1 will receive server connections
  conn.write('this is a server connection')
  conn.end()
})

swarm2.on('connection', (conn, info) => {
  conn.on('data', data => console.log('client got message:', data.toString()))
})

const topic = Buffer.alloc(32).fill('hello world') // A topic must be 32 bytes
const discovery = swarm1.join(topic, { server: true, client: false })
await discovery.flushed() // Waits for the topic to be fully announced on the DHT

swarm2.join(topic, { server: false, client: true })
await swarm2.flush() // Waits for the swarm to connect to pending peers.

// After this point, both client and server should have connections
```

## Hyperswarm API

#### `const swarm = new Hyperswarm(opts = {})`
Construct a new Hyperswarm instance.

`opts` can include:
* `keyPair`: A Noise keypair that will be used to listen/connect on the DHT. Defaults to a new key pair.
* `seed`: A unique, 32-byte, random seed that can be used to deterministically generate the key pair.
* `maxPeers`: The maximum number of peer connections to allow.
* `firewall`: A sync function of the form `remotePublicKey => (true|false)`. If true, the connection will be rejected. Defaults to allowing all connections.
* `dht`: A DHT instance. Defaults to a new instance.

#### `swarm.connecting`
Number that indicates connections in progress.

#### `swarm.connections`
A set of all active client/server connections.

#### `swarm.peers`
A Map containing all connected peers, of the form: `(Noise public key hex string) -> PeerInfo object`

See the [`PeerInfo`](https://github.com/holepunchto/hyperswarm/blob/v3/README.md#peerinfo-api) API for more details.

#### `swarm.dht`
A [`hyperdht`](https://github.com/holepunchto/hyperdht) instance. Useful if you want lower-level control over Hyperswarm's networking.

#### `swarm.on('connection', (socket, peerInfo) => {})`
Emitted whenever the swarm connects to a new peer.

`socket` is an end-to-end (Noise) encrypted Duplex stream

`peerInfo` is a [`PeerInfo`](https://github.com/holepunchto/hyperswarm/blob/v3/README.md#peerinfo-api) instance

#### `swarm.on('update', () => {})`
Emitted when internal values are changed, useful for user interfaces.

For example: emitted when `swarm.connecting` or `swarm.connections` changes.

#### `const discovery = swarm.join(topic, opts = {})`
Start discovering and connecting to peers sharing a common topic. As new peers are connected to, they will be emitted from the swarm as `connection` events.

`topic` must be a 32-byte Buffer
`opts` can include:
* `server`: Accept server connections for this topic by announcing yourself to the DHT. Defaults to `true`.
* `client`: Actively search for and connect to discovered servers. Defaults to `true`.

Returns a [`PeerDiscovery`](https://github.com/holepunchto/hyperswarm/blob/v3/README.md#peerdiscovery-api) object.

#### Clients and Servers
In Hyperswarm, there are two ways for peers to join the swarm: client mode and server mode. If you've previously used Hyperswarm v2, these were called "lookup" and "announce", but we now think "client" and "server" are more descriptive.

When you join a topic as a server, the swarm will start accepting incoming connections from clients (peers that have joined the same topic in client mode). Server mode will announce your keypair to the DHT, so that other peers can discover your server. When server connections are emitted, they are not associated with a specific topic -- the server only knows it received an incoming connection.

When you join a topic as a client, the swarm will do a query to discover available servers, and will eagerly connect to them. As with server mode, these connections will be emitted as `connection` events, but in client mode they __will__ be associated with the topic (`info.topics` will be set in the `connection` event).

#### `await swarm.leave(topic)`
Stop discovering peers for the given topic.

`topic` must be a 32-byte Buffer

If a topic was previously joined in server mode, `leave` will stop announcing the topic on the DHT. If a topic was previously joined in client mode, `leave` will stop searching for servers announcing the topic.

`leave` will __not__ close any existing connections.

#### `swarm.joinPeer(noisePublicKey)`
Establish a direct connection to a known peer.

`noisePublicKey` must be a 32-byte Buffer

As with the standard `join` method, `joinPeer` will ensure that peer connections are reestablished in the event of failures.

#### `swarm.leavePeer(noisePublicKey)`
Stop attempting direct connections to a known peer.

`noisePublicKey` must be a 32-byte Buffer

If a direct connection is already established, that connection will __not__ be destroyed by `leavePeer`.

#### `const discovery = swarm.status(topic)`
Get the [`PeerDiscovery`](https://github.com/holepunchto/hyperswarm/blob/v3/README.md#peerdiscovery-api) object associated with the topic, if it exists.

#### `await swarm.listen()`
Explicitly start listening for incoming connections. This will be called internally after the first `join`, so it rarely needs to be called manually.

#### `await swarm.flush()`
Wait for any pending DHT announces, and for the swarm to connect to any pending peers (peers that have been discovered, but are still in the queue awaiting processing).

Once a `flush()` has completed, the swarm will have connected to every peer it can discover from the current set of topics it's managing.

`flush()` is not topic-specific, so it will wait for every pending DHT operation and connection to be processed -- it's quite heavyweight, so it could take a while. In most cases, it's not necessary, as connections are emitted by `swarm.on('connection')` immediately after they're opened.  

## PeerDiscovery API

`swarm.join` returns a `PeerDiscovery` instance which allows you to both control discovery behavior, and respond to lifecycle changes during discovery.

#### `await discovery.flushed()`
Wait until the topic has been fully announced to the DHT. This method is only relevant in server mode. When `flushed()` has completed, the server will be available to the network.

#### `await discovery.refresh({ client, server })`
Update the `PeerDiscovery` configuration, optionally toggling client and server modes. This will also trigger an immediate re-announce of the topic, when the `PeerDiscovery` is in server mode.

#### `await discovery.destroy()`
Stop discovering peers for the given topic. 

If a topic was previously joined in server mode, `leave` will stop announcing the topic on the DHT. If a topic was previously joined in client mode, `leave` will stop searching for servers announcing the topic.

## PeerInfo API

`swarm.on('connection', ...)` emits a `PeerInfo` instance whenever a new connection is established.

There is a one-to-one relationship between connections and `PeerInfo` objects -- if a single peer announces multiple topics, those topics will be multiplexed over a single connection.

#### `peerInfo.publicKey`
The peer's Noise public key.

#### `peerInfo.topics`
An Array of topics that this Peer is associated with -- `topics` will only be updated when the Peer is in client mode.

#### `peerInfo.prioritized`
If true, the swarm will rapidly attempt to reconnect to this peer.

#### `peerInfo.ban(banStatus = false)`
Ban or unban the peer. Banning will prevent any future reconnection attempts, but it will __not__ close any existing connections.

## License
MIT
````
