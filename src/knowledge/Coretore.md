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
  audit.js
test/
  basic.js
.gitignore
example.mjs
index.js
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

## File: lib/audit.js
````javascript
module.exports = async function * audit (store, { dryRun = false } = {}) {
  for await (const { discoveryKey } of store.storage.createCoreStream()) {
    const core = store.get({ discoveryKey, active: false })
    await core.ready()

    yield { discoveryKey, key: core.key, audit: await core.core.audit({ dryRun }) }

    try {
      await core.close()
    } catch {
      // ignore if failed, we are auditing...
    }
  }
}
````

## File: test/basic.js
````javascript
const test = require('brittle')
const b4a = require('b4a')
const tmp = require('test-tmp')
const Rache = require('rache')
const Hypercore = require('hypercore')
const crypto = require('hypercore-crypto')

const Corestore = require('../')

test('basic', async function (t) {
  const store = await create(t)

  const core = store.get({ name: 'test' })
  const core2 = store.get({ name: 'test' })

  await core.ready()
  await core2.ready()

  t.alike(core.key, core2.key, 'same core')
  t.is(core.core, core2.core, 'same internal core')

  t.is(core.manifest.signers.length, 1)
  t.unlike(core.key, core.manifest.signers[0].publicKey)

  await core.close()
  await core2.close()
})

test('basic non parallel', async function (t) {
  const store = await create(t)

  const core = store.get({ name: 'test' })
  await core.ready()

  const core2 = store.get({ name: 'test' })
  await core2.ready()

  t.alike(core.key, core2.key, 'same core')
  t.is(core.core, core2.core, 'same internal core')

  t.is(core.manifest.signers.length, 1)
  t.unlike(core.key, core.manifest.signers[0].publicKey)

  await core.close()
  await core2.close()
})

test('pass primary key', async function (t) {
  const primaryKey = b4a.alloc(32, 1)
  let key = null

  {
    const dir = await tmp(t)
    const store = new Corestore(dir, { primaryKey })

    t.alike(store.primaryKey, primaryKey)

    const core = store.get({ name: 'test' })
    await core.ready()

    key = core.key

    await core.close()
    await store.close()

    const store2 = new Corestore(dir)
    await store2.ready()

    t.alike(store2.primaryKey, primaryKey)

    await store2.close()
  }

  {
    const dir = await tmp(t)

    const store = new Corestore(dir, { primaryKey })

    const core = store.get({ name: 'test' })
    await core.ready()

    t.alike(core.key, key)

    await core.close()
    await store.close()
  }
})

test('global cache is passed down', async function (t) {
  const dir = await tmp(t)
  const store = new Corestore(dir, { globalCache: new Rache({ maxSize: 4 }) })

  t.ok(store.globalCache)

  const core = store.get({ name: 'hello' })
  await core.ready()

  t.ok(core.globalCache)

  await core.close()
  await store.close()
})

test('session pre ready', async function (t) {
  const dir = await tmp(t)
  const store = new Corestore(dir)

  const a = store.get({ name: 'test' })
  const b = a.session()

  await a.ready()
  await b.ready()

  await a.close()
  await b.close()

  await store.close()
})

test('weak ref to react to cores opening', async function (t) {
  t.plan(2)

  const s = setInterval(() => {}, 1000)

  const dir = await tmp(t)
  const store = new Corestore(dir)

  t.teardown(() => clearInterval(s))
  t.teardown(() => store.close())

  store.watch(function (core) {
    const s = new Hypercore({ core, weak: true })

    t.pass('weak ref opened passively')

    s.on('close', function () {
      t.pass('weak ref closed passively')
    })
  })

  const core = store.get({ name: 'hello' })

  await core.ready()
  await core.close()
})

test('session of hypercore sessions are tracked in corestore sessions', async function (t) {
  const dir = await tmp(t)
  const store = new Corestore(dir)

  const session = store.session()

  const closed = t.test('session')
  closed.plan(2)

  const a = session.get({ name: 'test' })
  const b = a.session()

  a.on('close', () => closed.pass('a closed (explicit)'))
  b.on('close', () => closed.pass('b closed (implicit)'))

  await a.ready()
  await b.ready()

  await session.close()

  await closed

  await store.close()
})

test('named cores are stable', async function (t) {
  const dir = await tmp(t)
  const store = new Corestore(dir)

  await store.ready()
  const keyPair = await store.createKeyPair('test')

  const oldManifest = {
    version: 0,
    signers: [{ publicKey: keyPair.publicKey }]
  }

  const core = store.get({ name: 'test', manifest: oldManifest })
  await core.ready()

  const expected = core.manifest

  await core.close()
  await store.close()

  const fresh = new Corestore(dir)

  const freshCore = fresh.get({ name: 'test' })
  await freshCore.ready()

  t.alike(freshCore.manifest, expected)

  await freshCore.close()
  await fresh.close()
})

test('replicates', async function (t) {
  const store = new Corestore(await tmp(t))

  const a = store.get({ name: 'foo' })
  await a.append('hello')
  await a.close()

  const store2 = new Corestore(await tmp(t))
  const clone = store.get(a.key)

  const s1 = store2.replicate(true)
  const s2 = store.replicate(false)

  s1.pipe(s2).pipe(s1)

  t.alike(await clone.get(0), b4a.from('hello'))

  s1.destroy()
  s2.destroy()

  await store.close()
  await store2.close()
})

test('if key is passed, its available immediately', async function (t) {
  const store = new Corestore(await tmp(t))

  const a = store.get({ key: b4a.alloc(32) })
  t.alike(a.key, b4a.alloc(32))

  await a.close()
  await store.close()
})

test('finding peers (compat)', async function (t) {
  const store = new Corestore(await tmp(t))

  const done = store.findingPeers()

  const core = store.get({ key: b4a.alloc(32) })
  let waited = false

  setTimeout(() => {
    waited = true
    done()
  }, 500)

  await core.update()
  t.ok(waited, 'waited')

  await store.close()
})

test('audit', async function (t) {
  const store = new Corestore(await tmp(t))

  const a = store.get({ keyPair: crypto.keyPair() })
  const b = store.get({ keyPair: crypto.keyPair() })
  const c = store.get({ name: 'test' })
  const d = store.get({ name: 'another' })

  for (let i = 0; i < 100; i++) {
    if (i < 20) await a.append(i.toString())
    if (i < 40) await b.append(i.toString())
    if (i < 80) await c.append(i.toString())
    await d.append(i.toString())
  }

  let n = 0
  for await (const { audit } of store.audit()) {
    n++
    if (audit.droppedBits || audit.droppedBlocks || audit.droppedTreeNodes || audit.corrupt) {
      t.fail('bad core')
    }
  }

  t.is(n, 4)

  await a.close()
  await b.close()
  await c.close()
  await d.close()
  await store.close()
})

test('open by discovery key', async function (t) {
  const store = new Corestore(await tmp(t))

  const a = store.get({ discoveryKey: b4a.alloc(32) })

  try {
    await a.ready()
  } catch {
    t.ok('should fail')
  }

  const keyPair = crypto.keyPair()
  const manifest = {
    signers: [{ publicKey: keyPair.publicKey }]
  }

  const key = Hypercore.key(manifest)
  const discoveryKey = Hypercore.discoveryKey(key)

  const a1 = store.get({ discoveryKey })
  const a2 = store.get({ discoveryKey, key, manifest })

  try {
    await a1.ready()
  } catch {}

  await a2.ready()
  t.pass('a2 worked')

  a2.close()
  await store.close()
})

async function create (t) {
  const dir = await tmp(t)
  const store = new Corestore(dir)
  t.teardown(() => store.close())
  return store
}
````

## File: .gitignore
````
node_modules
sandbox
coverage
package-lock.json
````

## File: example.mjs
````
import Corestore from './index.js'

const store = new Corestore('./store.db')

const core = store.get({ name: 'yo' })
// await core.close()

const store2 = new Corestore('./store2.db')

await core.ready()
await core.append('yo')

const clone = store2.get({ key: core.key })

const stream = store.replicate(true)
const stream2 = store2.replicate(false)

stream.pipe(stream2).pipe(stream)

await clone.ready()
console.log(core, clone)
````

## File: index.js
````javascript
const b4a = require('b4a')
const Hypercore = require('hypercore')
const ReadyResource = require('ready-resource')
const sodium = require('sodium-universal')
const crypto = require('hypercore-crypto')
const ID = require('hypercore-id-encoding')
const { STORAGE_EMPTY } = require('hypercore-errors')

const auditStore = require('./lib/audit.js')

const [NS] = crypto.namespace('corestore', 1)
const DEFAULT_NAMESPACE = b4a.alloc(32) // This is meant to be 32 0-bytes

class StreamTracker {
  constructor () {
    this.records = []
  }

  add (stream, isExternal) {
    const record = { index: 0, stream, isExternal }
    record.index = this.records.push(record) - 1
    return record
  }

  remove (record) {
    const popped = this.records.pop()
    if (popped === record) return
    this.records[(popped.index = record.index)] = popped
  }

  attachAll (core) {
    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i]
      const muxer = record.stream.noiseStream.userData
      if (!core.replicator.attached(muxer)) core.replicator.attachTo(muxer)
    }
  }

  destroy () {
    // reverse is safer cause we delete mb
    for (let i = this.records.length - 1; i >= 0; i--) {
      const record = this.records[i]
      if (!record.isExternal) record.stream.destroy()
    }
  }
}

class SessionTracker {
  constructor () {
    this.map = new Map()
  }

  get size () {
    return this.map.size
  }

  get (id) {
    const existing = this.map.get(id)
    if (existing !== undefined) return existing
    const fresh = []
    this.map.set(id, fresh)
    return fresh
  }

  gc (id) {
    this.map.delete(id)
  }

  list (id) {
    return id ? (this.map.get(id) || []) : [...this]
  }

  * [Symbol.iterator] () {
    for (const sessions of this.map.values()) {
      yield * sessions[Symbol.iterator]()
    }
  }
}

class CoreTracker {
  constructor () {
    this.map = new Map()
    this.watching = []

    this._gcing = new Set()
    this._gcInterval = null
    this._gcCycleBound = this._gcCycle.bind(this)
  }

  get size () {
    return this.map.size
  }

  watch (store) {
    if (store.watchIndex !== -1) return
    store.watchIndex = this.watching.push(store) - 1
  }

  unwatch (store) {
    if (store.watchIndex === -1) return
    const head = this.watching.pop()
    if (head !== store) this.watching[(head.watchIndex = store.watchIndex)] = head
    store.watchIndex = -1
  }

  resume (id) {
    const core = this.map.get(id)

    if (!core) return null

    // signal back that we have a closing one stored
    if (core.closing) return core

    if (core.gc) {
      this._gcing.delete(core)
      if (this._gcing.size === 0) this._stopGC()
      core.gc = 0
    }

    return core
  }

  opened (id) {
    const core = this.map.get(id)
    return !!(core && core.opened && !core.closing)
  }

  get (id) {
    // we allow you do call this from the outside, so support normal buffers also
    if (b4a.isBuffer(id)) id = b4a.toString(id, 'hex')
    const core = this.map.get(id)
    if (!core || core.closing) return null
    return core
  }

  set (id, core) {
    this.map.set(id, core)
    if (this.watching.length > 0) this._emit(core)
  }

  _emit (core) {
    for (let i = this.watching.length - 1; i >= 0; i--) {
      const store = this.watching[i]
      for (const fn of store.watchers) fn(core)
    }
  }

  _gc (core) {
    const id = toHex(core.discoveryKey)
    if (this.map.get(id) === core) this.map.delete(id)
  }

  _gcCycle () {
    for (const core of this._gcing) {
      if (++core.gc < 4) continue
      const gc = this._gc.bind(this, core)
      core.close().then(gc, gc)
      this._gcing.delete(core)
    }

    if (this._gcing.size === 0) this._stopGC()
  }

  gc (core) {
    core.gc = 1 // first strike
    this._gcing.add(core)
    if (this._gcing.size === 1) this._startGC()
  }

  _stopGC () {
    clearInterval(this._gcInterval)
    this._gcInterval = null
  }

  _startGC () {
    if (this._gcInterval) return
    this._gcInterval = setInterval(this._gcCycleBound, 2000)
    if (this._gcInterval.unref) this._gcInterval.unref()
  }

  close () {
    this._stopGC()
    this._gcing.clear()

    const all = []
    for (const core of this.map.values()) {
      core.onidle = noop // no reentry
      all.push(core.close())
    }
    this.map.clear()

    return Promise.all(all)
  }

  * [Symbol.iterator] () {
    for (const core of this.map.values()) {
      if (!core.closing) yield core
    }
  }
}

class FindingPeers {
  constructor () {
    this.count = 0
    this.pending = []
  }

  add (core) {
    if (this.count === 0) return
    this.pending.push(core.findingPeers())
  }

  inc (sessions) {
    if (++this.count !== 1) return

    for (const core of sessions) {
      this.pending.push(core.findingPeers())
    }
  }

  dec (sessions) {
    if (--this.count !== 0) return
    while (this.pending.length > 0) this.pending.pop()()
  }
}

class Corestore extends ReadyResource {
  constructor (storage, opts = {}) {
    super()

    this.root = opts.root || null
    this.storage = this.root ? this.root.storage : Hypercore.defaultStorage(storage, { id: opts.id })
    this.streamTracker = this.root ? this.root.streamTracker : new StreamTracker()
    this.cores = this.root ? this.root.cores : new CoreTracker()
    this.sessions = new SessionTracker()
    this.corestores = this.root ? this.root.corestores : new Set()
    this.readOnly = opts.writable === false
    this.globalCache = this.root ? this.root.globalCache : (opts.globalCache || null)
    this.primaryKey = this.root ? this.root.primaryKey : (opts.primaryKey || null)
    this.ns = opts.namespace || DEFAULT_NAMESPACE

    this.watchers = null
    this.watchIndex = -1

    this.manifestVersion = 1 // just compat

    this._findingPeers = null // here for legacy
    this._ongcBound = this._ongc.bind(this)

    if (this.root) this.corestores.add(this)

    this.ready().catch(noop)
  }

  watch (fn) {
    if (this.watchers === null) {
      this.watchers = new Set()
      this.cores.watch(this)
    }

    this.watchers.add(fn)
  }

  unwatch (fn) {
    if (this.watchers === null) return

    this.watchers.delete(fn)

    if (this.watchers.size === 0) {
      this.watchers = null
      this.cores.unwatch(this)
    }
  }

  findingPeers () {
    if (this._findingPeers === null) this._findingPeers = new FindingPeers()
    this._findingPeers.inc(this.sessions)
    let done = false
    return () => {
      if (done) return
      done = true
      this._findingPeers.dec(this.sessions)
    }
  }

  audit (opts = {}) {
    return auditStore(this, opts)
  }

  async suspend () {
    await this.storage.db.flush()
    await this.storage.db.suspend()
  }

  resume () {
    return this.storage.db.resume()
  }

  session (opts) {
    this._maybeClosed()
    const root = this.root || this
    return new Corestore(null, { ...opts, root })
  }

  namespace (name, opts) {
    return this.session({ ...opts, namespace: generateNamespace(this.ns, name) })
  }

  getAuth (discoveryKey) {
    return this.storage.getAuth(discoveryKey)
  }

  _ongc (session) {
    if (session.sessions.length === 0) this.sessions.gc(session.id)
  }

  async _getOrSetSeed () {
    const seed = await this.storage.getSeed()
    if (seed !== null) return seed
    return await this.storage.setSeed(this.primaryKey || crypto.randomBytes(32))
  }

  async _open () {
    if (this.root !== null) {
      if (this.root.opened === false) await this.root.ready()
      this.primaryKey = this.root.primaryKey
      return
    }

    const primaryKey = await this._getOrSetSeed()

    if (this.primaryKey === null) {
      this.primaryKey = primaryKey
      return
    }

    if (!b4a.equals(primaryKey, this.primaryKey)) {
      throw new Error('Another corestore is stored here')
    }
  }

  async _close () {
    const closing = []
    const hanging = [...this.sessions]
    for (const sess of hanging) closing.push(sess.close())

    if (this.watchers !== null) this.cores.unwatch(this)

    if (this.root !== null) {
      await Promise.all(closing)
      return
    }

    for (const store of this.corestores) {
      closing.push(store.close())
    }

    await Promise.all(closing)

    await this.cores.close()
    await this.storage.close()
  }

  async _attachMaybe (muxer, discoveryKey) {
    if (this.opened === false) await this.ready()
    if (!this.cores.opened(toHex(discoveryKey)) && !(await this.storage.has(discoveryKey, { ifMigrated: true }))) return
    if (this.closing) return

    const core = this._openCore(discoveryKey, { createIfMissing: false })

    if (!core) return
    if (!core.opened) await core.ready()

    if (!core.replicator.attached(muxer)) {
      core.replicator.attachTo(muxer)
    }

    core.checkIfIdle()
  }

  replicate (isInitiator, opts) {
    this._maybeClosed()

    const isExternal = isStream(isInitiator)
    const stream = Hypercore.createProtocolStream(isInitiator, {
      ...opts,
      ondiscoverykey: discoveryKey => {
        if (this.closing) return
        const muxer = stream.noiseStream.userData
        return this._attachMaybe(muxer, discoveryKey)
      }
    })

    if (this.cores.size > 0) {
      const muxer = stream.noiseStream.userData
      const uncork = muxer.uncork.bind(muxer)
      muxer.cork()

      for (const core of this.cores) {
        if (!core.replicator.downloading || core.replicator.attached(muxer) || !core.opened) continue
        core.replicator.attachTo(muxer)
      }

      stream.noiseStream.opened.then(uncork)
    }

    const record = this.streamTracker.add(stream, isExternal)
    stream.once('close', () => this.streamTracker.remove(record))
    return stream
  }

  _maybeClosed () {
    if (this.closing || (this.root !== null && this.root.closing)) {
      throw new Error('Corestore is closed')
    }
  }

  get (opts) {
    this._maybeClosed()

    if (b4a.isBuffer(opts) || typeof opts === 'string') opts = { key: opts }
    if (!opts) opts = {}

    const conf = {
      preload: null,
      sessions: null,
      ongc: null,
      core: null,
      active: opts.active !== false,
      encryption: opts.encryption || null,
      encryptionKey: opts.encryptionKey || null, // back compat, should remove
      isBlockKey: !!opts.isBlockKey, // back compat, should remove
      valueEncoding: opts.valueEncoding || null,
      exclusive: !!opts.exclusive,
      manifest: opts.manifest || null,
      keyPair: opts.keyPair || null,
      onwait: opts.onwait || null,
      wait: opts.wait !== false,
      timeout: opts.timeout || 0,
      draft: !!opts.draft,
      writable: opts.writable === undefined && this.readOnly ? false : opts.writable
    }

    // name requires us to rt to storage + ready, so needs preload
    // same goes if user has defined async preload obvs
    if (opts.name || opts.preload) {
      conf.preload = this._preload(opts)
      return this._makeSession(conf)
    }

    if (opts.discoveryKey && !opts.key && !opts.manifest) {
      conf.preload = this._preloadCheckIfExists(opts)
      return this._makeSession(conf)
    }

    // if not not we can sync create it, which just is easier for the
    // upstream user in terms of guarantees (key is there etc etc)
    const core = this._openCore(null, opts)

    conf.core = core
    conf.sessions = this.sessions.get(core.id)
    conf.ongc = this._ongcBound

    return this._makeSession(conf)
  }

  _makeSession (conf) {
    const session = new Hypercore(null, null, conf)
    if (this._findingPeers !== null) this._findingPeers.add(session)
    return session
  }

  async createKeyPair (name, ns = this.ns) {
    if (this.opened === false) await this.ready()
    return createKeyPair(this.primaryKey, ns, name)
  }

  async _preloadCheckIfExists (opts) {
    const has = await this.storage.has(opts.discoveryKey)
    if (!has) throw STORAGE_EMPTY('No Hypercore is stored here')
    return this._preload(opts)
  }

  async _preload (opts) {
    if (opts.preload) opts = { ...opts, ...(await opts.preload) }
    if (this.opened === false) await this.ready()

    const discoveryKey = opts.name ? await this.storage.getAlias({ name: opts.name, namespace: this.ns }) : null
    this._maybeClosed()

    const core = this._openCore(discoveryKey, opts)

    return {
      core,
      sessions: this.sessions.get(core.id),
      ongc: this._ongcBound,
      encryption: opts.encryption || null,
      encryptionKey: opts.encryptionKey || null, // back compat, should remove
      isBlockKey: !!opts.isBlockKey // back compat, should remove
    }
  }

  _auth (discoveryKey, opts) {
    const result = {
      keyPair: null,
      key: null,
      discoveryKey,
      manifest: null
    }

    if (opts.name) {
      result.keyPair = createKeyPair(this.primaryKey, this.ns, opts.name)
    } else if (opts.keyPair) {
      result.keyPair = opts.keyPair
    }

    if (opts.manifest) {
      result.manifest = opts.manifest
    } else if (result.keyPair && !result.discoveryKey) {
      result.manifest = { version: 1, signers: [{ publicKey: result.keyPair.publicKey }] }
    }

    if (opts.key) result.key = ID.decode(opts.key)
    else if (result.manifest) result.key = Hypercore.key(result.manifest)

    if (result.discoveryKey) return result

    if (opts.discoveryKey) result.discoveryKey = ID.decode(opts.discoveryKey)
    else if (result.key) result.discoveryKey = crypto.discoveryKey(result.key)
    else throw new Error('Could not derive discovery from input')

    return result
  }

  _openCore (discoveryKey, opts) {
    const auth = this._auth(discoveryKey, opts)

    const id = toHex(auth.discoveryKey)
    const existing = this.cores.resume(id)
    if (existing && !existing.closing) return existing

    const core = Hypercore.createCore(this.storage, {
      preopen: (existing && existing.opened) ? existing.closing : null, // always wait for the prev one to close first in any case...
      eagerUpgrade: true,
      notDownloadingLinger: opts.notDownloadingLinger,
      allowFork: opts.allowFork !== false,
      inflightRange: opts.inflightRange,
      compat: false, // no compat for now :)
      force: opts.force,
      createIfMissing: opts.createIfMissing,
      discoveryKey: auth.discoveryKey,
      overwrite: opts.overwrite,
      key: auth.key,
      keyPair: auth.keyPair,
      legacy: opts.legacy,
      manifest: auth.manifest,
      globalCache: opts.globalCache || this.globalCache || null,
      alias: opts.name ? { name: opts.name, namespace: this.ns } : null
    })

    core.onidle = () => {
      this.cores.gc(core)
    }

    core.replicator.ondownloading = () => {
      this.streamTracker.attachAll(core)
    }

    this.cores.set(id, core)
    return core
  }
}

module.exports = Corestore

function isStream (s) {
  return typeof s === 'object' && s && typeof s.pipe === 'function'
}

function generateNamespace (namespace, name) {
  if (!b4a.isBuffer(name)) name = b4a.from(name)
  const out = b4a.allocUnsafeSlow(32)
  sodium.crypto_generichash_batch(out, [namespace, name])
  return out
}

function deriveSeed (primaryKey, namespace, name) {
  if (!b4a.isBuffer(name)) name = b4a.from(name)
  const out = b4a.alloc(32)
  sodium.crypto_generichash_batch(out, [NS, namespace, name], primaryKey)
  return out
}

function createKeyPair (primaryKey, namespace, name) {
  const seed = deriveSeed(primaryKey, namespace, name)
  const buf = b4a.alloc(sodium.crypto_sign_PUBLICKEYBYTES + sodium.crypto_sign_SECRETKEYBYTES)
  const keyPair = {
    publicKey: buf.subarray(0, sodium.crypto_sign_PUBLICKEYBYTES),
    secretKey: buf.subarray(sodium.crypto_sign_PUBLICKEYBYTES)
  }
  sodium.crypto_sign_seed_keypair(keyPair.publicKey, keyPair.secretKey, seed)
  return keyPair
}

function noop () {}

function toHex (discoveryKey) {
  return b4a.toString(discoveryKey, 'hex')
}
````

## File: package.json
````json
{
  "name": "corestore",
  "version": "7.0.23",
  "description": "A Hypercore factory that simplifies managing collections of cores.",
  "main": "index.js",
  "files": [
    "index.js",
    "lib/*"
  ],
  "dependencies": {
    "b4a": "^1.6.7",
    "hypercore": "^11.0.0",
    "hypercore-crypto": "^3.4.2",
    "hypercore-errors": "^1.4.0",
    "hypercore-id-encoding": "^1.3.0",
    "ready-resource": "^1.1.1",
    "sodium-universal": "^4.0.1"
  },
  "devDependencies": {
    "brittle": "^3.7.0",
    "rache": "^1.0.0",
    "standard": "^17.1.2",
    "test-tmp": "^1.3.0"
  },
  "scripts": {
    "test": "standard && brittle test/*.js"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/holepunchto/corestore2.git"
  },
  "author": "Holepunch Inc",
  "license": "MIT",
  "bugs": {
    "url": "https://github.com/holepunchto/corestore2/issues"
  },
  "homepage": "https://github.com/holepunchto/corestore2"
}
````

## File: README.md
````markdown
# Corestore

### [See the full API docs at docs.holepunch.to](https://docs.holepunch.to/helpers/corestore)

Corestore is a Hypercore factory that makes it easier to manage large collections of named Hypercores.

Corestore provides:
1. __Key Derivation__ - All writable Hypercore keys are derived from a single master key and a user-provided name.
2. __Session Handling__ - If a single Hypercore is loaded multiple times through the `get` method, the underlying resources will only be opened once (using Hypercore 10's new session feature). Once all sessions are closed, the resources will be released.
3. __Storage Management__ - Hypercores can be stored in any random-access-storage instance, where they will be keyed by their discovery keys.
4. __Namespacing__ - You can share a single Corestore instance between multiple applications or components without worrying about naming collisions by creating "namespaces" (e.g. `corestore.namespace('my-app').get({ name: 'main' })`)

### Installation
`npm install corestore`

> [!NOTE]
> This readme reflects Corestore 7, our latest major version that is backed by RocksDB for storage and atomicity.
> Whilst we are fully validating that, the npm dist-tag for latest is set to latest version of Corestore 7, the previous major, to avoid too much disruption.
> It will be updated to 11 in a few weeks.

### Usage
A corestore instance can be constructed with a random-access-storage module, a function that returns a random-access-storage module given a path, or a string. If a string is specified, it will be assumed to be a path to a local storage directory:
```js
const Corestore = require('corestore')

const store = new Corestore('./my-storage')
const core1 = store.get({ name: 'core-1' })
const core2 = store.get({ name: 'core-2' })
```

### API
#### `const store = new Corestore(storage)`
Create a new Corestore instance.

`storage` can be either a random-access-storage module, a string, or a function that takes a path and returns an random-access-storage instance.

#### `const core = store.get(key | { name: 'a-name', ...hypercoreOpts})`
Loads a Hypercore, either by name (if the `name` option is provided), or from the provided key (if the first argument is a Buffer or String with hex/z32 key, or if the `key` options is set).

If that Hypercore has previously been loaded, subsequent calls to `get` will return a new Hypercore session on the existing core.

All other options besides `name` and `key` will be forwarded to the Hypercore constructor.

#### `const stream = store.replicate(optsOrStream)`
Creates a replication stream that's capable of replicating all Hypercores that are managed by the Corestore, assuming the remote peer has the correct capabilities.

`opts` will be forwarded to Hypercore's `replicate` function.

Corestore replicates in an "all-to-all" fashion, meaning that when replication begins, it will attempt to replicate every Hypercore that's currently loaded and in memory. These attempts will fail if the remote side doesn't have a Hypercore's capability -- Corestore replication does not exchange Hypercore keys.

If the remote side dynamically adds a new Hypercore to the replication stream, Corestore will load and replicate that core if possible.

Using [Hyperswarm](https://github.com/holepunchto/hyperswarm) you can easily replicate corestores

``` js
const swarm = new Hyperswarm()

// join the relevant topic
swarm.join(...)

// simply pass the connection stream to corestore
swarm.on('connection', (connection) => store.replicate(connection))
```

#### `const storeB = storeA.session()`
Create a new Corestore session. Closing a session will close all cores made from this session.

#### `const store = store.namespace(name)`
Create a new namespaced Corestore session. Namespacing is useful if you're going to be sharing a single Corestore instance between many applications or components, as it prevents name collisions.

Namespaces can be chained:
```js
const ns1 = store.namespace('a')
const ns2 = ns1.namespace('b')
const core1 = ns1.get({ name: 'main' }) // These will load different Hypercores
const core2 = ns2.get({ name: 'main' })
```

#### `await store.close()`
Fully close this Corestore instance.

### License
MIT
````
