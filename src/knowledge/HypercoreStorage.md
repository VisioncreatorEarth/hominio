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
    ci.yml
lib/
  block-dependency-stream.js
  close-error-stream.js
  keys.js
  streams.js
  tx.js
  view.js
migrations/
  0/
    index.js
    messages.js
spec/
  hyperschema/
    index.js
    schema.json
test/
  helpers/
    index.js
  all.js
  atomic.js
  basic.js
  core.js
  snapshot.js
  streams.js
.gitignore
build.js
index.js
LICENSE
NOTICE
package.json
README.md
```

# Files

## File: .github/workflows/ci.yml
````yaml
name: ci
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1 https://github.com/actions/checkout/releases/tag/v4.1.1
      - name: install node
        uses: actions/setup-node@1a4442cacd436585916779262731d5b162bc6ec7 # v3.8.2 https://github.com/actions/setup-node/releases/tag/v3.8.2
        with:
          node-version: 20
      - run: npm install
      - run: npm test
      - run: npm install -g bare-runtime
      - run: npm run test:bare
````

## File: lib/block-dependency-stream.js
````javascript
const { Readable, getStreamError } = require('streamx')
const { core } = require('./keys')

module.exports = class BlockStream extends Readable {
  constructor (core, db, updates, start, end, reverse) {
    super()

    this.core = core
    this.db = db
    this.updates = updates
    this.start = start
    this.end = end
    this.reverse = reverse === true

    this._drained = true
    this._consumed = 0
    this._stream = null
    this._oncloseBound = this._onclose.bind(this)
    this._maybeDrainBound = this._maybeDrain.bind(this)

    this._update()
  }

  _update () {
    if (this._consumed > this.core.dependencies.length) return

    const deps = this.core.dependencies
    const index = this._findDependencyIndex(deps)

    const curr = index < deps.length ? deps[index] : null
    const prev = (index > 0 && index - 1 < deps.length) ? deps[index - 1] : null

    const start = (prev && prev.length > this.start) ? prev.length : this.start
    const end = (curr && (this.end === -1 || curr.length < this.end)) ? curr.length : this.end

    const ptr = curr ? curr.dataPointer : this.core.dataPointer

    this._makeStream(core.block(ptr, start), core.block(ptr, end))
  }

  _findDependencyIndex (deps) {
    if (!this.reverse) return this._consumed++

    let i = deps.length - this._consumed++
    while (i > 0) {
      if (deps[i - 1].length <= this.end) return i
      i--
      this._consumed++
    }

    return 0
  }

  _predestroy () {
    if (this._stream !== null) this._stream.destroy()
  }

  _read (cb) {
    this._drained = this._onreadable()
    cb(null)
  }

  _maybeDrain () {
    if (this._drained === true) return
    this._drained = this._onreadable()
  }

  _onreadable () {
    if (this._stream === null) {
      this.push(null)
      return true
    }

    let data = this._stream.read()

    if (data === null) return false

    do {
      this.push(data)
      data = this._stream.read()
    } while (data !== null)

    return true
  }

  _onclose () {
    if (this.destroying) return

    const err = getStreamError(this._stream)

    if (err !== null) {
      this.destroy(err)
      return
    }

    // empty the current stream
    if (this._onreadable() === true) this._drained = true

    this._stream = null

    this._update()
    this._maybeDrain()
  }

  _makeStream (start, end) {
    this._stream = this.updates.iterator(this.db, start, end, this.reverse)
    this._stream.on('readable', this._maybeDrainBound)
    this._stream.on('error', noop)
    this._stream.on('close', this._oncloseBound)
  }
}

function noop () {}
````

## File: lib/close-error-stream.js
````javascript
const { Readable } = require('streamx')

// used for returned a stream that just errors (during read during teardown)

module.exports = class CloseErrorStream extends Readable {
  constructor (err) {
    super()
    this.error = err
  }

  _open (cb) {
    cb(this.error)
  }
}
````

## File: lib/keys.js
````javascript
const { UINT, STRING } = require('index-encoder')
const c = require('compact-encoding')
const b4a = require('b4a')

const TL_HEAD = 0
const TL_CORE_BY_DKEY = 1
const TL_CORE_BY_ALIAS = 2
const TL_CORE = 3
const TL_DATA = 4

const TL_END = TL_DATA + 1

const CORE_AUTH = 0
const CORE_SESSIONS = 1

const DATA_HEAD = 0
const DATA_DEPENDENCY = 1
const DATA_HINTS = 2
const DATA_BLOCK = 3
const DATA_TREE = 4
const DATA_BITFIELD = 5
const DATA_USER_DATA = 6
const DATA_LOCAL = 7

const slab = { buffer: b4a.allocUnsafe(65536), start: 0, end: 0 }

const store = {}
const core = {}

store.clear = function () {
  const state = alloc()
  let start = state.start
  UINT.encode(state, 0)
  const a = state.buffer.subarray(start, state.start)
  start = state.start
  UINT.encode(state, TL_END)
  const b = state.buffer.subarray(start, state.start)
  return [a, b]
}

store.head = function () {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_HEAD)
  return state.buffer.subarray(start, state.start)
}

store.core = function (discoveryKey) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_CORE_BY_DKEY)
  c.fixed32.encode(state, discoveryKey)
  return state.buffer.subarray(start, state.start)
}

store.coreStart = function () {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_CORE_BY_DKEY)
  return state.buffer.subarray(start, state.start)
}

store.coreEnd = function () {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_CORE_BY_DKEY + 1)
  return state.buffer.subarray(start, state.start)
}

store.coreByAlias = function ({ namespace, name }) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_CORE_BY_ALIAS)
  c.fixed32.encode(state, namespace)
  STRING.encode(state, name)
  return state.buffer.subarray(start, state.start)
}

store.coreByAliasStart = function (namespace) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_CORE_BY_ALIAS)
  if (namespace) c.fixed32.encode(state, namespace)
  return state.buffer.subarray(start, state.start)
}

store.coreByAliasEnd = function (namespace) {
  const state = alloc()
  const start = state.start

  if (namespace) {
    UINT.encode(state, TL_CORE_BY_ALIAS)
    c.fixed32.encode(state, namespace)
    state.buffer[state.start++] = 0xff
  } else {
    UINT.encode(state, TL_CORE_BY_ALIAS + 1)
  }

  return state.buffer.subarray(start, state.start)
}

store.alias = function (buffer) {
  const state = { buffer, start: 0, end: buffer.byteLength }
  UINT.decode(state) // ns
  const namespace = c.fixed32.decode(state)
  const name = STRING.decode(state)
  return { namespace, name }
}

store.discoveryKey = function (buffer) {
  const state = { buffer, start: 0, end: buffer.byteLength }
  UINT.decode(state) // ns
  return c.fixed32.decode(state)
}

core.core = function (ptr) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_CORE)
  UINT.encode(state, ptr)
  return state.buffer.subarray(start, state.start)
}

core.data = function (ptr) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_DATA)
  UINT.encode(state, ptr)
  return state.buffer.subarray(start, state.start)
}

core.auth = function (ptr) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_CORE)
  UINT.encode(state, ptr)
  UINT.encode(state, CORE_AUTH)
  return state.buffer.subarray(start, state.start)
}

core.sessions = function (ptr) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_CORE)
  UINT.encode(state, ptr)
  UINT.encode(state, CORE_SESSIONS)
  return state.buffer.subarray(start, state.start)
}

core.head = function (ptr) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_DATA)
  UINT.encode(state, ptr)
  UINT.encode(state, DATA_HEAD)
  return state.buffer.subarray(start, state.start)
}

core.dependency = function (ptr) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_DATA)
  UINT.encode(state, ptr)
  UINT.encode(state, DATA_DEPENDENCY)
  return state.buffer.subarray(start, state.start)
}

core.hints = function (ptr) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_DATA)
  UINT.encode(state, ptr)
  UINT.encode(state, DATA_HINTS)
  return state.buffer.subarray(start, state.start)
}

core.block = function (ptr, index) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_DATA)
  UINT.encode(state, ptr)
  UINT.encode(state, DATA_BLOCK)
  UINT.encode(state, index)
  return state.buffer.subarray(start, state.start)
}

core.tree = function (ptr, index) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_DATA)
  UINT.encode(state, ptr)
  UINT.encode(state, DATA_TREE)
  UINT.encode(state, index)
  return state.buffer.subarray(start, state.start)
}

core.bitfield = function (ptr, index, type) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_DATA)
  UINT.encode(state, ptr)
  UINT.encode(state, DATA_BITFIELD)
  UINT.encode(state, index)
  UINT.encode(state, type)
  return state.buffer.subarray(start, state.start)
}

core.userData = function (ptr, key) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_DATA)
  UINT.encode(state, ptr)
  UINT.encode(state, DATA_USER_DATA)
  STRING.encode(state, key)
  return state.buffer.subarray(start, state.start)
}

core.userDataEnd = function (ptr) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_DATA)
  UINT.encode(state, ptr)
  UINT.encode(state, DATA_USER_DATA + 1)
  return state.buffer.subarray(start, state.start)
}

core.local = function (ptr, key) {
  if (key.byteLength > 2048) {
    throw new Error('local keys has an upper limit of 2048 bytes atm')
  }

  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_DATA)
  UINT.encode(state, ptr)
  UINT.encode(state, DATA_LOCAL)

  state.buffer.set(key, state.start)
  state.start += key.byteLength
  return state.buffer.subarray(start, state.start)
}

core.localEnd = function (ptr) {
  const state = alloc()
  const start = state.start
  UINT.encode(state, TL_DATA)
  UINT.encode(state, ptr)
  UINT.encode(state, DATA_LOCAL + 1)
  return state.buffer.subarray(start, state.start)
}

core.blockIndex = function (buffer) {
  const state = { buffer, start: 0, end: buffer.byteLength }
  UINT.decode(state) // ns
  UINT.decode(state) // ptr
  UINT.decode(state) // type
  return UINT.decode(state)
}

core.bitfieldIndexAndType = function (buffer) {
  const state = { buffer, start: 0, end: buffer.byteLength }
  UINT.decode(state) // ns
  UINT.decode(state) // ptr
  UINT.decode(state) // type
  return [UINT.decode(state), UINT.decode(state)]
}

core.userDataKey = function (buffer) {
  const state = { buffer, start: 0, end: buffer.byteLength }
  UINT.decode(state) // ns
  UINT.decode(state) // ptr
  UINT.decode(state) // type
  return STRING.decode(state)
}

core.localKey = function (buffer) {
  const state = { buffer, start: 0, end: buffer.byteLength }
  UINT.decode(state) // ns
  UINT.decode(state) // ptr
  UINT.decode(state) // type
  return state.buffer.subarray(state.start, state.end)
}

module.exports = { store, core }

function alloc () {
  if (slab.buffer.byteLength - slab.start < 4096) {
    slab.buffer = b4a.allocUnsafe(slab.buffer.byteLength)
    slab.start = 0
  }
  return slab
}
````

## File: lib/streams.js
````javascript
const b4a = require('b4a')
const BlockDependencyStream = require('./block-dependency-stream.js')
const { core, store } = require('./keys.js')
const schema = require('../spec/hyperschema')

const CORESTORE_CORE = schema.getEncoding('@corestore/core')
const CORE_TREE_NODE = schema.getEncoding('@core/tree-node')
const EMPTY = b4a.alloc(0)

module.exports = {
  createBlockStream,
  createBitfieldStream,
  createUserDataStream,
  createCoreStream,
  createAliasStream,
  createTreeNodeStream,
  createLocalStream
}

function createCoreStream (db, view) {
  const start = store.coreStart()
  const end = store.coreEnd()

  const ite = view.iterator(db, start, end, false)

  ite._readableState.map = mapCore
  return ite
}

function createAliasStream (db, view, namespace) {
  const start = store.coreByAliasStart(namespace)
  const end = store.coreByAliasEnd(namespace)

  const ite = view.iterator(db, start, end, false)

  ite._readableState.map = mapAlias
  return ite
}

function createBlockIterator (ptr, db, view, start, end, reverse) {
  if (ptr.dependencies.length > 0) {
    return new BlockDependencyStream(ptr, db, view, start, end, reverse)
  }

  const s = core.block(ptr.dataPointer, start)
  const e = core.block(ptr.dataPointer, end === -1 ? Infinity : end)
  return view.iterator(db, s, e, reverse)
}

function createBlockStream (ptr, db, view, { gt = -1, gte = gt + 1, lte = -1, lt = lte === -1 ? -1 : lte + 1, reverse = false } = {}) {
  const ite = createBlockIterator(ptr, db, view, gte, lt, reverse)

  ite._readableState.map = mapBlock
  return ite
}

function createBitfieldStream (ptr, db, view, { gt = -1, gte = gt + 1, lte = -1, lt = lte === -1 ? -1 : lte + 1, reverse = false } = {}) {
  const s = core.bitfield(ptr.dataPointer, gte, 0)
  const e = core.bitfield(ptr.dataPointer, lt === -1 ? Infinity : lt, 0)
  const ite = view.iterator(db, s, e, false)

  ite._readableState.map = mapBitfield
  return ite
}

// NOTE: this does not do dependency lookups atm
function createTreeNodeStream (ptr, db, view, { gt = -1, gte = gt + 1, lte = -1, lt = lte === -1 ? -1 : lte + 1, reverse = false } = {}) {
  const s = core.tree(ptr.dataPointer, gte, 0)
  const e = core.tree(ptr.dataPointer, lt === -1 ? Infinity : lt, 0)
  const ite = view.iterator(db, s, e, false)

  ite._readableState.map = mapTreeNode
  return ite
}

function createUserDataStream (ptr, db, view, { gt = null, gte = '', lte = null, lt = null, reverse = false } = {}) {
  if (gt !== null || lte !== null) throw new Error('gt and lte not yet supported for user data streams')

  const s = core.userData(ptr.dataPointer, gte)
  const e = lt === null ? core.userDataEnd(ptr.dataPointer) : core.userData(ptr.dataPointer, lt)
  const ite = view.iterator(db, s, e, false)

  ite._readableState.map = mapUserData
  return ite
}

function createLocalStream (ptr, db, view, { gt = null, gte = EMPTY, lte = null, lt = null, reverse = false } = {}) {
  if (gt !== null || lte !== null) throw new Error('gt and lte not yet supported for local streams')

  const s = core.local(ptr.dataPointer, gte)
  const e = lt === null ? core.localEnd(ptr.dataPointer) : core.local(ptr.dataPointer, lt)
  const ite = view.iterator(db, s, e, false)

  ite._readableState.map = mapLocal
  return ite
}

function mapBitfield (data) {
  const [index, type] = core.bitfieldIndexAndType(data.key)
  if (type !== 0) return null // ignore for now
  return { index, page: data.value }
}

function mapLocal (data) {
  const key = core.localKey(data.key)
  return { key, value: data.value }
}

function mapUserData (data) {
  const key = core.userDataKey(data.key)
  return { key, value: data.value }
}

function mapCore (data) {
  const discoveryKey = store.discoveryKey(data.key)
  const core = CORESTORE_CORE.decode({ start: 0, end: data.value.byteLength, buffer: data.value })
  return { discoveryKey, core }
}

function mapAlias (data) {
  const alias = store.alias(data.key)
  return { alias, discoveryKey: data.value }
}

function mapBlock (data) {
  return { index: core.blockIndex(data.key), value: data.value }
}

function mapTreeNode (data) {
  return CORE_TREE_NODE.decode({ start: 0, end: data.value.byteLength, buffer: data.value })
}
````

## File: lib/tx.js
````javascript
const schema = require('../spec/hyperschema')
const { store, core } = require('./keys.js')
const View = require('./view.js')
const b4a = require('b4a')
const flat = require('flat-tree')

const CORESTORE_HEAD = schema.getEncoding('@corestore/head')
const CORESTORE_CORE = schema.getEncoding('@corestore/core')

const CORE_AUTH = schema.getEncoding('@core/auth')
const CORE_SESSIONS = schema.getEncoding('@core/sessions')
const CORE_HEAD = schema.getEncoding('@core/head')
const CORE_TREE_NODE = schema.getEncoding('@core/tree-node')
const CORE_DEPENDENCY = schema.getEncoding('@core/dependency')
const CORE_HINTS = schema.getEncoding('@core/hints')

class CoreTX {
  constructor (core, db, view, changes) {
    if (db.snapshotted) throw new Error('Cannot open core tx on snapshot')
    this.core = core
    this.db = db
    this.view = view
    this.changes = changes
  }

  setAuth (auth) {
    this.changes.push([core.auth(this.core.corePointer), encode(CORE_AUTH, auth), null])
  }

  setSessions (sessions) {
    this.changes.push([core.sessions(this.core.corePointer), encode(CORE_SESSIONS, sessions), null])
  }

  setHead (head) {
    this.changes.push([core.head(this.core.dataPointer), encode(CORE_HEAD, head), null])
  }

  setDependency (dep) {
    this.changes.push([core.dependency(this.core.dataPointer), encode(CORE_DEPENDENCY, dep), null])
  }

  setHints (hints) {
    this.changes.push([core.hints(this.core.dataPointer), encode(CORE_HINTS, hints), null])
  }

  putBlock (index, data) {
    this.changes.push([core.block(this.core.dataPointer, index), data, null])
  }

  deleteBlock (index) {
    this.changes.push([core.block(this.core.dataPointer, index), null, null])
  }

  deleteBlockRange (start, end) {
    this.changes.push([
      core.block(this.core.dataPointer, start),
      null,
      core.block(this.core.dataPointer, end === -1 ? Infinity : end)
    ])
  }

  putBitfieldPage (index, data) {
    this.changes.push([core.bitfield(this.core.dataPointer, index, 0), data, null])
  }

  deleteBitfieldPage (index) {
    this.changes.push([core.bitfield(this.core.dataPointer, index, 0), null, null])
  }

  deleteBitfieldPageRange (start, end) {
    this.changes.push([
      core.bitfield(this.core.dataPointer, start, 0),
      null,
      core.bitfield(this.core.dataPointer, end === -1 ? Infinity : end, 0)
    ])
  }

  putTreeNode (node) {
    this.changes.push([core.tree(this.core.dataPointer, node.index), encode(CORE_TREE_NODE, node), null])
  }

  deleteTreeNode (index) {
    this.changes.push([core.tree(this.core.dataPointer, index), null, null])
  }

  deleteTreeNodeRange (start, end) {
    this.changes.push([
      core.tree(this.core.dataPointer, start),
      null,
      core.tree(this.core.dataPointer, end === -1 ? Infinity : end)
    ])
  }

  putUserData (key, value) {
    const buffer = typeof value === 'string' ? b4a.from(value) : value
    this.changes.push([core.userData(this.core.dataPointer, key), buffer, null])
  }

  deleteUserData (key) {
    this.changes.push([core.userData(this.core.dataPointer, key), null, null])
  }

  putLocal (key, value) {
    this.changes.push([core.local(this.core.dataPointer, key), value, null])
  }

  deleteLocal (key) {
    this.changes.push([core.local(this.core.dataPointer, key), null, null])
  }

  deleteLocalRange (start, end) {
    this.changes.push([
      core.local(this.core.dataPointer, start),
      null,
      end === null ? core.localEnd(this.core.dataPointer) : core.local(this.core.dataPointer, end)
    ])
  }

  flush () {
    const changes = this.changes
    if (changes === null) return Promise.resolve(!this.view)

    this.changes = null

    if (this.view) {
      this.view.apply(changes)
      return Promise.resolve(false)
    }

    return View.flush(changes, this.db)
  }
}

class CoreRX {
  constructor (core, db, view) {
    this.core = core
    this.read = db.read({ autoDestroy: true })
    this.view = view

    view.readStart()
  }

  async getAuth () {
    return await decode(CORE_AUTH, await this.view.get(this.read, core.auth(this.core.corePointer)))
  }

  async getSessions () {
    return await decode(CORE_SESSIONS, await this.view.get(this.read, core.sessions(this.core.corePointer)))
  }

  async getHead () {
    return await decode(CORE_HEAD, await this.view.get(this.read, core.head(this.core.dataPointer)))
  }

  async getDependency () {
    return await decode(CORE_DEPENDENCY, await this.view.get(this.read, core.dependency(this.core.dataPointer)))
  }

  async getHints () {
    return await decode(CORE_HINTS, await this.view.get(this.read, core.hints(this.core.dataPointer)))
  }

  getBlock (index) {
    const dep = findBlockDependency(this.core.dependencies, index)
    const data = dep === null ? this.core.dataPointer : dep.dataPointer
    return this.view.get(this.read, core.block(data, index))
  }

  getBitfieldPage (index) {
    return this.view.get(this.read, core.bitfield(this.core.dataPointer, index, 0))
  }

  async getTreeNode (index) {
    const dep = findTreeDependency(this.core.dependencies, index)
    const data = dep === null ? this.core.dataPointer : dep.dataPointer
    return decode(CORE_TREE_NODE, await this.view.get(this.read, core.tree(data, index)))
  }

  async hasTreeNode (index) {
    return (await this.getTreeNode(index)) !== null
  }

  getUserData (key) {
    return this.view.get(this.read, core.userData(this.core.dataPointer, key))
  }

  getLocal (key) {
    return this.view.get(this.read, core.local(this.core.dataPointer, key))
  }

  tryFlush () {
    this.read.tryFlush()
    this._free()
  }

  destroy () {
    this.read.destroy()
    this._free()
  }

  _free () {
    if (this.view === null) return
    this.view.readStop()
    this.view = null
  }
}

class CorestoreTX {
  constructor (view) {
    this.view = view
    this.changes = []
  }

  setHead (head) {
    this.changes.push([store.head(), encode(CORESTORE_HEAD, head), null])
  }

  putCore (discoveryKey, ptr) {
    this.changes.push([store.core(discoveryKey), encode(CORESTORE_CORE, ptr), null])
  }

  putCoreByAlias (alias, discoveryKey) {
    this.changes.push([store.coreByAlias(alias), discoveryKey, null])
  }

  clear () {
    const [start, end] = store.clear()
    this.changes.push([start, null, end])
  }

  apply () {
    if (this.changes === null) return
    this.view.apply(this.changes)
    this.changes = null
  }
}

class CorestoreRX {
  constructor (db, view) {
    this.read = db.read({ autoDestroy: true })
    this.view = view

    view.readStart()
  }

  async getHead () {
    return decode(CORESTORE_HEAD, await this.view.get(this.read, store.head()))
  }

  async getCore (discoveryKey) {
    return decode(CORESTORE_CORE, await this.view.get(this.read, store.core(discoveryKey)))
  }

  getCoreByAlias (alias) {
    return this.view.get(this.read, store.coreByAlias(alias))
  }

  tryFlush () {
    this.read.tryFlush()
    this._free()
  }

  destroy () {
    this.read.destroy()
    this._free()
  }

  _free () {
    if (this.view === null) return
    this.view.readStop()
    this.view = null
  }
}

module.exports = { CorestoreTX, CorestoreRX, CoreTX, CoreRX }

function findBlockDependency (dependencies, index) {
  for (let i = 0; i < dependencies.length; i++) {
    const dep = dependencies[i]
    if (index < dep.length) return dep
  }

  return null
}

function findTreeDependency (dependencies, index) {
  for (let i = 0; i < dependencies.length; i++) {
    const dep = dependencies[i]
    if (flat.rightSpan(index) <= (dep.length - 1) * 2) return dep
  }

  return null
}

function decode (enc, buffer) {
  if (buffer === null) return null
  return enc.decode({ start: 0, end: buffer.byteLength, buffer })
}

function encode (enc, m) {
  // TODO: use fancy slab for small messages
  const state = { start: 0, end: 0, buffer: null }
  enc.preencode(state, m)
  state.buffer = b4a.allocUnsafe(state.end)
  enc.encode(state, m)
  return state.buffer
}
````

## File: lib/view.js
````javascript
const { Readable, getStreamError } = require('streamx')
const CloseErrorStream = require('./close-error-stream.js')
const b4a = require('b4a')

class OverlayStream extends Readable {
  constructor (stream, start, end, reverse, changes, cleared) {
    super()

    this.start = start
    this.end = end
    this.reverse = reverse
    this.changes = changes
    this.cleared = cleared
    this.change = 0
    this.range = 0

    this._stream = stream
    this._drained = false

    this._stream.on('readable', this._drainMaybe.bind(this))
    this._stream.on('error', noop)
    this._stream.on('close', this._onclose.bind(this))
  }

  _drainMaybe () {
    if (this._drained === true) return
    this._drained = this._onreadable()
  }

  _onclose () {
    if (this.destroying) return

    const err = getStreamError(this._stream)

    if (err !== null) {
      this.destroy(err)
      return
    }

    while (this.change < this.changes.length) {
      const c = this.changes[this.change++]
      const key = c[0]
      const value = c[1]

      if (value !== null && this._inRange(key)) this.push({ key, value })
    }

    this.push(null)
    this._stream = null
  }

  _onreadable () {
    let data = this._stream.read()
    if (data === null) return false

    let drained = false

    do {
      if (this._push(data) === true) drained = true
      data = this._stream.read()
    } while (data !== null)

    return drained
  }

  _read (cb) {
    this._drained = this._onreadable()
    cb(null)
  }

  _predestroy () {
    this.stream.destroy()
  }

  _push (entry) {
    const key = entry.key

    while (this.range < this.cleared.length) {
      const c = this.cleared[this.range]

      // we moved past the range
      if (this.reverse ? b4a.compare(key, c[0]) < 0 : b4a.compare(c[2], key) <= 0) {
        this.range++
        continue
      }

      // we didnt move past and are in, drop
      if (b4a.compare(c[0], key) <= 0 && b4a.compare(key, c[2]) < 0) {
        return false
      }

      break
    }

    let updated = false

    while (this.change < this.changes.length) {
      const c = this.changes[this.change]
      const key = c[0]
      const value = typeof c[1] === 'string' ? b4a.from(c[1]) : c[1]
      const cmp = b4a.compare(key, entry.key)

      // same value, if not deleted, return new one
      if (cmp === 0) {
        this.change++
        if (value === null || this._inRange(key) === false) return updated
        this.push({ key, value })
        return true
      }

      // we moved past the change, push it
      if (this.reverse ? cmp > 0 : cmp < 0) {
        this.change++
        if (value === null || this._inRange(key) === false) continue
        this.push({ key, value })
        updated = true
        continue
      }

      this.push(entry)
      return true
    }

    this.push(entry)
    return true
  }

  _inRange (key) {
    return b4a.compare(this.start, key) <= 0 && b4a.compare(key, this.end) < 0
  }
}

class Overlay {
  constructor () {
    this.indexed = 0
    this.changes = null
    this.cleared = null
    this.reverse = false
  }

  update (view, reverse) {
    if (view.indexed === this.indexed) return

    const changes = view.map === null ? [] : [...view.map.values()]
    const cleared = view.cleared === null ? [] : view.cleared.slice(0)

    const cmp = reverse ? cmpChangeReverse : cmpChange

    changes.sort(cmp)
    cleared.sort(cmp)

    this.indexed = view.indexed
    this.changes = changes
    this.cleared = cleared
    this.reverse = reverse
  }

  createStream (stream, start, end, reverse) {
    return new OverlayStream(
      stream,
      start,
      end,
      reverse,
      this.reverse === reverse ? this.changes : reverseArray(this.changes),
      this.reverse === reverse ? this.cleared : reverseArray(this.cleared)
    )
  }
}

class View {
  constructor () {
    this.map = null
    this.indexed = 0
    this.changes = null
    this.cleared = null
    this.overlay = null
    this.snap = null
    this.readers = 0
  }

  snapshot () {
    if (this._attached()) return this.snap.snapshot()

    const snap = new View()

    snap.map = this.map
    snap.indexed = this.indexed
    snap.changes = this.changes
    snap.cleared = this.cleared

    if (this._frozen()) return snap

    this.readers++
    snap.snap = this

    return snap
  }

  readStart () {
    if (this.snap !== null) this.readers++
  }

  readStop () {
    if (this.snap !== null && --this.readers === 0) this.snap.readers--
  }

  size () {
    return this.changes === null ? 0 : this.changes.length
  }

  updated () {
    return this.changes === null
  }

  get (read, key) {
    return this.changes === null ? read.get(key) : this._indexAndGet(read, key)
  }

  reset () {
    this.indexed = 0
    this.snap = this.map = this.changes = this.cleared = this.overlay = null
  }

  iterator (db, start, end, reverse) {
    if (dbClosing(db)) return new CloseErrorStream(new Error('RocksDB session is closed'))

    const stream = db.iterator({ gte: start, lt: end, reverse })
    if (this.changes === null) return stream

    this._index()

    if (this.overlay === null) this.overlay = new Overlay()
    this.overlay.update(this, reverse)
    return this.overlay.createStream(stream, start, end, reverse)
  }

  _indexAndGet (read, key) {
    this._index()
    const change = this.map.get(b4a.toString(key, 'hex'))

    if (change === undefined) {
      return this.cleared === null
        ? read.get(key)
        : this._readAndMaybeDrop(read, key)
    }

    return Promise.resolve(change[1])
  }

  async _readAndMaybeDrop (read, key) {
    const cleared = this.cleared // in case its cleared
    const value = await read.get(key)
    if (value === null) return null

    for (let i = 0; i < cleared.length; i++) {
      const c = cleared[i]
      // check if in range
      if (b4a.compare(c[0], key) <= 0 && b4a.compare(key, c[2]) < 0) return null
    }

    return value
  }

  _attached () {
    return this.snap !== null && this.changes === this.snap.changes
  }

  _frozen () {
    return this.changes === null || (this.snap !== null && this.changes !== this.snap.changes)
  }

  _index () {
    // if we are a snap and we are still attached (ie no mutations), simply copy the refs
    if (this._attached()) {
      this.snap._index()
      this.map = this.snap.map
      this.cleared = this.snap.cleared
      this.indexed = this.snap.indexed
      return
    }

    if (this.map === null) this.map = new Map()
    if (this.changes.length === this.indexed) return

    while (this.indexed < this.changes.length) {
      const c = this.changes[this.indexed++]

      if (c[2] === null) this.map.set(b4a.toString(c[0], 'hex'), c)
      else this._indexRange(c)
    }
  }

  _indexRange (range) {
    const s = b4a.toString(range[0], 'hex')
    const e = b4a.toString(range[2], 'hex')

    for (const [key, c] of this.map) {
      if (s <= key && key < e) this.map.set(key, [c[0], null, null])
    }

    if (this.cleared === null) this.cleared = []
    this.cleared.push(range)
  }

  apply (changes) {
    if (this.snap !== null) throw new Error('Illegal to push changes to a snapshot')

    if (this.readers !== 0 && this.changes !== null) {
      this.changes = this.changes.slice(0)
      this.cleared = this.cleared === null ? null : this.cleared.slice(0)
      this.map = this.map === null ? null : new Map([...this.map])
    }

    if (this.changes === null) {
      this.changes = changes
      return
    }

    for (let i = 0; i < changes.length; i++) {
      this.changes.push(changes[i])
    }
  }

  static async flush (changes, db) {
    if (changes === null) return true

    const w = db.write({ autoDestroy: true })

    for (const [start, value, end] of changes) {
      if (end !== null) w.tryDeleteRange(start, end)
      else if (value !== null) w.tryPut(start, value)
      else w.tryDelete(start)
    }

    await w.flush()

    return true
  }
}

module.exports = View

function cmpChange (a, b) {
  const c = b4a.compare(a[0], b[0])
  return c === 0 ? b4a.compare(a[2], b[2]) : c
}

function cmpChangeReverse (a, b) {
  return cmpChange(b, a)
}

function noop () {}

function reverseArray (list) {
  const r = new Array(list.length)
  for (let i = 0; i < list.length; i++) r[r.length - 1 - i] = list[i]
  return r
}

// TODO: expose from rocks instead
function dbClosing (db) {
  return db._state.closing || db._index === -1
}
````

## File: migrations/0/index.js
````javascript
const fs = require('fs')
const path = require('path')
const { Readable } = require('streamx')
const b4a = require('b4a')
const flat = require('flat-tree')
const crypto = require('hypercore-crypto')
const c = require('compact-encoding')
const m = require('./messages.js')
const View = require('../../lib/view.js')
const { CorestoreTX, CoreTX, CorestoreRX } = require('../../lib/tx.js')

const EMPTY_NODE = b4a.alloc(40)
const EMPTY_PAGE = b4a.alloc(4096)

let TREE_01_SKIP = null
let TREE_04_SKIP = null
let TREE_16_SKIP = null

class CoreListStream extends Readable {
  constructor (storage) {
    super()

    this.storage = storage
    this.stack = []
  }

  async _open (cb) {
    for (const a of await readdir(path.join(this.storage, 'cores'))) {
      for (const b of await readdir(path.join(this.storage, 'cores', a))) {
        for (const dkey of await readdir(path.join(this.storage, 'cores', a, b))) {
          this.stack.push(path.join(this.storage, 'cores', a, b, dkey))
        }
      }
    }

    cb(null)
  }

  async _read (cb) {
    while (true) {
      const next = this.stack.pop()
      if (!next) {
        this.push(null)
        break
      }

      const oplog = path.join(next, 'oplog')
      const result = await readOplog(oplog)
      if (!result) continue

      this.push(result)
      break
    }

    cb(null)
  }
}

function decodeOplogHeader (state) {
  c.uint32.decode(state) // cksum, ignore for now

  const l = c.uint32.decode(state)
  const length = l >> 2
  const headerBit = l & 1
  const partialBit = l & 2

  if (state.end - state.start < length) return null

  const end = state.start + length
  const result = { header: headerBit, partial: partialBit !== 0, byteLength: length + 8, message: null }

  try {
    result.message = m.oplog.header.decode({ start: state.start, end, buffer: state.buffer })
  } catch {
    return null
  }

  state.start = end
  return result
}

function decodeOplogEntry (state) {
  if (state.end - state.start < 8) return null

  c.uint32.decode(state) // cksum, ignore for now

  const l = c.uint32.decode(state)
  const length = l >>> 2
  const headerBit = l & 1
  const partialBit = l & 2

  if (state.end - state.start < length) return null

  const end = state.start + length

  const result = { header: headerBit, partial: partialBit !== 0, byteLength: length + 8, message: null }

  try {
    result.message = m.oplog.entry.decode({ start: state.start, end, buffer: state.buffer })
  } catch {
    return null
  }

  state.start = end

  return result
}

module.exports = { store, core }

async function store (storage, { version, dryRun = true, gc = true }) {
  const stream = new CoreListStream(storage.path)
  const view = new View()

  const tx = new CorestoreTX(view)
  const head = await storage._getHead(view)
  const primaryKeyFile = path.join(storage.path, 'primary-key')

  const primaryKey = await readFile(primaryKeyFile)

  if (!head.seed) head.seed = primaryKey

  for await (const data of stream) {
    const key = data.header.key
    const discoveryKey = crypto.discoveryKey(data.header.key)
    const files = getFiles(data.path)

    if (head.defaultDiscoveryKey === null) head.defaultDiscoveryKey = discoveryKey

    const core = {
      version: 0, // need later migration
      corePointer: head.allocated.cores++,
      dataPointer: head.allocated.datas++,
      alias: null
    }

    const ptr = { version: 0, corePointer: core.corePointer, dataPointer: core.dataPointer, dependencies: [] }
    const ctx = new CoreTX(ptr, storage.db, view, [])
    const userData = new Map()
    const treeNodes = new Map()

    const auth = {
      key,
      discoveryKey,
      manifest: data.header.manifest,
      keyPair: data.header.keyPair,
      encryptionKey: null
    }

    const tree = {
      length: 0,
      fork: 0,
      rootHash: null,
      signature: null
    }

    if (data.header.tree && data.header.tree.length) {
      tree.length = data.header.tree.length
      tree.fork = data.header.tree.fork
      tree.rootHash = data.header.tree.rootHash
      tree.signature = data.header.tree.signature
    }

    for (const { key, value } of data.header.userData) {
      userData.set(key, value)
    }

    for (const e of data.entries) {
      if (e.userData) userData.set(e.userData.key, e.userData.value)

      if (e.treeNodes) {
        for (const node of e.treeNodes) {
          treeNodes.set(node.index, node)
          ctx.putTreeNode(node)
        }
      }

      if (e.treeUpgrade) {
        if (e.treeUpgrade.ancestors !== tree.length) {
          throw new Error('Unflushed truncations not migrate-able atm')
        }

        tree.length = e.treeUpgrade.length
        tree.fork = e.treeUpgrade.fork
        tree.rootHash = null
        tree.signature = e.treeUpgrade.signature
      }
    }

    if (userData.has('corestore/name') && userData.has('corestore/namespace')) {
      core.alias = {
        name: b4a.toString(userData.get('corestore/name')),
        namespace: userData.get('corestore/namespace')
      }
      userData.delete('corestore/name')
      userData.delete('corestore/namespace')
    }

    for (const [key, value] of userData) {
      ctx.putUserData(key, value)
    }

    ctx.setAuth(auth)

    const getTreeNode = (index) => (treeNodes.get(index) || getTreeNodeFromFile(files.tree, index))

    if (tree.length) {
      if (tree.rootHash === null) tree.rootHash = crypto.tree(await getRoots(tree.length, getTreeNode))
      ctx.setHead(tree)
    }

    tx.putCore(discoveryKey, core)
    if (core.alias) tx.putCoreByAlias(core.alias, discoveryKey)

    await ctx.flush()
  }

  head.version = version
  tx.setHead(head)
  tx.apply()

  if (dryRun) return

  await View.flush(view.changes, storage.db)

  if (gc) await rm(primaryKeyFile)
}

class BlockSlicer {
  constructor (filename) {
    this.stream = fs.createReadStream(filename)
    this.closed = new Promise(resolve => this.stream.once('close', resolve))
    this.offset = 0
    this.overflow = null
  }

  async take (offset, size) {
    let buffer = null
    if (offset < this.offset) throw new Error('overread')

    while (true) {
      let data = null

      if (this.overflow) {
        data = this.overflow
        this.overflow = null
      } else {
        data = this.stream.read()

        if (!data) {
          await new Promise(resolve => this.stream.once('readable', resolve))
          continue
        }
      }

      let chunk = null

      if (this.offset === offset || buffer) {
        chunk = data
      } else if (this.offset + data.byteLength > offset) {
        chunk = data.subarray(offset - this.offset)
      }

      this.offset += data.byteLength
      if (!chunk) continue

      if (buffer) buffer = b4a.concat([buffer, chunk])
      else buffer = chunk

      if (buffer.byteLength < size) continue

      const result = buffer.subarray(0, size)
      this.overflow = size === buffer.byteLength ? null : buffer.subarray(result.byteLength)
      this.offset -= (this.overflow ? this.overflow.byteLength : 0)
      return result
    }
  }

  close () {
    this.stream.on('error', noop)
    this.stream.destroy()
    return this.closed
  }
}

class TreeSlicer {
  constructor () {
    this.buffer = null
    this.offset = 0
  }

  get size () {
    return this.buffer === null ? 0 : this.buffer.byteLength
  }

  push (data) {
    if (this.buffer === null) this.buffer = data
    else this.buffer = b4a.concat([this.buffer, data])
    this.offset += data.byteLength
  }

  skip () {
    let skipped = 0

    if (TREE_01_SKIP === null) {
      TREE_16_SKIP = b4a.alloc(16 * 40 * 100)
      TREE_04_SKIP = TREE_16_SKIP.subarray(0, 4 * 40 * 100)
      TREE_01_SKIP = TREE_16_SKIP.subarray(0, 1 * 40 * 100)
    }

    while (true) {
      if (this.buffer.byteLength >= TREE_16_SKIP.byteLength) {
        if (b4a.equals(this.buffer.subarray(0, TREE_16_SKIP.byteLength), TREE_16_SKIP)) {
          this.buffer = this.buffer.subarray(TREE_16_SKIP.byteLength)
          skipped += 1600
          continue
        }
      }

      if (this.buffer.byteLength >= TREE_04_SKIP.byteLength) {
        if (b4a.equals(this.buffer.subarray(0, TREE_04_SKIP.byteLength), TREE_04_SKIP)) {
          this.buffer = this.buffer.subarray(TREE_04_SKIP.byteLength)
          skipped += 400
          continue
        }
      }

      if (this.buffer.byteLength >= TREE_01_SKIP.byteLength) {
        if (b4a.equals(this.buffer.subarray(0, TREE_01_SKIP.byteLength), TREE_01_SKIP)) {
          this.buffer = this.buffer.subarray(TREE_01_SKIP.byteLength)
          skipped += 100
          continue
        }
      }
      break
    }

    return skipped
  }

  take () {
    const len = 40

    if (len <= this.size) {
      const chunk = this.buffer.subarray(0, len)
      this.buffer = this.buffer.subarray(len)
      return chunk
    }

    return null
  }
}

async function core (core, { version, dryRun = true, gc = true }) {
  if (dryRun) return // dryRun mode not supported atm

  const rx = core.read()

  const promises = [rx.getAuth(), rx.getHead()]
  rx.tryFlush()

  const [auth, head] = await Promise.all(promises)

  if (!auth) return

  const dk = b4a.toString(auth.discoveryKey, 'hex')
  const files = getFiles(path.join(core.store.path, 'cores', dk.slice(0, 2), dk.slice(2, 4), dk))

  if (head === null || head.length === 0) {
    await commitCoreMigration(auth, core, version)
    if (gc) await runGC()
    return // no data
  }

  const oplog = await readOplog(files.oplog)
  if (!oplog) throw new Error('No oplog available for ' + files.oplog + ', length = ' + (head ? head.length : 0) + ', writable = ' + (!!auth.keyPair))

  const treeData = new TreeSlicer()

  let treeIndex = 0

  if (await exists(files.tree)) {
    for await (const data of fs.createReadStream(files.tree)) {
      treeData.push(data)

      let write = null

      while (true) {
        const skip = treeData.skip()
        treeIndex += skip

        const buf = treeData.take()
        if (buf === null) break

        const index = treeIndex++
        if (b4a.equals(buf, EMPTY_NODE)) continue

        if (write === null) write = core.write()
        write.putTreeNode(decodeTreeNode(index, buf))
      }

      if (write !== null) await write.flush()
    }
  }

  const buf = []
  if (await exists(files.bitfield)) {
    for await (const data of fs.createReadStream(files.bitfield)) {
      buf.push(data)
    }
  }

  let bitfield = b4a.concat(buf)
  if (bitfield.byteLength & 4095) bitfield = b4a.concat([bitfield, b4a.alloc(4096 - (bitfield.byteLength & 4095))])

  const pages = new Map()
  const headerBits = new Map()

  const roots = await getRootsFromStorage(core, head.length)

  for (const e of oplog.entries) {
    if (!e.bitfield) continue

    for (let i = 0; i < e.bitfield.length; i++) {
      headerBits.set(i + e.bitfield.start, !e.bitfield.drop)
    }
  }

  let batch = []

  const cache = new Map()
  const blocks = new BlockSlicer(files.data)

  for (const index of allBits(bitfield)) {
    if (headerBits.get(index) === false) continue
    if (index >= head.length) continue

    setBitInPage(index)

    batch.push(index)
    if (batch.length < 1024) continue

    await writeBlocksBatch()
    continue
  }

  if (batch.length) await writeBlocksBatch()

  await blocks.close()

  const w = core.write()

  for (const [index, bit] of headerBits) {
    if (!bit) continue
    if (index >= head.length) continue

    setBitInPage(index)

    const blk = await getBlockFromFile(files.data, core, index, roots, cache)
    w.putBlock(index, blk)
  }

  for (const [index, page] of pages) {
    w.putBitfieldPage(index, b4a.from(page.buffer, page.byteOffset, page.byteLength))
  }

  await w.flush()

  let contiguousLength = 0
  for await (const data of core.createBlockStream()) {
    if (data.index === contiguousLength) contiguousLength++
    else break
  }

  if (contiguousLength) {
    const w = core.write()
    w.setHints({ contiguousLength })
    await w.flush()
  }

  await commitCoreMigration(auth, core, version)

  if (gc) await runGC()

  async function runGC () {
    await rm(files.path)
    await rmdir(path.join(files.path, '..'))
    await rmdir(path.join(files.path, '../..'))
    await rmdir(path.join(core.store.path, 'cores'))
  }

  function setBitInPage (index) {
    const n = index & 32767
    const p = (index - n) / 32768

    let page = pages.get(p)

    if (!page) {
      page = new Uint32Array(1024)
      pages.set(p, page)
    }

    const o = n & 31
    const b = (n - o) / 32
    const v = 1 << o

    page[b] |= v
  }

  async function writeBlocksBatch () {
    const read = core.read()
    const promises = []
    for (const index of batch) promises.push(getByteRangeFromStorage(read, 2 * index, roots, cache))
    read.tryFlush()

    const r = await Promise.all(promises)
    const tx = core.write()

    for (let i = 0; i < r.length; i++) {
      const index = batch[i]
      const [offset, size] = r[i]

      const blk = await blocks.take(offset, size)
      tx.putBlock(index, blk)
    }

    batch = []
    if (cache.size > 16384) cache.clear()

    await tx.flush()
  }
}

async function commitCoreMigration (auth, core, version) {
  const view = new View()
  const rx = new CorestoreRX(core.db, view)

  const storeCorePromise = rx.getCore(auth.discoveryKey)
  rx.tryFlush()

  const storeCore = await storeCorePromise

  storeCore.version = version

  const tx = new CorestoreTX(view)

  tx.putCore(auth.discoveryKey, storeCore)
  tx.apply()

  await View.flush(view.changes, core.db)
}

async function getBlockFromFile (file, core, index, roots, cache) {
  const rx = core.read()
  const promise = getByteRangeFromStorage(rx, 2 * index, roots, cache)
  rx.tryFlush()
  const [offset, size] = await promise

  return new Promise(function (resolve) {
    readAll(file, size, offset, function (err, buf) {
      if (err) return resolve(null)
      resolve(buf)
    })
  })
}

function getFiles (dir) {
  return {
    path: dir,
    oplog: path.join(dir, 'oplog'),
    data: path.join(dir, 'data'),
    tree: path.join(dir, 'tree'),
    bitfield: path.join(dir, 'bitfield')
  }
}

async function getRootsFromStorage (core, length) {
  const all = []
  const rx = core.read()
  for (const index of flat.fullRoots(2 * length)) {
    all.push(rx.getTreeNode(index))
  }
  rx.tryFlush()
  return Promise.all(all)
}

async function getRoots (length, getTreeNode) {
  const all = []
  for (const index of flat.fullRoots(2 * length)) {
    all.push(await getTreeNode(index))
  }
  return all
}

function getCached (read, cache, index) {
  if (cache.has(index)) return cache.get(index)
  const p = read.getTreeNode(index)
  cache.set(index, p)
  return p
}

async function getByteRangeFromStorage (read, index, roots, cache) {
  const promises = [getCached(read, cache, index), getByteOffsetFromStorage(read, index, roots, cache)]
  const [node, offset] = await Promise.all(promises)
  return [offset, node.size]
}

async function getByteOffsetFromStorage (rx, index, roots, cache) {
  if (index === 0) return 0
  if ((index & 1) === 1) index = flat.leftSpan(index)

  let head = 0
  let offset = 0

  for (const node of roots) { // all async ticks happen once we find the root so safe
    head += 2 * ((node.index - head) + 1)

    if (index >= head) {
      offset += node.size
      continue
    }

    const ite = flat.iterator(node.index)
    const promises = []

    while (ite.index !== index) {
      if (index < ite.index) {
        ite.leftChild()
      } else {
        promises.push(getCached(rx, cache, ite.leftChild()))
        ite.sibling()
      }
    }

    const nodes = await Promise.all(promises)
    for (const node of nodes) offset += node.size

    return offset
  }

  throw new Error('Failed to find offset')
}

function decodeTreeNode (index, buf) {
  return { index, size: c.decode(c.uint64, buf), hash: buf.subarray(8) }
}

async function getTreeNodeFromFile (file, index) {
  return new Promise(function (resolve) {
    readAll(file, 40, index * 40, function (err, buf) {
      if (err) return resolve(null)
      resolve(decodeTreeNode(index, buf))
    })
  })
}

function readAll (filename, length, pos, cb) {
  const buf = b4a.alloc(length)

  fs.open(filename, 'r', function (err, fd) {
    if (err) return cb(err)

    let offset = 0

    fs.read(fd, buf, offset, buf.byteLength, pos, function loop (err, read) {
      if (err) return done(err)
      if (read === 0) return done(new Error('Partial read'))
      offset += read
      if (offset === buf.byteLength) return done(null, buf)
      fs.read(fd, offset, buf.byteLength - offset, buf, pos + offset, loop)
    })

    function done (err, value) {
      fs.close(fd, () => cb(err, value))
    }
  })
}

async function readdir (dir) {
  try {
    return await fs.promises.readdir(dir)
  } catch {
    return []
  }
}

async function exists (file) {
  try {
    await fs.promises.stat(file)
    return true
  } catch {
    return false
  }
}

async function readFile (file) {
  try {
    return await fs.promises.readFile(file)
  } catch {
    return null
  }
}

async function rm (dir) {
  try {
    await fs.promises.rm(dir, { recursive: true })
  } catch {}
}

async function rmdir (dir) {
  try {
    await fs.promises.rmdir(dir)
  } catch {}
}

function * allBits (buffer) {
  for (let i = 0; i < buffer.byteLength; i += EMPTY_PAGE.byteLength) {
    const page = buffer.subarray(i, i + EMPTY_NODE.byteLength)
    if (b4a.equals(page, EMPTY_PAGE)) continue

    const view = new Uint32Array(page.buffer, page.byteOffset, EMPTY_PAGE.byteLength / 4)

    for (let j = 0; j < view.length; j++) {
      const n = view[j]
      if (n === 0) continue

      for (let k = 0; k < 32; k++) {
        const m = 1 << k
        if (n & m) yield i * 8 + j * 32 + k
      }
    }
  }
}

function readOplog (oplog) {
  return new Promise(function (resolve) {
    fs.readFile(oplog, function (err, buffer) {
      if (err) return resolve(null)

      const state = { start: 0, end: buffer.byteLength, buffer }
      const headers = [1, 0]

      const h1 = decodeOplogHeader(state)
      state.start = 4096

      const h2 = decodeOplogHeader(state)
      state.start = 4096 * 2

      if (!h1 && !h2) return resolve(null)

      if (h1 && !h2) {
        headers[0] = h1.header
        headers[1] = h1.header
      } else if (!h1 && h2) {
        headers[0] = (h2.header + 1) & 1
        headers[1] = h2.header
      } else {
        headers[0] = h1.header
        headers[1] = h2.header
      }

      const header = (headers[0] + headers[1]) & 1
      const result = { path: path.dirname(oplog), header: null, entries: [] }
      const decoded = []

      result.header = header ? h2.message : h1.message

      if (result.header.external) {
        fs.readFile(path.join(oplog, '../header'), function (err, buffer) {
          if (err) return resolve(null)
          const start = result.header.external.start
          const end = start + result.header.external.length
          result.header = m.oplog.header.decode({ buffer, start, end })
          finish()
        })
        return
      }

      finish()

      function finish () {
        while (true) {
          const entry = decodeOplogEntry(state)
          if (!entry) break
          if (entry.header !== header) break

          decoded.push(entry)
        }

        while (decoded.length > 0 && decoded[decoded.length - 1].partial) decoded.pop()

        for (const e of decoded) {
          result.entries.push(e.message)
        }

        resolve(result)
      }
    })
  })
}

function noop () {}
````

## File: migrations/0/messages.js
````javascript
// needed here for compat, copied from old hypercore, do not change this

const c = require('compact-encoding')
const b4a = require('b4a')

const EMPTY = b4a.alloc(0)
const DEFAULT_NAMESPACE = b4a.from('4144eea531e483d54e0c14f4ca68e0644f355343ff6fcb0f005200e12cd747cb', 'hex')

const hashes = {
  preencode (state, m) {
    state.end++ // small uint
  },
  encode (state, m) {
    if (m === 'blake2b') {
      c.uint.encode(state, 0)
      return
    }

    throw new Error('Unknown hash: ' + m)
  },
  decode (state) {
    const n = c.uint.decode(state)
    if (n === 0) return 'blake2b'
    throw new Error('Unknown hash id: ' + n)
  }
}

const signatures = {
  preencode (state, m) {
    state.end++ // small uint
  },
  encode (state, m) {
    if (m === 'ed25519') {
      c.uint.encode(state, 0)
      return
    }

    throw new Error('Unknown signature: ' + m)
  },
  decode (state) {
    const n = c.uint.decode(state)
    if (n === 0) return 'ed25519'
    throw new Error('Unknown signature id: ' + n)
  }
}

const signer = {
  preencode (state, m) {
    signatures.preencode(state, m.signature)
    c.fixed32.preencode(state, m.namespace)
    c.fixed32.preencode(state, m.publicKey)
  },
  encode (state, m) {
    signatures.encode(state, m.signature)
    c.fixed32.encode(state, m.namespace)
    c.fixed32.encode(state, m.publicKey)
  },
  decode (state) {
    return {
      signature: signatures.decode(state),
      namespace: c.fixed32.decode(state),
      publicKey: c.fixed32.decode(state)
    }
  }
}

const signerArray = c.array(signer)

const prologue = {
  preencode (state, p) {
    c.fixed32.preencode(state, p.hash)
    c.uint.preencode(state, p.length)
  },
  encode (state, p) {
    c.fixed32.encode(state, p.hash)
    c.uint.encode(state, p.length)
  },
  decode (state) {
    return {
      hash: c.fixed32.decode(state),
      length: c.uint.decode(state)
    }
  }
}

const manifestv0 = {
  preencode (state, m) {
    hashes.preencode(state, m.hash)
    state.end++ // type

    if (m.prologue && m.signers.length === 0) {
      c.fixed32.preencode(state, m.prologue.hash)
      return
    }

    if (m.quorum === 1 && m.signers.length === 1 && !m.allowPatch) {
      signer.preencode(state, m.signers[0])
    } else {
      state.end++ // flags
      c.uint.preencode(state, m.quorum)
      signerArray.preencode(state, m.signers)
    }
  },
  encode (state, m) {
    hashes.encode(state, m.hash)

    if (m.prologue && m.signers.length === 0) {
      c.uint.encode(state, 0)
      c.fixed32.encode(state, m.prologue.hash)
      return
    }

    if (m.quorum === 1 && m.signers.length === 1 && !m.allowPatch) {
      c.uint.encode(state, 1)
      signer.encode(state, m.signers[0])
    } else {
      c.uint.encode(state, 2)
      c.uint.encode(state, m.allowPatch ? 1 : 0)
      c.uint.encode(state, m.quorum)
      signerArray.encode(state, m.signers)
    }
  },
  decode (state) {
    const hash = hashes.decode(state)
    const type = c.uint.decode(state)

    if (type > 2) throw new Error('Unknown type: ' + type)

    if (type === 0) {
      return {
        version: 0,
        hash,
        allowPatch: false,
        quorum: 0,
        signers: [],
        prologue: {
          hash: c.fixed32.decode(state),
          length: 0
        }
      }
    }

    if (type === 1) {
      return {
        version: 0,
        hash,
        allowPatch: false,
        quorum: 1,
        signers: [signer.decode(state)],
        prologue: null
      }
    }

    const flags = c.uint.decode(state)

    return {
      version: 0,
      hash,
      allowPatch: (flags & 1) !== 0,
      quorum: c.uint.decode(state),
      signers: signerArray.decode(state),
      prologue: null
    }
  }
}

const manifest = exports.manifest = {
  preencode (state, m) {
    state.end++ // version
    if (m.version === 0) return manifestv0.preencode(state, m)

    state.end++ // flags
    hashes.preencode(state, m.hash)

    c.uint.preencode(state, m.quorum)
    signerArray.preencode(state, m.signers)
    if (m.prologue) prologue.preencode(state, m.prologue)
  },
  encode (state, m) {
    c.uint.encode(state, m.version)
    if (m.version === 0) return manifestv0.encode(state, m)

    c.uint.encode(state, (m.allowPatch ? 1 : 0) | (m.prologue ? 2 : 0) | (m.unencrypted ? 4 : 0))
    hashes.encode(state, m.hash)

    c.uint.encode(state, m.quorum)
    signerArray.encode(state, m.signers)
    if (m.prologue) prologue.encode(state, m.prologue)
  },
  decode (state) {
    const v = c.uint.decode(state)
    if (v === 0) return manifestv0.decode(state)
    if (v !== 1) throw new Error('Unknown version: ' + v)

    const flags = c.uint.decode(state)
    const hash = hashes.decode(state)
    const quorum = c.uint.decode(state)
    const signers = signerArray.decode(state)
    const unencrypted = (flags & 4) !== 0

    return {
      version: 1,
      hash,
      allowPatch: (flags & 1) !== 0,
      quorum,
      signers,
      prologue: (flags & 2) === 0 ? null : prologue.decode(state),
      unencrypted
    }
  }
}

const node = {
  preencode (state, n) {
    c.uint.preencode(state, n.index)
    c.uint.preencode(state, n.size)
    c.fixed32.preencode(state, n.hash)
  },
  encode (state, n) {
    c.uint.encode(state, n.index)
    c.uint.encode(state, n.size)
    c.fixed32.encode(state, n.hash)
  },
  decode (state) {
    return {
      index: c.uint.decode(state),
      size: c.uint.decode(state),
      hash: c.fixed32.decode(state)
    }
  }
}

const nodeArray = c.array(node)

const wire = exports.wire = {}

wire.handshake = {
  preencode (state, m) {
    c.uint.preencode(state, 1)
    c.fixed32.preencode(state, m.capability)
  },
  encode (state, m) {
    c.uint.encode(state, m.seeks ? 1 : 0)
    c.fixed32.encode(state, m.capability)
  },
  decode (state) {
    const flags = c.uint.decode(state)
    return {
      seeks: (flags & 1) !== 0,
      capability: c.fixed32.decode(state)
    }
  }
}

const requestBlock = {
  preencode (state, b) {
    c.uint.preencode(state, b.index)
    c.uint.preencode(state, b.nodes)
  },
  encode (state, b) {
    c.uint.encode(state, b.index)
    c.uint.encode(state, b.nodes)
  },
  decode (state) {
    return {
      index: c.uint.decode(state),
      nodes: c.uint.decode(state)
    }
  }
}

const requestSeek = {
  preencode (state, s) {
    c.uint.preencode(state, s.bytes)
    c.uint.preencode(state, s.padding)
  },
  encode (state, s) {
    c.uint.encode(state, s.bytes)
    c.uint.encode(state, s.padding)
  },
  decode (state) {
    return {
      bytes: c.uint.decode(state),
      padding: c.uint.decode(state)
    }
  }
}

const requestUpgrade = {
  preencode (state, u) {
    c.uint.preencode(state, u.start)
    c.uint.preencode(state, u.length)
  },
  encode (state, u) {
    c.uint.encode(state, u.start)
    c.uint.encode(state, u.length)
  },
  decode (state) {
    return {
      start: c.uint.decode(state),
      length: c.uint.decode(state)
    }
  }
}

wire.request = {
  preencode (state, m) {
    state.end++ // flags
    c.uint.preencode(state, m.id)
    c.uint.preencode(state, m.fork)

    if (m.block) requestBlock.preencode(state, m.block)
    if (m.hash) requestBlock.preencode(state, m.hash)
    if (m.seek) requestSeek.preencode(state, m.seek)
    if (m.upgrade) requestUpgrade.preencode(state, m.upgrade)
    if (m.priority) c.uint.preencode(state, m.priority)
  },
  encode (state, m) {
    const flags = (m.block ? 1 : 0) | (m.hash ? 2 : 0) | (m.seek ? 4 : 0) | (m.upgrade ? 8 : 0) | (m.manifest ? 16 : 0) | (m.priority ? 32 : 0)

    c.uint.encode(state, flags)
    c.uint.encode(state, m.id)
    c.uint.encode(state, m.fork)

    if (m.block) requestBlock.encode(state, m.block)
    if (m.hash) requestBlock.encode(state, m.hash)
    if (m.seek) requestSeek.encode(state, m.seek)
    if (m.upgrade) requestUpgrade.encode(state, m.upgrade)
    if (m.priority) c.uint.encode(state, m.priority)
  },
  decode (state) {
    const flags = c.uint.decode(state)

    return {
      id: c.uint.decode(state),
      fork: c.uint.decode(state),
      block: flags & 1 ? requestBlock.decode(state) : null,
      hash: flags & 2 ? requestBlock.decode(state) : null,
      seek: flags & 4 ? requestSeek.decode(state) : null,
      upgrade: flags & 8 ? requestUpgrade.decode(state) : null,
      manifest: (flags & 16) !== 0,
      priority: flags & 32 ? c.uint.decode(state) : 0
    }
  }
}

wire.cancel = {
  preencode (state, m) {
    c.uint.preencode(state, m.request)
  },
  encode (state, m) {
    c.uint.encode(state, m.request)
  },
  decode (state, m) {
    return {
      request: c.uint.decode(state)
    }
  }
}

const dataUpgrade = {
  preencode (state, u) {
    c.uint.preencode(state, u.start)
    c.uint.preencode(state, u.length)
    nodeArray.preencode(state, u.nodes)
    nodeArray.preencode(state, u.additionalNodes)
    c.buffer.preencode(state, u.signature)
  },
  encode (state, u) {
    c.uint.encode(state, u.start)
    c.uint.encode(state, u.length)
    nodeArray.encode(state, u.nodes)
    nodeArray.encode(state, u.additionalNodes)
    c.buffer.encode(state, u.signature)
  },
  decode (state) {
    return {
      start: c.uint.decode(state),
      length: c.uint.decode(state),
      nodes: nodeArray.decode(state),
      additionalNodes: nodeArray.decode(state),
      signature: c.buffer.decode(state)
    }
  }
}

const dataSeek = {
  preencode (state, s) {
    c.uint.preencode(state, s.bytes)
    nodeArray.preencode(state, s.nodes)
  },
  encode (state, s) {
    c.uint.encode(state, s.bytes)
    nodeArray.encode(state, s.nodes)
  },
  decode (state) {
    return {
      bytes: c.uint.decode(state),
      nodes: nodeArray.decode(state)
    }
  }
}

const dataBlock = {
  preencode (state, b) {
    c.uint.preencode(state, b.index)
    c.buffer.preencode(state, b.value)
    nodeArray.preencode(state, b.nodes)
  },
  encode (state, b) {
    c.uint.encode(state, b.index)
    c.buffer.encode(state, b.value)
    nodeArray.encode(state, b.nodes)
  },
  decode (state) {
    return {
      index: c.uint.decode(state),
      value: c.buffer.decode(state) || EMPTY,
      nodes: nodeArray.decode(state)
    }
  }
}

const dataHash = {
  preencode (state, b) {
    c.uint.preencode(state, b.index)
    nodeArray.preencode(state, b.nodes)
  },
  encode (state, b) {
    c.uint.encode(state, b.index)
    nodeArray.encode(state, b.nodes)
  },
  decode (state) {
    return {
      index: c.uint.decode(state),
      nodes: nodeArray.decode(state)
    }
  }
}

wire.data = {
  preencode (state, m) {
    state.end++ // flags
    c.uint.preencode(state, m.request)
    c.uint.preencode(state, m.fork)

    if (m.block) dataBlock.preencode(state, m.block)
    if (m.hash) dataHash.preencode(state, m.hash)
    if (m.seek) dataSeek.preencode(state, m.seek)
    if (m.upgrade) dataUpgrade.preencode(state, m.upgrade)
    if (m.manifest) manifest.preencode(state, m.manifest)
  },
  encode (state, m) {
    const flags = (m.block ? 1 : 0) | (m.hash ? 2 : 0) | (m.seek ? 4 : 0) | (m.upgrade ? 8 : 0) | (m.manifest ? 16 : 0)

    c.uint.encode(state, flags)
    c.uint.encode(state, m.request)
    c.uint.encode(state, m.fork)

    if (m.block) dataBlock.encode(state, m.block)
    if (m.hash) dataHash.encode(state, m.hash)
    if (m.seek) dataSeek.encode(state, m.seek)
    if (m.upgrade) dataUpgrade.encode(state, m.upgrade)
    if (m.manifest) manifest.encode(state, m.manifest)
  },
  decode (state) {
    const flags = c.uint.decode(state)

    return {
      request: c.uint.decode(state),
      fork: c.uint.decode(state),
      block: flags & 1 ? dataBlock.decode(state) : null,
      hash: flags & 2 ? dataHash.decode(state) : null,
      seek: flags & 4 ? dataSeek.decode(state) : null,
      upgrade: flags & 8 ? dataUpgrade.decode(state) : null,
      manifest: flags & 16 ? manifest.decode(state) : null
    }
  }
}

wire.noData = {
  preencode (state, m) {
    c.uint.preencode(state, m.request)
  },
  encode (state, m) {
    c.uint.encode(state, m.request)
  },
  decode (state, m) {
    return {
      request: c.uint.decode(state)
    }
  }
}

wire.want = {
  preencode (state, m) {
    c.uint.preencode(state, m.start)
    c.uint.preencode(state, m.length)
  },
  encode (state, m) {
    c.uint.encode(state, m.start)
    c.uint.encode(state, m.length)
  },
  decode (state) {
    return {
      start: c.uint.decode(state),
      length: c.uint.decode(state)
    }
  }
}

wire.unwant = {
  preencode (state, m) {
    c.uint.preencode(state, m.start)
    c.uint.preencode(state, m.length)
  },
  encode (state, m) {
    c.uint.encode(state, m.start)
    c.uint.encode(state, m.length)
  },
  decode (state, m) {
    return {
      start: c.uint.decode(state),
      length: c.uint.decode(state)
    }
  }
}

wire.range = {
  preencode (state, m) {
    state.end++ // flags
    c.uint.preencode(state, m.start)
    if (m.length !== 1) c.uint.preencode(state, m.length)
  },
  encode (state, m) {
    c.uint.encode(state, (m.drop ? 1 : 0) | (m.length === 1 ? 2 : 0))
    c.uint.encode(state, m.start)
    if (m.length !== 1) c.uint.encode(state, m.length)
  },
  decode (state) {
    const flags = c.uint.decode(state)

    return {
      drop: (flags & 1) !== 0,
      start: c.uint.decode(state),
      length: (flags & 2) !== 0 ? 1 : c.uint.decode(state)
    }
  }
}

wire.bitfield = {
  preencode (state, m) {
    c.uint.preencode(state, m.start)
    c.uint32array.preencode(state, m.bitfield)
  },
  encode (state, m) {
    c.uint.encode(state, m.start)
    c.uint32array.encode(state, m.bitfield)
  },
  decode (state, m) {
    return {
      start: c.uint.decode(state),
      bitfield: c.uint32array.decode(state)
    }
  }
}

wire.sync = {
  preencode (state, m) {
    state.end++ // flags
    c.uint.preencode(state, m.fork)
    c.uint.preencode(state, m.length)
    c.uint.preencode(state, m.remoteLength)
  },
  encode (state, m) {
    c.uint.encode(state, (m.canUpgrade ? 1 : 0) | (m.uploading ? 2 : 0) | (m.downloading ? 4 : 0) | (m.hasManifest ? 8 : 0))
    c.uint.encode(state, m.fork)
    c.uint.encode(state, m.length)
    c.uint.encode(state, m.remoteLength)
  },
  decode (state) {
    const flags = c.uint.decode(state)

    return {
      fork: c.uint.decode(state),
      length: c.uint.decode(state),
      remoteLength: c.uint.decode(state),
      canUpgrade: (flags & 1) !== 0,
      uploading: (flags & 2) !== 0,
      downloading: (flags & 4) !== 0,
      hasManifest: (flags & 8) !== 0
    }
  }
}

wire.reorgHint = {
  preencode (state, m) {
    c.uint.preencode(state, m.from)
    c.uint.preencode(state, m.to)
    c.uint.preencode(state, m.ancestors)
  },
  encode (state, m) {
    c.uint.encode(state, m.from)
    c.uint.encode(state, m.to)
    c.uint.encode(state, m.ancestors)
  },
  decode (state) {
    return {
      from: c.uint.encode(state),
      to: c.uint.encode(state),
      ancestors: c.uint.encode(state)
    }
  }
}

wire.extension = {
  preencode (state, m) {
    c.string.preencode(state, m.name)
    c.raw.preencode(state, m.message)
  },
  encode (state, m) {
    c.string.encode(state, m.name)
    c.raw.encode(state, m.message)
  },
  decode (state) {
    return {
      name: c.string.decode(state),
      message: c.raw.decode(state)
    }
  }
}

const keyValue = {
  preencode (state, p) {
    c.string.preencode(state, p.key)
    c.buffer.preencode(state, p.value)
  },
  encode (state, p) {
    c.string.encode(state, p.key)
    c.buffer.encode(state, p.value)
  },
  decode (state) {
    return {
      key: c.string.decode(state),
      value: c.buffer.decode(state)
    }
  }
}

const treeUpgrade = {
  preencode (state, u) {
    c.uint.preencode(state, u.fork)
    c.uint.preencode(state, u.ancestors)
    c.uint.preencode(state, u.length)
    c.buffer.preencode(state, u.signature)
  },
  encode (state, u) {
    c.uint.encode(state, u.fork)
    c.uint.encode(state, u.ancestors)
    c.uint.encode(state, u.length)
    c.buffer.encode(state, u.signature)
  },
  decode (state) {
    return {
      fork: c.uint.decode(state),
      ancestors: c.uint.decode(state),
      length: c.uint.decode(state),
      signature: c.buffer.decode(state)
    }
  }
}

const bitfieldUpdate = { // TODO: can maybe be folded into a HAVE later on with the most recent spec
  preencode (state, b) {
    state.end++ // flags
    c.uint.preencode(state, b.start)
    c.uint.preencode(state, b.length)
  },
  encode (state, b) {
    state.buffer[state.start++] = b.drop ? 1 : 0
    c.uint.encode(state, b.start)
    c.uint.encode(state, b.length)
  },
  decode (state) {
    const flags = c.uint.decode(state)
    return {
      drop: (flags & 1) !== 0,
      start: c.uint.decode(state),
      length: c.uint.decode(state)
    }
  }
}

const oplog = exports.oplog = {}

oplog.entry = {
  preencode (state, m) {
    state.end++ // flags
    if (m.userData) keyValue.preencode(state, m.userData)
    if (m.treeNodes) nodeArray.preencode(state, m.treeNodes)
    if (m.treeUpgrade) treeUpgrade.preencode(state, m.treeUpgrade)
    if (m.bitfield) bitfieldUpdate.preencode(state, m.bitfield)
  },
  encode (state, m) {
    const s = state.start++
    let flags = 0

    if (m.userData) {
      flags |= 1
      keyValue.encode(state, m.userData)
    }
    if (m.treeNodes) {
      flags |= 2
      nodeArray.encode(state, m.treeNodes)
    }
    if (m.treeUpgrade) {
      flags |= 4
      treeUpgrade.encode(state, m.treeUpgrade)
    }
    if (m.bitfield) {
      flags |= 8
      bitfieldUpdate.encode(state, m.bitfield)
    }

    state.buffer[s] = flags
  },
  decode (state) {
    const flags = c.uint.decode(state)
    return {
      userData: (flags & 1) !== 0 ? keyValue.decode(state) : null,
      treeNodes: (flags & 2) !== 0 ? nodeArray.decode(state) : null,
      treeUpgrade: (flags & 4) !== 0 ? treeUpgrade.decode(state) : null,
      bitfield: (flags & 8) !== 0 ? bitfieldUpdate.decode(state) : null
    }
  }
}

const keyPair = {
  preencode (state, kp) {
    c.buffer.preencode(state, kp.publicKey)
    c.buffer.preencode(state, kp.secretKey)
  },
  encode (state, kp) {
    c.buffer.encode(state, kp.publicKey)
    c.buffer.encode(state, kp.secretKey)
  },
  decode (state) {
    return {
      publicKey: c.buffer.decode(state),
      secretKey: c.buffer.decode(state)
    }
  }
}

const reorgHint = {
  preencode (state, r) {
    c.uint.preencode(state, r.from)
    c.uint.preencode(state, r.to)
    c.uint.preencode(state, r.ancestors)
  },
  encode (state, r) {
    c.uint.encode(state, r.from)
    c.uint.encode(state, r.to)
    c.uint.encode(state, r.ancestors)
  },
  decode (state) {
    return {
      from: c.uint.decode(state),
      to: c.uint.decode(state),
      ancestors: c.uint.decode(state)
    }
  }
}

const reorgHintArray = c.array(reorgHint)

const hints = {
  preencode (state, h) {
    reorgHintArray.preencode(state, h.reorgs)
    c.uint.preencode(state, h.contiguousLength)
  },
  encode (state, h) {
    reorgHintArray.encode(state, h.reorgs)
    c.uint.encode(state, h.contiguousLength)
  },
  decode (state) {
    return {
      reorgs: reorgHintArray.decode(state),
      contiguousLength: state.start < state.end ? c.uint.decode(state) : 0
    }
  }
}

const treeHeader = {
  preencode (state, t) {
    c.uint.preencode(state, t.fork)
    c.uint.preencode(state, t.length)
    c.buffer.preencode(state, t.rootHash)
    c.buffer.preencode(state, t.signature)
  },
  encode (state, t) {
    c.uint.encode(state, t.fork)
    c.uint.encode(state, t.length)
    c.buffer.encode(state, t.rootHash)
    c.buffer.encode(state, t.signature)
  },
  decode (state) {
    return {
      fork: c.uint.decode(state),
      length: c.uint.decode(state),
      rootHash: c.buffer.decode(state),
      signature: c.buffer.decode(state)
    }
  }
}

const types = {
  preencode (state, t) {
    c.string.preencode(state, t.tree)
    c.string.preencode(state, t.bitfield)
    c.string.preencode(state, t.signer)
  },
  encode (state, t) {
    c.string.encode(state, t.tree)
    c.string.encode(state, t.bitfield)
    c.string.encode(state, t.signer)
  },
  decode (state) {
    return {
      tree: c.string.decode(state),
      bitfield: c.string.decode(state),
      signer: c.string.decode(state)
    }
  }
}

const externalHeader = {
  preencode (state, m) {
    c.uint.preencode(state, m.start)
    c.uint.preencode(state, m.length)
  },
  encode (state, m) {
    c.uint.encode(state, m.start)
    c.uint.encode(state, m.length)
  },
  decode (state) {
    return {
      start: c.uint.decode(state),
      length: c.uint.decode(state)
    }
  }
}

const keyValueArray = c.array(keyValue)

oplog.header = {
  preencode (state, h) {
    state.end += 2 // version + flags
    if (h.external) {
      externalHeader.preencode(state, h.external)
      return
    }
    c.fixed32.preencode(state, h.key)
    if (h.manifest) manifest.preencode(state, h.manifest)
    if (h.keyPair) keyPair.preencode(state, h.keyPair)
    keyValueArray.preencode(state, h.userData)
    treeHeader.preencode(state, h.tree)
    hints.preencode(state, h.hints)
  },
  encode (state, h) {
    c.uint.encode(state, 1)
    if (h.external) {
      c.uint.encode(state, 1) // ONLY set the first big for clarity
      externalHeader.encode(state, h.external)
      return
    }
    c.uint.encode(state, (h.manifest ? 2 : 0) | (h.keyPair ? 4 : 0))
    c.fixed32.encode(state, h.key)
    if (h.manifest) manifest.encode(state, h.manifest)
    if (h.keyPair) keyPair.encode(state, h.keyPair)
    keyValueArray.encode(state, h.userData)
    treeHeader.encode(state, h.tree)
    hints.encode(state, h.hints)
  },
  decode (state) {
    const version = c.uint.decode(state)

    if (version > 1) {
      throw new Error('Invalid header version. Expected <= 1, got ' + version)
    }

    if (version === 0) {
      const old = {
        types: types.decode(state),
        userData: keyValueArray.decode(state),
        tree: treeHeader.decode(state),
        signer: keyPair.decode(state),
        hints: hints.decode(state)
      }

      return {
        external: null,
        key: old.signer.publicKey,
        manifest: {
          version: 0,
          hash: old.types.tree,
          allowPatch: false,
          quorum: 1,
          signers: [{
            signature: old.types.signer,
            namespace: DEFAULT_NAMESPACE,
            publicKey: old.signer.publicKey
          }],
          prologue: null
        },
        keyPair: old.signer.secretKey ? old.signer : null,
        userData: old.userData,
        tree: old.tree,
        hints: old.hints
      }
    }

    const flags = c.uint.decode(state)

    if (flags & 1) {
      return {
        external: externalHeader.decode(state),
        key: null,
        manifest: null,
        keyPair: null,
        userData: null,
        tree: null,
        hints: null
      }
    }

    return {
      external: null,
      key: c.fixed32.decode(state),
      manifest: (flags & 2) !== 0 ? manifest.decode(state) : null,
      keyPair: (flags & 4) !== 0 ? keyPair.decode(state) : null,
      userData: keyValueArray.decode(state),
      tree: treeHeader.decode(state),
      hints: hints.decode(state)
    }
  }
}

const uintArray = c.array(c.uint)

const multisigInput = {
  preencode (state, inp) {
    c.uint.preencode(state, inp.signer)
    c.fixed64.preencode(state, inp.signature)
    c.uint.preencode(state, inp.patch)
  },
  encode (state, inp) {
    c.uint.encode(state, inp.signer)
    c.fixed64.encode(state, inp.signature)
    c.uint.encode(state, inp.patch)
  },
  decode (state) {
    return {
      signer: c.uint.decode(state),
      signature: c.fixed64.decode(state),
      patch: c.uint.decode(state)
    }
  }
}

const patchEncodingv0 = {
  preencode (state, n) {
    c.uint.preencode(state, n.start)
    c.uint.preencode(state, n.length)
    uintArray.preencode(state, n.nodes)
  },
  encode (state, n) {
    c.uint.encode(state, n.start)
    c.uint.encode(state, n.length)
    uintArray.encode(state, n.nodes)
  },
  decode (state) {
    return {
      start: c.uint.decode(state),
      length: c.uint.decode(state),
      nodes: uintArray.decode(state)
    }
  }
}

const multisigInputv0 = {
  preencode (state, n) {
    state.end++
    c.uint.preencode(state, n.signer)
    c.fixed64.preencode(state, n.signature)
    if (n.patch) patchEncodingv0.preencode(state, n.patch)
  },
  encode (state, n) {
    c.uint.encode(state, n.patch ? 1 : 0)
    c.uint.encode(state, n.signer)
    c.fixed64.encode(state, n.signature)
    if (n.patch) patchEncodingv0.encode(state, n.patch)
  },
  decode (state) {
    const flags = c.uint.decode(state)
    return {
      signer: c.uint.decode(state),
      signature: c.fixed64.decode(state),
      patch: (flags & 1) ? patchEncodingv0.decode(state) : null
    }
  }
}

const multisigInputArrayv0 = c.array(multisigInputv0)
const multisigInputArray = c.array(multisigInput)

const compactNode = {
  preencode (state, n) {
    c.uint.preencode(state, n.index)
    c.uint.preencode(state, n.size)
    c.fixed32.preencode(state, n.hash)
  },
  encode (state, n) {
    c.uint.encode(state, n.index)
    c.uint.encode(state, n.size)
    c.fixed32.encode(state, n.hash)
  },
  decode (state) {
    return {
      index: c.uint.decode(state),
      size: c.uint.decode(state),
      hash: c.fixed32.decode(state)
    }
  }
}

const compactNodeArray = c.array(compactNode)

exports.multiSignaturev0 = {
  preencode (state, s) {
    multisigInputArrayv0.preencode(state, s.proofs)
    compactNodeArray.preencode(state, s.patch)
  },
  encode (state, s) {
    multisigInputArrayv0.encode(state, s.proofs)
    compactNodeArray.encode(state, s.patch)
  },
  decode (state) {
    return {
      proofs: multisigInputArrayv0.decode(state),
      patch: compactNodeArray.decode(state)
    }
  }
}

exports.multiSignature = {
  preencode (state, s) {
    multisigInputArray.preencode(state, s.proofs)
    compactNodeArray.preencode(state, s.patch)
  },
  encode (state, s) {
    multisigInputArray.encode(state, s.proofs)
    compactNodeArray.encode(state, s.patch)
  },
  decode (state) {
    return {
      proofs: multisigInputArray.decode(state),
      patch: compactNodeArray.decode(state)
    }
  }
}
````

## File: spec/hyperschema/index.js
````javascript
// This file is autogenerated by the hyperschema compiler
// Schema Version: 1
/* eslint-disable camelcase */
/* eslint-disable quotes */

const VERSION = 1
const { c } = require('hyperschema/runtime')

// eslint-disable-next-line no-unused-vars
let version = VERSION

// @corestore/allocated
const encoding0 = {
  preencode (state, m) {
    c.uint.preencode(state, m.cores)
    c.uint.preencode(state, m.datas)
  },
  encode (state, m) {
    c.uint.encode(state, m.cores)
    c.uint.encode(state, m.datas)
  },
  decode (state) {
    const r0 = c.uint.decode(state)
    const r1 = c.uint.decode(state)

    return {
      cores: r0,
      datas: r1
    }
  }
}

// @corestore/head
const encoding1 = {
  preencode (state, m) {
    c.uint.preencode(state, m.version)
    state.end++ // max flag is 4 so always one byte

    if (m.allocated) encoding0.preencode(state, m.allocated)
    if (m.seed) c.fixed32.preencode(state, m.seed)
    if (m.defaultDiscoveryKey) c.fixed32.preencode(state, m.defaultDiscoveryKey)
  },
  encode (state, m) {
    const flags =
      (m.allocated ? 1 : 0) |
      (m.seed ? 2 : 0) |
      (m.defaultDiscoveryKey ? 4 : 0)

    c.uint.encode(state, m.version)
    c.uint.encode(state, flags)

    if (m.allocated) encoding0.encode(state, m.allocated)
    if (m.seed) c.fixed32.encode(state, m.seed)
    if (m.defaultDiscoveryKey) c.fixed32.encode(state, m.defaultDiscoveryKey)
  },
  decode (state) {
    const r0 = c.uint.decode(state)
    const flags = c.uint.decode(state)

    return {
      version: r0,
      allocated: (flags & 1) !== 0 ? encoding0.decode(state) : null,
      seed: (flags & 2) !== 0 ? c.fixed32.decode(state) : null,
      defaultDiscoveryKey: (flags & 4) !== 0 ? c.fixed32.decode(state) : null
    }
  }
}

// @corestore/alias
const encoding2 = {
  preencode (state, m) {
    c.string.preencode(state, m.name)
    c.fixed32.preencode(state, m.namespace)
  },
  encode (state, m) {
    c.string.encode(state, m.name)
    c.fixed32.encode(state, m.namespace)
  },
  decode (state) {
    const r0 = c.string.decode(state)
    const r1 = c.fixed32.decode(state)

    return {
      name: r0,
      namespace: r1
    }
  }
}

// @corestore/core
const encoding3 = {
  preencode (state, m) {
    c.uint.preencode(state, m.version)
    c.uint.preencode(state, m.corePointer)
    c.uint.preencode(state, m.dataPointer)
    state.end++ // max flag is 1 so always one byte

    if (m.alias) encoding2.preencode(state, m.alias)
  },
  encode (state, m) {
    const flags = m.alias ? 1 : 0

    c.uint.encode(state, m.version)
    c.uint.encode(state, m.corePointer)
    c.uint.encode(state, m.dataPointer)
    c.uint.encode(state, flags)

    if (m.alias) encoding2.encode(state, m.alias)
  },
  decode (state) {
    const r0 = c.uint.decode(state)
    const r1 = c.uint.decode(state)
    const r2 = c.uint.decode(state)
    const flags = c.uint.decode(state)

    return {
      version: r0,
      corePointer: r1,
      dataPointer: r2,
      alias: (flags & 1) !== 0 ? encoding2.decode(state) : null
    }
  }
}

const encoding4_enum = {
  blake2b: 'blake2b'
}

// @core/hashes enum
const encoding4 = {
  preencode (state, m) {
    state.end++ // max enum is 0 so always one byte
  },
  encode (state, m) {
    switch (m) {
      case 'blake2b':
        c.uint.encode(state, 0)
        break
      default: throw new Error('Unknown enum')
    }
  },
  decode (state) {
    switch (c.uint.decode(state)) {
      case 0: return 'blake2b'
      default: return null
    }
  }
}

const encoding5_enum = {
  ed25519: 'ed25519'
}

// @core/signatures enum
const encoding5 = {
  preencode (state, m) {
    state.end++ // max enum is 0 so always one byte
  },
  encode (state, m) {
    switch (m) {
      case 'ed25519':
        c.uint.encode(state, 0)
        break
      default: throw new Error('Unknown enum')
    }
  },
  decode (state) {
    switch (c.uint.decode(state)) {
      case 0: return 'ed25519'
      default: return null
    }
  }
}

// @core/tree-node
const encoding6 = {
  preencode (state, m) {
    c.uint.preencode(state, m.index)
    c.uint.preencode(state, m.size)
    c.fixed32.preencode(state, m.hash)
  },
  encode (state, m) {
    c.uint.encode(state, m.index)
    c.uint.encode(state, m.size)
    c.fixed32.encode(state, m.hash)
  },
  decode (state) {
    const r0 = c.uint.decode(state)
    const r1 = c.uint.decode(state)
    const r2 = c.fixed32.decode(state)

    return {
      index: r0,
      size: r1,
      hash: r2
    }
  }
}

// @core/signer
const encoding7 = {
  preencode (state, m) {
    encoding5.preencode(state, m.signature)
    c.fixed32.preencode(state, m.namespace)
    c.fixed32.preencode(state, m.publicKey)
  },
  encode (state, m) {
    encoding5.encode(state, m.signature)
    c.fixed32.encode(state, m.namespace)
    c.fixed32.encode(state, m.publicKey)
  },
  decode (state) {
    const r0 = encoding5.decode(state)
    const r1 = c.fixed32.decode(state)
    const r2 = c.fixed32.decode(state)

    return {
      signature: r0,
      namespace: r1,
      publicKey: r2
    }
  }
}

// @core/prologue
const encoding8 = {
  preencode (state, m) {
    c.fixed32.preencode(state, m.hash)
    c.uint.preencode(state, m.length)
  },
  encode (state, m) {
    c.fixed32.encode(state, m.hash)
    c.uint.encode(state, m.length)
  },
  decode (state) {
    const r0 = c.fixed32.decode(state)
    const r1 = c.uint.decode(state)

    return {
      hash: r0,
      length: r1
    }
  }
}

// @core/manifest.signers
const encoding9_4 = c.array(encoding7)
// @core/manifest.linked
const encoding9_6 = c.array(c.fixed32)

// @core/manifest
const encoding9 = {
  preencode (state, m) {
    c.uint.preencode(state, m.version)
    state.end++ // max flag is 4 so always one byte
    encoding4.preencode(state, m.hash)
    c.uint.preencode(state, m.quorum)
    encoding9_4.preencode(state, m.signers)

    if (m.prologue) encoding8.preencode(state, m.prologue)
    if (m.linked) encoding9_6.preencode(state, m.linked)
  },
  encode (state, m) {
    const flags =
      (m.allowPatch ? 1 : 0) |
      (m.prologue ? 2 : 0) |
      (m.linked ? 4 : 0)

    c.uint.encode(state, m.version)
    c.uint.encode(state, flags)
    encoding4.encode(state, m.hash)
    c.uint.encode(state, m.quorum)
    encoding9_4.encode(state, m.signers)

    if (m.prologue) encoding8.encode(state, m.prologue)
    if (m.linked) encoding9_6.encode(state, m.linked)
  },
  decode (state) {
    const r0 = c.uint.decode(state)
    const flags = c.uint.decode(state)

    return {
      version: r0,
      hash: encoding4.decode(state),
      quorum: c.uint.decode(state),
      allowPatch: (flags & 1) !== 0,
      signers: encoding9_4.decode(state),
      prologue: (flags & 2) !== 0 ? encoding8.decode(state) : null,
      linked: (flags & 4) !== 0 ? encoding9_6.decode(state) : null
    }
  }
}

// @core/keyPair
const encoding10 = {
  preencode (state, m) {
    c.buffer.preencode(state, m.publicKey)
    c.buffer.preencode(state, m.secretKey)
  },
  encode (state, m) {
    c.buffer.encode(state, m.publicKey)
    c.buffer.encode(state, m.secretKey)
  },
  decode (state) {
    const r0 = c.buffer.decode(state)
    const r1 = c.buffer.decode(state)

    return {
      publicKey: r0,
      secretKey: r1
    }
  }
}

// @core/auth.manifest
const encoding11_2 = c.frame(encoding9)

// @core/auth
const encoding11 = {
  preencode (state, m) {
    c.fixed32.preencode(state, m.key)
    c.fixed32.preencode(state, m.discoveryKey)
    state.end++ // max flag is 4 so always one byte

    if (m.manifest) encoding11_2.preencode(state, m.manifest)
    if (m.keyPair) encoding10.preencode(state, m.keyPair)
    if (m.encryptionKey) c.buffer.preencode(state, m.encryptionKey)
  },
  encode (state, m) {
    const flags =
      (m.manifest ? 1 : 0) |
      (m.keyPair ? 2 : 0) |
      (m.encryptionKey ? 4 : 0)

    c.fixed32.encode(state, m.key)
    c.fixed32.encode(state, m.discoveryKey)
    c.uint.encode(state, flags)

    if (m.manifest) encoding11_2.encode(state, m.manifest)
    if (m.keyPair) encoding10.encode(state, m.keyPair)
    if (m.encryptionKey) c.buffer.encode(state, m.encryptionKey)
  },
  decode (state) {
    const r0 = c.fixed32.decode(state)
    const r1 = c.fixed32.decode(state)
    const flags = c.uint.decode(state)

    return {
      key: r0,
      discoveryKey: r1,
      manifest: (flags & 1) !== 0 ? encoding11_2.decode(state) : null,
      keyPair: (flags & 2) !== 0 ? encoding10.decode(state) : null,
      encryptionKey: (flags & 4) !== 0 ? c.buffer.decode(state) : null
    }
  }
}

// @core/head
const encoding12 = {
  preencode (state, m) {
    c.uint.preencode(state, m.fork)
    c.uint.preencode(state, m.length)
    c.fixed32.preencode(state, m.rootHash)
    c.buffer.preencode(state, m.signature)
  },
  encode (state, m) {
    c.uint.encode(state, m.fork)
    c.uint.encode(state, m.length)
    c.fixed32.encode(state, m.rootHash)
    c.buffer.encode(state, m.signature)
  },
  decode (state) {
    const r0 = c.uint.decode(state)
    const r1 = c.uint.decode(state)
    const r2 = c.fixed32.decode(state)
    const r3 = c.buffer.decode(state)

    return {
      fork: r0,
      length: r1,
      rootHash: r2,
      signature: r3
    }
  }
}

// @core/hints
const encoding13 = {
  preencode (state, m) {
    state.end++ // max flag is 1 so always one byte

    if (m.contiguousLength) c.uint.preencode(state, m.contiguousLength)
  },
  encode (state, m) {
    const flags = m.contiguousLength ? 1 : 0

    c.uint.encode(state, flags)

    if (m.contiguousLength) c.uint.encode(state, m.contiguousLength)
  },
  decode (state) {
    const flags = c.uint.decode(state)

    return {
      contiguousLength: (flags & 1) !== 0 ? c.uint.decode(state) : 0
    }
  }
}

// @core/session
const encoding14 = {
  preencode (state, m) {
    c.string.preencode(state, m.name)
    c.uint.preencode(state, m.dataPointer)
  },
  encode (state, m) {
    c.string.encode(state, m.name)
    c.uint.encode(state, m.dataPointer)
  },
  decode (state) {
    const r0 = c.string.decode(state)
    const r1 = c.uint.decode(state)

    return {
      name: r0,
      dataPointer: r1
    }
  }
}

// @core/sessions
const encoding15 = c.array(encoding14)

// @core/dependency
const encoding16 = {
  preencode (state, m) {
    c.uint.preencode(state, m.dataPointer)
    c.uint.preencode(state, m.length)
  },
  encode (state, m) {
    c.uint.encode(state, m.dataPointer)
    c.uint.encode(state, m.length)
  },
  decode (state) {
    const r0 = c.uint.decode(state)
    const r1 = c.uint.decode(state)

    return {
      dataPointer: r0,
      length: r1
    }
  }
}

function setVersion (v) {
  version = v
}

function encode (name, value, v = VERSION) {
  version = v
  return c.encode(getEncoding(name), value)
}

function decode (name, buffer, v = VERSION) {
  version = v
  return c.decode(getEncoding(name), buffer)
}

function getEnum (name) {
  switch (name) {
    case '@core/hashes': return encoding4_enum
    case '@core/signatures': return encoding5_enum
    default: throw new Error('Enum not found ' + name)
  }
}

function getEncoding (name) {
  switch (name) {
    case '@corestore/allocated': return encoding0
    case '@corestore/head': return encoding1
    case '@corestore/alias': return encoding2
    case '@corestore/core': return encoding3
    case '@core/hashes': return encoding4
    case '@core/signatures': return encoding5
    case '@core/tree-node': return encoding6
    case '@core/signer': return encoding7
    case '@core/prologue': return encoding8
    case '@core/manifest': return encoding9
    case '@core/keyPair': return encoding10
    case '@core/auth': return encoding11
    case '@core/head': return encoding12
    case '@core/hints': return encoding13
    case '@core/session': return encoding14
    case '@core/sessions': return encoding15
    case '@core/dependency': return encoding16
    default: throw new Error('Encoder not found ' + name)
  }
}

function getStruct (name, v = VERSION) {
  const enc = getEncoding(name)
  return {
    preencode (state, m) {
      version = v
      enc.preencode(state, m)
    },
    encode (state, m) {
      version = v
      enc.encode(state, m)
    },
    decode (state) {
      version = v
      return enc.decode(state)
    }
  }
}

const resolveStruct = getStruct // compat

module.exports = { resolveStruct, getStruct, getEnum, getEncoding, encode, decode, setVersion, version }
````

## File: spec/hyperschema/schema.json
````json
{
  "version": 1,
  "schema": [
    {
      "name": "allocated",
      "namespace": "corestore",
      "compact": true,
      "flagsPosition": -1,
      "fields": [
        {
          "name": "cores",
          "required": true,
          "type": "uint",
          "version": 1
        },
        {
          "name": "datas",
          "required": true,
          "type": "uint",
          "version": 1
        }
      ]
    },
    {
      "name": "head",
      "namespace": "corestore",
      "compact": false,
      "flagsPosition": 1,
      "fields": [
        {
          "name": "version",
          "required": true,
          "type": "uint",
          "version": 1
        },
        {
          "name": "allocated",
          "type": "@corestore/allocated",
          "version": 1
        },
        {
          "name": "seed",
          "type": "fixed32",
          "version": 1
        },
        {
          "name": "defaultDiscoveryKey",
          "type": "fixed32",
          "version": 1
        }
      ]
    },
    {
      "name": "alias",
      "namespace": "corestore",
      "compact": true,
      "flagsPosition": -1,
      "fields": [
        {
          "name": "name",
          "required": true,
          "type": "string",
          "version": 1
        },
        {
          "name": "namespace",
          "required": true,
          "type": "fixed32",
          "version": 1
        }
      ]
    },
    {
      "name": "core",
      "namespace": "corestore",
      "compact": false,
      "flagsPosition": 3,
      "fields": [
        {
          "name": "version",
          "required": true,
          "type": "uint",
          "version": 1
        },
        {
          "name": "corePointer",
          "required": true,
          "type": "uint",
          "version": 1
        },
        {
          "name": "dataPointer",
          "required": true,
          "type": "uint",
          "version": 1
        },
        {
          "name": "alias",
          "type": "@corestore/alias",
          "version": 1
        }
      ]
    },
    {
      "name": "hashes",
      "namespace": "core",
      "offset": 0,
      "enum": [
        {
          "key": "blake2b",
          "version": 1
        }
      ]
    },
    {
      "name": "signatures",
      "namespace": "core",
      "offset": 0,
      "enum": [
        {
          "key": "ed25519",
          "version": 1
        }
      ]
    },
    {
      "name": "tree-node",
      "namespace": "core",
      "compact": true,
      "flagsPosition": -1,
      "fields": [
        {
          "name": "index",
          "required": true,
          "type": "uint",
          "version": 1
        },
        {
          "name": "size",
          "required": true,
          "type": "uint",
          "version": 1
        },
        {
          "name": "hash",
          "required": true,
          "type": "fixed32",
          "version": 1
        }
      ]
    },
    {
      "name": "signer",
      "namespace": "core",
      "compact": true,
      "flagsPosition": -1,
      "fields": [
        {
          "name": "signature",
          "required": true,
          "type": "@core/signatures",
          "version": 1
        },
        {
          "name": "namespace",
          "required": true,
          "type": "fixed32",
          "version": 1
        },
        {
          "name": "publicKey",
          "required": true,
          "type": "fixed32",
          "version": 1
        }
      ]
    },
    {
      "name": "prologue",
      "namespace": "core",
      "compact": true,
      "flagsPosition": -1,
      "fields": [
        {
          "name": "hash",
          "required": true,
          "type": "fixed32",
          "version": 1
        },
        {
          "name": "length",
          "required": true,
          "type": "uint",
          "version": 1
        }
      ]
    },
    {
      "name": "manifest",
      "namespace": "core",
      "compact": false,
      "flagsPosition": 1,
      "fields": [
        {
          "name": "version",
          "required": true,
          "type": "uint",
          "version": 1
        },
        {
          "name": "hash",
          "required": true,
          "type": "@core/hashes",
          "version": 1
        },
        {
          "name": "quorum",
          "required": true,
          "type": "uint",
          "version": 1
        },
        {
          "name": "allowPatch",
          "type": "bool",
          "version": 1
        },
        {
          "name": "signers",
          "required": true,
          "array": true,
          "type": "@core/signer",
          "version": 1
        },
        {
          "name": "prologue",
          "type": "@core/prologue",
          "version": 1
        },
        {
          "name": "linked",
          "array": true,
          "type": "fixed32",
          "version": 1
        }
      ]
    },
    {
      "name": "keyPair",
      "namespace": "core",
      "compact": true,
      "flagsPosition": -1,
      "fields": [
        {
          "name": "publicKey",
          "required": true,
          "type": "buffer",
          "version": 1
        },
        {
          "name": "secretKey",
          "required": true,
          "type": "buffer",
          "version": 1
        }
      ]
    },
    {
      "name": "auth",
      "namespace": "core",
      "compact": false,
      "flagsPosition": 2,
      "fields": [
        {
          "name": "key",
          "required": true,
          "type": "fixed32",
          "version": 1
        },
        {
          "name": "discoveryKey",
          "required": true,
          "type": "fixed32",
          "version": 1
        },
        {
          "name": "manifest",
          "type": "@core/manifest",
          "version": 1
        },
        {
          "name": "keyPair",
          "type": "@core/keyPair",
          "version": 1
        },
        {
          "name": "encryptionKey",
          "type": "buffer",
          "version": 1
        }
      ]
    },
    {
      "name": "head",
      "namespace": "core",
      "compact": false,
      "flagsPosition": -1,
      "fields": [
        {
          "name": "fork",
          "required": true,
          "type": "uint",
          "version": 1
        },
        {
          "name": "length",
          "required": true,
          "type": "uint",
          "version": 1
        },
        {
          "name": "rootHash",
          "required": true,
          "type": "fixed32",
          "version": 1
        },
        {
          "name": "signature",
          "required": true,
          "type": "buffer",
          "version": 1
        }
      ]
    },
    {
      "name": "hints",
      "namespace": "core",
      "compact": false,
      "flagsPosition": 0,
      "fields": [
        {
          "name": "contiguousLength",
          "type": "uint",
          "version": 1
        }
      ]
    },
    {
      "name": "session",
      "namespace": "core",
      "compact": true,
      "flagsPosition": -1,
      "fields": [
        {
          "name": "name",
          "required": true,
          "type": "string",
          "version": 1
        },
        {
          "name": "dataPointer",
          "required": true,
          "type": "uint",
          "version": 1
        }
      ]
    },
    {
      "name": "sessions",
      "namespace": "core",
      "array": true,
      "type": "@core/session"
    },
    {
      "name": "dependency",
      "namespace": "core",
      "compact": true,
      "flagsPosition": -1,
      "fields": [
        {
          "name": "dataPointer",
          "required": true,
          "type": "uint",
          "version": 1
        },
        {
          "name": "length",
          "required": true,
          "type": "uint",
          "version": 1
        }
      ]
    }
  ]
}
````

## File: test/helpers/index.js
````javascript
const b4a = require('b4a')
const tmp = require('test-tmp')
const Storage = require('../../')

module.exports = {
  createCore,
  create,
  toArray,
  writeBlocks,
  readBlocks,
  readTreeNodes,
  getAuth,
  getHead,
  getDependency,
  getHints,
  getUserData,
  getBitfieldPages
}

async function createCore (t) {
  const s = await create(t)
  const core = await s.create({ key: b4a.alloc(32), discoveryKey: b4a.alloc(32) })

  t.teardown(async function () {
    await core.close()
    await s.close()
  })

  return core
}

async function create (t) {
  return new Storage(await tmp(t))
}

async function toArray (stream) {
  const all = []
  for await (const data of stream) all.push(data)
  return all
}

async function writeBlocks (core, amount, { start = 0, pre = '' } = {}) {
  const tx = core.write()
  for (let i = start; i < amount + start; i++) {
    const content = b4a.from(`${pre}block${i}`)
    tx.putBlock(i, content)
  }
  await tx.flush()
}

async function readBlocks (core, nr) {
  const rx = core.read()
  const proms = []
  for (let i = 0; i < nr; i++) proms.push(rx.getBlock(i))
  rx.tryFlush()
  return await Promise.all(proms)
}

async function readTreeNodes (core, nr) {
  const rx = core.read()
  const proms = []
  for (let i = 0; i < nr; i++) proms.push(rx.getTreeNode(i))
  rx.tryFlush()
  return await Promise.all(proms)
}

async function getAuth (core) {
  const rx = core.read()
  const p = rx.getAuth()
  rx.tryFlush()
  return await p
}

async function getHead (core) {
  const rx = core.read()
  const p = rx.getHead()
  rx.tryFlush()
  return await p
}

async function getDependency (core) {
  const rx = core.read()
  const p = rx.getDependency()
  rx.tryFlush()
  return await p
}

async function getHints (core) {
  const rx = core.read()
  const p = rx.getHints()
  rx.tryFlush()
  return await p
}

async function getUserData (core, key) {
  const rx = core.read()
  const p = rx.getUserData(key)
  rx.tryFlush()
  return await p
}

async function getBitfieldPages (core, nr) {
  const rx = core.read()
  const proms = []
  for (let i = 0; i < nr; i++) proms.push(rx.getBitfieldPage(i))
  rx.tryFlush()
  return await Promise.all(proms)
}
````

## File: test/all.js
````javascript
// This runner is auto-generated by Brittle

runTests()

async function runTests () {
  const test = (await import('brittle')).default

  test.pause()

  await import('./atomic.js')
  await import('./basic.js')
  await import('./core.js')
  await import('./snapshot.js')
  await import('./streams.js')

  test.resume()
}
````

## File: test/atomic.js
````javascript
const test = require('brittle')
const b4a = require('b4a')
const {
  createCore,
  writeBlocks,
  create,
  readBlocks,
  readTreeNodes,
  getAuth,
  getHead,
  getDependency,
  getHints,
  getUserData,
  getBitfieldPages
} = require('./helpers')

test('basic atomized flow with a single core', async (t) => {
  const core = await createCore(t)
  await writeBlocks(core, 2)

  const initBlocks = [b4a.from('block0'), b4a.from('block1')]
  t.alike(await readBlocks(core, 3), [...initBlocks, null], 'sanity check')

  const atom = core.createAtom()
  const atomCore = core.atomize(atom)

  await writeBlocks(atomCore, 1, { start: 2 })
  const expected = [...initBlocks, b4a.from('block2'), null]

  t.alike(await readBlocks(core, 4), [...initBlocks, null, null], 'not added to original core')
  t.alike(await readBlocks(atomCore, 4), expected, 'added to atomized core')

  await atom.flush()

  t.alike(await readBlocks(core, 4), expected, 'flushing adds to the original core')
  t.alike(await readBlocks(atomCore, 4), expected, 'added to atomized core')
})

test('write to original core while there is an atomized one', async (t) => {
  const core = await createCore(t)
  await writeBlocks(core, 2)
  const initBlocks = [b4a.from('block0'), b4a.from('block1')]

  const atom = core.createAtom()
  const atomCore = core.atomize(atom)

  await writeBlocks(core, 1, { start: 2 })
  const expected = [...initBlocks, b4a.from('block2'), null]

  t.alike(await readBlocks(core, 4), expected, 'added to original core')
  t.alike(await readBlocks(atomCore, 4), expected, 'added to atomized core')

  await atom.flush()

  t.alike(await readBlocks(core, 4), expected, 'flushed core')
  t.alike(await readBlocks(atomCore, 4), expected, 'flushed atom core')
})

test('first writes to a core are from an atom', async (t) => {
  const core = await createCore(t)

  const atom = core.createAtom()
  const atomCore = core.atomize(atom)

  await writeBlocks(atomCore, 1)

  const expected = [b4a.from('block0'), null]
  t.alike(await readBlocks(atomCore, 2), expected, 'added to atom core')
  t.alike(await readBlocks(core, 2), [null, null], 'not yet added to original')

  await atom.flush()

  t.alike(await readBlocks(core, 2), expected, 'added to original after flush')
})

test('atomized flow with write/delete operations on a single core', async (t) => {
  const core = await createCore(t)
  await writeBlocks(core, 3)

  const initBlocks = [0, 1, 2].map(i => b4a.from(`block${i}`))
  t.alike(await readBlocks(core, 4), [...initBlocks, null], 'sanity check')

  const atom = core.createAtom()
  const atomCore = core.atomize(atom)

  {
    const tx = atomCore.write()
    tx.deleteBlock(1)
    tx.deleteBlock(4) // doesn't exist yet
    await tx.flush()
  }
  await writeBlocks(atomCore, 3, { start: 3 })

  const expected = [
    b4a.from('block0'),
    null,
    b4a.from('block2'),
    b4a.from('block3'),
    b4a.from('block4'),
    b4a.from('block5'),
    null
  ]
  t.alike(await readBlocks(atomCore, 7), expected)
  t.alike(await readBlocks(core, 7), [...initBlocks, null, null, null, null], 'original not yet updated')

  await atom.flush()
  t.alike(await readBlocks(core, 7), expected)
})

test('atomized flow with all non-delete operations on a single core', async (t) => {
  const core = await createCore(t)
  await writeBlocks(core, 2)

  const atom = core.createAtom()
  const atomCore = core.atomize(atom)

  {
    await writeBlocks(atomCore, 2, { start: 2 })

    const tx = atomCore.write()
    tx.putTreeNode({
      index: 0,
      size: 1,
      hash: b4a.from('a'.repeat(64), 'hex')
    })
    tx.setAuth({
      key: b4a.alloc(32),
      discoveryKey: b4a.alloc(32),
      manifest: null,
      keyPair: null,
      encryptionKey: b4a.from('a'.repeat(64, 'hex'))
    })
    tx.setHead({
      fork: 1,
      length: 3,
      rootHash: b4a.from('a'.repeat(64), 'hex'),
      signature: b4a.from('b'.repeat(64), 'hex')
    })
    tx.setDependency({
      dataPointer: 1,
      length: 3
    })
    tx.setHints({
      contiguousLength: 1
    })
    tx.putUserData('key', b4a.from('value'))
    tx.putBitfieldPage(0, b4a.from('bitfield-data-1'))

    await tx.flush()
  }

  const expBlocks = [b4a.from('block0'), b4a.from('block1'), b4a.from('block2'), b4a.from('block3'), null]
  const expNodes = [
    {
      index: 0,
      size: 1,
      hash: b4a.from('a'.repeat(64), 'hex')
    },
    null
  ]
  const expAuth = {
    key: b4a.alloc(32),
    discoveryKey: b4a.alloc(32),
    manifest: null,
    keyPair: null,
    encryptionKey: b4a.from('a'.repeat(64, 'hex'))
  }
  const expHead = {
    fork: 1,
    length: 3,
    rootHash: b4a.from('a'.repeat(64), 'hex'),
    signature: b4a.from('b'.repeat(64), 'hex')
  }
  const expDependency = {
    dataPointer: 1,
    length: 3
  }
  const expHints = {
    contiguousLength: 1
  }
  const expBitfields = [b4a.from('bitfield-data-1'), null]

  t.alike(await readBlocks(atomCore, 5), expBlocks, 'blocks atom')
  t.alike(
    await readBlocks(core, 5),
    [b4a.from('block0'), b4a.from('block1'), null, null, null],
    'blocks orig pre flush'
  )

  t.alike(await readTreeNodes(atomCore, 2), expNodes, 'tree nodes atom')
  t.alike(await readTreeNodes(core, 2), [null, null], 'tree nodes orig pre flush')

  t.alike(await getAuth(atomCore), expAuth, 'auth atom')
  t.alike(
    await getAuth(core),
    {
      key: b4a.alloc(32),
      discoveryKey: b4a.alloc(32),
      manifest: null,
      keyPair: null,
      encryptionKey: null
    },
    'auth orig pre flush'
  )

  t.alike(await getHead(atomCore), expHead, 'head atom')
  t.alike(await getHead(core), null, 'head orig pre flush')

  t.alike(await getDependency(atomCore), expDependency, 'dependency atom')
  t.alike(await getDependency(core), null, 'dependency orig pre flush')

  t.alike(await getHints(atomCore), expHints, 'hints atom')
  t.alike(await getHints(core), null, 'hints orig pre flush')

  t.alike(await getUserData(atomCore, 'key'), b4a.from('value'), 'userdata atom')
  t.alike(await getUserData(core, 'key'), null, 'userdata orig pre flush')

  t.alike(await getBitfieldPages(atomCore, 2), expBitfields, 'bitfields atom')
  t.alike(await getBitfieldPages(core, 2), [null, null], 'bitfields orig pre flush')

  await atom.flush()
  t.alike(await readBlocks(core, 5), expBlocks, 'blocks orig post flush')
  t.alike(await readTreeNodes(core, 2), expNodes, 'tree nodes orig post flush')
  t.alike(await getAuth(core, 2), expAuth, 'auth orig post flush')
  t.alike(await getHead(core), expHead, 'head orig post flush')
  t.alike(await getDependency(core), expDependency, 'dependency orig post flush')
  t.alike(await getHints(core), expHints, 'hints orig post flush')
  t.alike(await getUserData(core, 'key'), b4a.from('value'), 'userdata orig post flush')
  t.alike(await getBitfieldPages(core, 2), expBitfields, 'bitfields orig post flush')
})

test('basic atomized flow with multiple cores', async (t) => {
  const storage = await create(t)
  t.teardown(async () => {
    await storage.close()
  }, 100000)

  const key0 = b4a.from('0'.repeat(64), 'hex')
  const key1 = b4a.from('1'.repeat(64), 'hex')
  const key2 = b4a.from('2'.repeat(64), 'hex')

  const cores = await Promise.all([
    storage.create({ key: key0, discoveryKey: key0 }),
    storage.create({ key: key1, discoveryKey: key1 }),
    storage.create({ key: key2, discoveryKey: key2 })
  ])
  const [core0, core1, core2] = cores
  t.teardown(async () => {
    await Promise.all(cores.map(c => c.close()))
  }, 1)

  await Promise.all([
    writeBlocks(core0, 2, { pre: 'c0-' }),
    writeBlocks(core1, 2, { pre: 'c1-' }),
    writeBlocks(core2, 2, { pre: 'c2-' })
  ])

  const initBlocks = [
    [b4a.from('c0-block0'), b4a.from('c0-block1'), null],
    [b4a.from('c1-block0'), b4a.from('c1-block1'), null],
    [b4a.from('c2-block0'), b4a.from('c2-block1'), null]
  ]

  const readAllBlocks = async (cores, length) => {
    return await Promise.all([
      readBlocks(cores[0], length),
      readBlocks(cores[1], length),
      readBlocks(cores[2], length)
    ])
  }
  t.alike(await readAllBlocks(cores, 3), initBlocks, 'sanity check')

  const atomStorage = storage.createAtom()
  const atomCores = [
    core0.atomize(atomStorage),
    core1.atomize(atomStorage),
    core2.atomize(atomStorage)
  ]

  await Promise.all([
    writeBlocks(atomCores[0], 2, { start: 2, pre: 'c0-' }),
    writeBlocks(atomCores[1], 2, { start: 2, pre: 'c1-' }),
    writeBlocks(atomCores[2], 2, { start: 2, pre: 'c2-' })
  ])

  const expBlocks = [
    [b4a.from('c0-block0'), b4a.from('c0-block1'), b4a.from('c0-block2'), b4a.from('c0-block3'), null],
    [b4a.from('c1-block0'), b4a.from('c1-block1'), b4a.from('c1-block2'), b4a.from('c1-block3'), null],
    [b4a.from('c2-block0'), b4a.from('c2-block1'), b4a.from('c2-block2'), b4a.from('c2-block3'), null]
  ]

  t.alike(await readAllBlocks(atomCores, 5), expBlocks, 'atom pre flush')
  t.alike(await readAllBlocks(cores, 3), initBlocks, 'cores pre flush')

  await atomStorage.flush()
  t.alike(await readAllBlocks(cores, 5), expBlocks, 'cores post flush')
})

test('conflicting writes to original core before an atomized write--atomized wins', async (t) => {
  const core = await createCore(t)
  await writeBlocks(core, 2)
  const initBlocks = [b4a.from('block0'), b4a.from('block1')]

  const atom = core.createAtom()
  const atomCore = core.atomize(atom)

  await writeBlocks(core, 2, { pre: 'orig-', start: 2 })
  await writeBlocks(atomCore, 1, { pre: 'atom-', start: 2 })

  const expected = [...initBlocks, b4a.from('atom-block2'), b4a.from('orig-block3'), null]

  t.alike(
    await readBlocks(core, 5),
    [...initBlocks, b4a.from('orig-block2'), b4a.from('orig-block3'), null],
    'no atom blocks in original core pre flush'
  )
  t.alike(
    await readBlocks(atomCore, 5),
    expected,
    'atomized core overrode the orig core change'
  )

  await atom.flush()

  t.alike(
    await readBlocks(core, 5),
    expected,
    'core equal to atom one after flush'
  )
})

test('conflicting writes to original core after an atomized write--atomized wins', async (t) => {
  const core = await createCore(t)
  await writeBlocks(core, 2)
  const initBlocks = [b4a.from('block0'), b4a.from('block1')]

  const atom = core.createAtom()
  const atomCore = core.atomize(atom)

  await writeBlocks(atomCore, 1, { pre: 'atom-', start: 2 })
  await writeBlocks(core, 2, { pre: 'orig-', start: 2 })

  const expected = [...initBlocks, b4a.from('atom-block2'), b4a.from('orig-block3'), null]

  t.alike(
    await readBlocks(core, 5),
    [...initBlocks, b4a.from('orig-block2'), b4a.from('orig-block3'), null],
    'no atom blocks in original core pre flush'
  )
  t.alike(
    await readBlocks(atomCore, 5),
    expected,
    'atomized core overrode the orig core change'
  )

  await atom.flush()

  t.alike(
    await readBlocks(core, 5),
    expected,
    'core equal to atom one after flush'
  )
})
````

## File: test/basic.js
````javascript
const test = require('brittle')
const b4a = require('b4a')
const { create } = require('./helpers')

test('make storage and core', async function (t) {
  const s = await create(t)

  t.is(await s.has(b4a.alloc(32)), false)
  t.is(await s.resume(b4a.alloc(32)), null)

  const c = await s.create({ key: b4a.alloc(32), discoveryKey: b4a.alloc(32) })

  t.is(await s.has(b4a.alloc(32)), true)

  await c.close()

  t.is(await s.has(b4a.alloc(32)), true)

  const r = await s.resume(b4a.alloc(32))

  t.ok(!!r)

  await r.close()
  await s.close()
})

test('make many in parallel', async function (t) {
  const s = await create(t)

  const all = []
  for (let i = 0; i < 50; i++) {
    const c = s.create({ key: b4a.alloc(32, i), discoveryKey: b4a.alloc(32, i) })
    all.push(c)
  }

  const cores = await Promise.all(all)
  const ptrs = new Set()

  for (const c of cores) {
    ptrs.add(c.core.corePointer)
  }

  // all unique allocations
  t.is(ptrs.size, cores.length)

  for (const c of cores) await c.close()

  await s.close()
})

test('first core created is the default core', async function (t) {
  const s = await create(t)

  t.is(await s.getDefaultDiscoveryKey(), null)
  const c = await s.create({ key: b4a.alloc(32), discoveryKey: b4a.alloc(32) })

  t.alike(await s.getDefaultDiscoveryKey(), b4a.alloc(32))

  const c1 = await s.create({ key: b4a.alloc(32, 1), discoveryKey: b4a.alloc(32, 1) })

  t.alike(await s.getDefaultDiscoveryKey(), b4a.alloc(32))

  await c.close()
  await c1.close()
  await s.close()
})

test('first core created is the default core', async function (t) {
  const s = await create(t)

  t.is(await s.getDefaultDiscoveryKey(), null)
  const c = await s.create({ key: b4a.alloc(32, 1), discoveryKey: b4a.alloc(32, 2) })

  t.alike(await s.getDefaultDiscoveryKey(), b4a.alloc(32, 2))
  t.alike(await s.getAuth(b4a.alloc(32, 3)), null)

  const auth = await s.getAuth(b4a.alloc(32, 2))

  t.alike(auth, {
    key: b4a.alloc(32, 1),
    discoveryKey: b4a.alloc(32, 2),
    manifest: null,
    keyPair: null,
    encryptionKey: null
  })

  await c.close()
  await s.close()
})

test('write during close', async function (t) {
  const s = await create(t)

  t.is(await s.getDefaultDiscoveryKey(), null)
  const c = await s.create({ key: b4a.alloc(32, 1), discoveryKey: b4a.alloc(32, 2) })

  const w = c.write()
  w.putUserData('test', b4a.alloc(1))
  const closing = c.close()
  try {
    await w.flush()
  } catch {
    t.pass('should fail')
  }
  await closing
  await s.close()
})
````

## File: test/core.js
````javascript
const test = require('brittle')
const b4a = require('b4a')
const { createCore, create, writeBlocks, readBlocks } = require('./helpers')

test('read and write hypercore blocks', async (t) => {
  const core = await createCore(t)
  await writeBlocks(core, 2)

  const rx = core.read()
  const proms = [rx.getBlock(0), rx.getBlock(1), rx.getBlock(2)]
  rx.tryFlush()
  const res = await Promise.all(proms)
  t.is(b4a.toString(res[0]), 'block0')
  t.is(b4a.toString(res[1]), 'block1')
  t.is(res[2], null)
})

test('read and write hypercore blocks across multiple cores', async (t) => {
  const storage = await create(t)
  const keys0 = {
    key: b4a.from('0'.repeat(64), 'hex'),
    discoveryKey: b4a.from('a'.repeat(64), 'hex')
  }
  const keys1 = {
    key: b4a.from('1'.repeat(64), 'hex'),
    discoveryKey: b4a.from('b'.repeat(64), 'hex')
  }
  const keys2 = {
    key: b4a.from('2'.repeat(64), 'hex'),
    discoveryKey: b4a.from('c'.repeat(64), 'hex')
  }

  const [core0, core1, core2] = await Promise.all([
    storage.create(keys0),
    storage.create(keys1),
    storage.create(keys2)
  ])

  await Promise.all([
    writeBlocks(core0, 2, { pre: 'core0-' }),
    writeBlocks(core1, 2, { pre: 'core1-' }),
    writeBlocks(core2, 2, { pre: 'core2-' })
  ])

  const rx0 = core0.read()
  const rx1 = core1.read()
  const rx2 = core2.read()
  const p = Promise.all([
    rx0.getBlock(0),
    rx0.getBlock(1),
    rx1.getBlock(0),
    rx1.getBlock(1),
    rx2.getBlock(0),
    rx2.getBlock(1)
  ])
  rx0.tryFlush()
  rx1.tryFlush()
  rx2.tryFlush()

  const [c0Block0, c0Block1, c1Block0, c1Block1, c2Block0, c2Block1] = await p
  t.is(b4a.toString(c0Block0), 'core0-block0')
  t.is(b4a.toString(c0Block1), 'core0-block1')
  t.is(b4a.toString(c1Block0), 'core1-block0')
  t.is(b4a.toString(c1Block1), 'core1-block1')
  t.is(b4a.toString(c2Block0), 'core2-block0')
  t.is(b4a.toString(c2Block1), 'core2-block1')

  await Promise.all([core0.close(), core1.close(), core2.close()])
  await storage.close()
})

test('delete hypercore block', async (t) => {
  const core = await createCore(t)
  await writeBlocks(core, 2)

  const tx = core.write()

  tx.deleteBlock(0)
  tx.deleteBlock(2) // doesn't exist
  await tx.flush()

  const rx = core.read()
  const p = Promise.all([rx.getBlock(0), rx.getBlock(1), rx.getBlock(2)])
  rx.tryFlush()
  const [res0, res1, res2] = await p
  t.is(res0, null)
  t.is(b4a.toString(res1), 'block1')
  t.is(res2, null)
})

test('delete hypercore block range', async (t) => {
  const core = await createCore(t)
  await writeBlocks(core, 4)

  const tx = core.write()

  tx.deleteBlockRange(1, 3)
  await tx.flush()

  const rx = core.read()
  const p = Promise.all([
    rx.getBlock(0),
    rx.getBlock(1),
    rx.getBlock(2),
    rx.getBlock(3)
  ])
  rx.tryFlush()
  const [res0, res1, res2, res3] = await p
  t.is(b4a.toString(res0), 'block0')
  t.is(res1, null)
  t.is(res2, null)
  t.is(b4a.toString(res3), 'block3')
})

test('put and get tree node', async (t) => {
  const core = await createCore(t)

  const node1 = {
    index: 0,
    size: 1,
    hash: b4a.from('a'.repeat(64), 'hex')
  }
  const node2 = {
    index: 1,
    size: 10,
    hash: b4a.from('b'.repeat(64), 'hex')
  }

  const tx = core.write()
  tx.putTreeNode(node1)
  tx.putTreeNode(node2)
  await tx.flush()

  const rx = core.read()
  const p = Promise.all([rx.getTreeNode(0), rx.getTreeNode(1), rx.getTreeNode(2)])
  rx.tryFlush()
  const [res0, res1, res2] = await p

  t.alike(res0, node1)
  t.alike(res1, node2)
  t.is(res2, null)
})

test('delete tree node', async (t) => {
  const core = await createCore(t)

  const node0 = {
    index: 0,
    size: 1,
    hash: b4a.from('a'.repeat(64), 'hex')
  }
  const node1 = {
    index: 1,
    size: 10,
    hash: b4a.from('b'.repeat(64), 'hex')
  }

  {
    const tx = core.write()
    tx.putTreeNode(node0)
    tx.putTreeNode(node1)
    await tx.flush()
  }

  {
    const tx = core.write()
    tx.deleteTreeNode(0)
    tx.deleteTreeNode(10) // Doesn't exist
    await tx.flush()
  }

  const rx = core.read()
  const p = Promise.all([rx.getTreeNode(0), rx.getTreeNode(1), rx.getTreeNode(2)])
  rx.tryFlush()
  const [res0, res1] = await p

  t.is(res0, null)
  t.alike(res1, node1)
})

test('delete tree node range', async (t) => {
  const core = await createCore(t)

  const node0 = {
    index: 0,
    size: 1,
    hash: b4a.from('a'.repeat(64), 'hex')
  }
  const node1 = {
    index: 1,
    size: 10,
    hash: b4a.from('b'.repeat(64), 'hex')
  }
  const node2 = {
    index: 2,
    size: 20,
    hash: b4a.from('c'.repeat(64), 'hex')
  }
  const node3 = {
    index: 3,
    size: 30,
    hash: b4a.from('d'.repeat(64), 'hex')
  }

  {
    const tx = core.write()
    tx.putTreeNode(node0)
    tx.putTreeNode(node1)
    tx.putTreeNode(node2)
    tx.putTreeNode(node3)
    await tx.flush()
  }

  {
    const tx = core.write()
    tx.deleteTreeNodeRange(1, 3)
    await tx.flush()
  }

  const rx = core.read()
  const p = Promise.all([rx.getTreeNode(0), rx.getTreeNode(1), rx.getTreeNode(2), rx.getTreeNode(3)])
  rx.tryFlush()
  const [res0, res1, res2, res3] = await p

  t.alike(res0, node0)
  t.is(res1, null)
  t.is(res2, null)
  t.alike(res3, node3)
})

test('set and get auth', async (t) => {
  const core = await createCore(t)

  {
    const rx = core.read()
    const p = rx.getAuth()
    rx.tryFlush()
    const initAuth = await p
    t.alike(
      initAuth,
      {
        key: b4a.alloc(32),
        discoveryKey: b4a.alloc(32),
        manifest: null,
        keyPair: null,
        encryptionKey: null
      },
      'fresh core auth'
    )
  }

  {
    const tx = core.write()
    tx.setAuth({
      key: b4a.alloc(32),
      discoveryKey: b4a.alloc(32),
      manifest: null,
      keyPair: null,
      encryptionKey: b4a.from('a'.repeat(64, 'hex'))
    })
    await tx.flush()
  }

  {
    const rx = core.read()
    const p = rx.getAuth()
    rx.tryFlush()
    t.alike(
      await p,
      {
        key: b4a.alloc(32),
        discoveryKey: b4a.alloc(32),
        manifest: null,
        keyPair: null,
        encryptionKey: b4a.from('a'.repeat(64, 'hex'))
      },
      'updated auth'
    )
  }
})

test('set and get hypercore sessions', async (t) => {
  const core = await createCore(t)
  {
    const rx = core.read()
    const p = rx.getSessions()
    rx.tryFlush()
    t.alike(await p, null, 'No sessions on init core')
  }

  {
    const tx = core.write()
    tx.setSessions([
      { name: 'session0', dataPointer: 0 },
      { name: 'session1', dataPointer: 1 }
    ])
    await tx.flush()
  }

  {
    const rx = core.read()
    const p = rx.getSessions()
    rx.tryFlush()
    t.alike(
      await p,
      [
        { name: 'session0', dataPointer: 0 },
        { name: 'session1', dataPointer: 1 }
      ]
    )
  }
})

test('set and get hypercore head', async (t) => {
  const core = await createCore(t)
  {
    const rx = core.read()
    const p = rx.getHead()
    rx.tryFlush()
    t.alike(await p, null, 'No head on init core')
  }

  {
    const tx = core.write()
    tx.setHead({
      fork: 1,
      length: 3,
      rootHash: b4a.from('a'.repeat(64), 'hex'),
      signature: b4a.from('b'.repeat(64), 'hex')
    })
    await tx.flush()
  }

  {
    const rx = core.read()
    const p = rx.getHead()
    rx.tryFlush()
    t.alike(
      await p,
      {
        fork: 1,
        length: 3,
        rootHash: b4a.from('a'.repeat(64), 'hex'),
        signature: b4a.from('b'.repeat(64), 'hex')
      },
      'updated head')
  }
})

test('set and get hypercore dependency', async (t) => {
  const core = await createCore(t)
  {
    const rx = core.read()
    const p = rx.getDependency()
    rx.tryFlush()
    t.alike(await p, null, 'No dependency on init core')
  }

  {
    const tx = core.write()
    tx.setDependency({
      dataPointer: 1,
      length: 3
    })
    await tx.flush()
  }

  {
    const rx = core.read()
    const p = rx.getDependency()
    rx.tryFlush()
    t.alike(
      await p,
      {
        dataPointer: 1,
        length: 3
      },
      'updated dependency')
  }
})

test('set and get hypercore hints', async (t) => {
  const core = await createCore(t)
  {
    const rx = core.read()
    const p = rx.getHints()
    rx.tryFlush()
    t.alike(await p, null, 'No hints on init core')
  }

  {
    const tx = core.write()
    tx.setHints({
      contiguousLength: 1
    })
    await tx.flush()
  }

  {
    const rx = core.read()
    const p = rx.getHints()
    rx.tryFlush()
    t.alike(
      await p,
      { contiguousLength: 1 },
      'updated hints')
  }
})

test('set and get hypercore userdata', async (t) => {
  const core = await createCore(t)
  {
    const rx = core.read()
    const p = rx.getUserData()
    rx.tryFlush()
    t.alike(await p, null, 'No userdata on init core')
  }

  {
    const tx = core.write()
    tx.putUserData('key', 'value')
    tx.putUserData('key2', 'value2')
    await tx.flush()
  }

  {
    const rx = core.read()
    const p = Promise.all([
      rx.getUserData('key'),
      rx.getUserData('key2'),
      rx.getUserData('no-key')
    ])
    rx.tryFlush()
    const [data1, data2, data3] = await p

    t.is(b4a.toString(data1), 'value')
    t.is(b4a.toString(data2), 'value2')
    t.is(data3, null)
  }
})

test('delete hypercore userdata', async (t) => {
  const core = await createCore(t)

  {
    const tx = core.write()
    tx.putUserData('key', 'value')
    tx.putUserData('key2', 'value2')
    await tx.flush()
  }

  {
    const rx = core.read()
    const p = Promise.all([
      rx.getUserData('key'),
      rx.getUserData('key2')
    ])
    rx.tryFlush()
    const [data1, data2] = await p

    t.is(b4a.toString(data1), 'value', 'sanity check')
    t.is(b4a.toString(data2), 'value2', 'sanity check')
  }

  {
    const tx = core.write()
    tx.deleteUserData('key')
    await tx.flush()
  }

  {
    const rx = core.read()
    const p = Promise.all([
      rx.getUserData('key'),
      rx.getUserData('key2')
    ])
    rx.tryFlush()
    const [data1, data2] = await p

    t.is(data1, null, 'deleted')
    t.is(b4a.toString(data2), 'value2')
  }
})

test('set and get bitfield page', async (t) => {
  const core = await createCore(t)

  {
    // Note: not sure these values are valid bitfield data
    // but the API seems to accept generic buffers
    const tx = core.write()
    tx.putBitfieldPage(0, 'bitfield-data-1')
    tx.putBitfieldPage(1, 'bitfield-data-2')
    await tx.flush()
  }

  {
    const rx = core.read()
    const p = Promise.all([
      rx.getBitfieldPage(0),
      rx.getBitfieldPage(1),
      rx.getBitfieldPage(2)
    ])
    rx.tryFlush()
    const [data1, data2, data3] = await p

    t.is(b4a.toString(data1), 'bitfield-data-1')
    t.is(b4a.toString(data2), 'bitfield-data-2')
    t.is(data3, null)
  }
})

test('delete bitfield page', async (t) => {
  const core = await createCore(t)

  {
    const tx = core.write()
    tx.putBitfieldPage(0, 'bitfield-data-1')
    tx.putBitfieldPage(1, 'bitfield-data-2')
    await tx.flush()
  }

  {
    const rx = core.read()
    const p = Promise.all([
      rx.getBitfieldPage(0),
      rx.getBitfieldPage(1)
    ])
    rx.tryFlush()
    const [data1, data2] = await p

    t.is(b4a.toString(data1), 'bitfield-data-1', 'sanity check')
    t.is(b4a.toString(data2), 'bitfield-data-2', 'sanity check')
  }

  {
    const tx = core.write()
    tx.deleteBitfieldPage(0)
    await tx.flush()
  }

  {
    const rx = core.read()
    const p = Promise.all([
      rx.getBitfieldPage(0),
      rx.getBitfieldPage(1)
    ])
    rx.tryFlush()
    const [data1, data2] = await p

    t.is(data1, null, 'deleted')
    t.is(b4a.toString(data2), 'bitfield-data-2', 'sanity check')
  }
})

test('delete bitfield page range', async (t) => {
  const core = await createCore(t)

  {
    const tx = core.write()
    tx.putBitfieldPage(0, 'bitfield-data-1')
    tx.putBitfieldPage(1, 'bitfield-data-2')
    tx.putBitfieldPage(2, 'bitfield-data-3')
    tx.putBitfieldPage(3, 'bitfield-data-4')
    await tx.flush()
  }

  {
    const rx = core.read()
    const p = Promise.all([
      rx.getBitfieldPage(0),
      rx.getBitfieldPage(1),
      rx.getBitfieldPage(2),
      rx.getBitfieldPage(3)
    ])
    rx.tryFlush()
    const [data1, data2, data3, data4] = await p

    t.is(b4a.toString(data1), 'bitfield-data-1', 'sanity check')
    t.is(b4a.toString(data2), 'bitfield-data-2', 'sanity check')
    t.is(b4a.toString(data3), 'bitfield-data-3', 'sanity check')
    t.is(b4a.toString(data4), 'bitfield-data-4', 'sanity check')
  }

  {
    const tx = core.write()
    tx.deleteBitfieldPageRange(1, 3)
    await tx.flush()
  }

  {
    const rx = core.read()
    const p = Promise.all([
      rx.getBitfieldPage(0),
      rx.getBitfieldPage(1),
      rx.getBitfieldPage(2),
      rx.getBitfieldPage(3)
    ])
    rx.tryFlush()
    const [data1, data2, data3, data4] = await p

    t.is(b4a.toString(data1), 'bitfield-data-1')
    t.is(data2, null)
    t.is(data3, null)
    t.is(b4a.toString(data4), 'bitfield-data-4')
  }
})

test('cannot open tx on snapshot', async (t) => {
  const core = await createCore(t)

  const snap = core.snapshot()
  t.exception(
    () => snap.write(),
    /Cannot open core tx on snapshot/
  )
})

test('cannot create sessions on snapshot', async (t) => {
  const core = await createCore(t)
  const snap = core.snapshot()

  await t.exception(
    async () => await snap.createSession(),
    /Cannot open core tx on snapshot/
  )
})

test('can resume a snapshot session, and that session is a snapshot too', async (t) => {
  const core = await createCore(t)
  await writeBlocks(core, 2)

  const snap = core.snapshot()
  const session = await core.createSession('sess', null)
  const sessionSnap = session.snapshot()

  t.is(session.snapshotted, false, 'sanity check')

  const initBlocks = [b4a.from('block0'), b4a.from('block1'), null]
  t.alike(await readBlocks(snap, 3), initBlocks, 'sanity check snap')
  t.alike(await readBlocks(session, 3), [null, null, null], 'sanity check session')
  t.alike(await readBlocks(sessionSnap, 3), [null, null, null], 'sanity check snap session')

  await writeBlocks(core, 1, { pre: 'core-', start: 2 })
  await writeBlocks(session, 1, { pre: 'sess-', start: 2 })
  t.alike(await readBlocks(session, 3), [null, null, b4a.from('sess-block2')], 'session updated (sanity check)')
  t.alike(await readBlocks(core, 3), [b4a.from('block0'), b4a.from('block1'), b4a.from('core-block2')], 'core updated (sanity check)')
  t.alike(await readBlocks(snap, 3), initBlocks, 'snap did not change (sanity check)')
  t.alike(await readBlocks(sessionSnap, 3), [null, null, null], 'post-session snap did not change (sanity check)')

  const resumedSnapSession = await sessionSnap.resumeSession('sess')
  const resumedSession = await core.resumeSession('sess')

  t.is(resumedSnapSession.snapshotted, true, 'resumed snapshot session is snapshot')
  t.is(resumedSession.snapshotted, false, 'resumed session is not snapshot')
  t.alike(await readBlocks(resumedSession, 3), [null, null, b4a.from('sess-block2')], 'resumed session changed like original session')
  t.alike(await readBlocks(resumedSnapSession, 3), [null, null, null], 'resumed snap session did not change')
})

test('create named sessions', async (t) => {
  const core = await createCore(t)

  const tx = core.write()

  tx.setHead({
    length: 10,
    fork: 0,
    rootHash: b4a.alloc(32),
    signature: null
  })

  await tx.flush()

  const a = await core.createSession('a', null)
  const b = await core.resumeSession('a')
  const c = await b.resumeSession('a')

  t.is(a.core.dependencies.length, 1)
  t.is(b.core.dependencies.length, 1)
  t.is(c.core.dependencies.length, 1)

  t.is(a.core.dependencies[0].length, 10)
  t.is(b.core.dependencies[0].length, 10)
  t.is(c.core.dependencies[0].length, 10)
})
````

## File: test/snapshot.js
````javascript
const test = require('brittle')
const b4a = require('b4a')
const {
  createCore,
  writeBlocks,
  readBlocks,
  readTreeNodes,
  getAuth,
  getHead,
  getDependency,
  getHints,
  getUserData,
  getBitfieldPages
} = require('./helpers')

test('read and write hypercore blocks from snapshot', async (t) => {
  const core = await createCore(t)
  await writeBlocks(core, 2)

  const snap = core.snapshot()
  await writeBlocks(core, 2, { start: 2 })

  {
    const res = await readBlocks(snap, 3)
    t.is(b4a.toString(res[0]), 'block0')
    t.is(b4a.toString(res[1]), 'block1')
    t.is(res[2], null)
  }

  {
    const res = await readBlocks(core, 3)
    t.is(b4a.toString(res[2]), 'block2', 'sanity check: does exist in non-snapshot core')
  }
})

test('snapshots from atomized core do not get updated', async (t) => {
  const core = await createCore(t)
  const atom = core.createAtom()
  const atomCore = core.atomize(atom)

  const atomInitSnap = atomCore.snapshot()
  const initSnap = core.snapshot()
  t.alike(await readBlocks(initSnap, 2), [null, null], 'sanity check')

  await writeBlocks(atomCore, 2)
  const expected = [b4a.from('block0'), b4a.from('block1')]

  t.alike(await readBlocks(atomInitSnap, 2), [null, null], 'init atom snap did not change')
  t.alike(await readBlocks(initSnap, 2), [null, null], 'init snap did not change')

  const atomPostWriteSnap = atomCore.snapshot()
  const corePostWriteSnap = core.snapshot()

  t.alike(await readBlocks(atomPostWriteSnap, 2), expected, 'sanity check')
  t.alike(await readBlocks(corePostWriteSnap, 2), [null, null], 'sanity check')
  t.alike(await readBlocks(atomInitSnap, 2), [null, null], 'init atom snap did not change')
  t.alike(await readBlocks(initSnap, 2), [null, null], 'init  snap did not change')

  await writeBlocks(atomCore, 2, { pre: 'override-' })
  const expectedOverride = [b4a.from('override-block0'), b4a.from('override-block1')]
  t.alike(await readBlocks(atomCore, 2), expectedOverride, 'sanity check')

  t.alike(await readBlocks(atomPostWriteSnap, 2), expected, 'post-write atom snap did not change')
  t.alike(await readBlocks(atomInitSnap, 2), [null, null], 'init atom snap did not change')

  await atom.flush()

  t.alike(await readBlocks(atomPostWriteSnap, 2), expected, 'prev atom snap did not change')
  t.alike(await readBlocks(atomInitSnap, 2), [null, null], 'init atom snap did not change')
  t.alike(await readBlocks(corePostWriteSnap, 2), [null, null], 'core post-write snap did not change')
  t.alike(await readBlocks(initSnap, 2), [null, null], 'init snap did not change')

  t.alike(await readBlocks(core, 2), expectedOverride, 'sanity check')
})

test('snapshots immutable (all operations)', async (t) => {
  const core = await createCore(t)
  await writeBlocks(core, 2)

  const snap = core.snapshot()

  {
    await writeBlocks(core, 2, { start: 2 })

    const tx = core.write()
    tx.putTreeNode({
      index: 0,
      size: 1,
      hash: b4a.from('a'.repeat(64), 'hex')
    })
    tx.setAuth({
      key: b4a.alloc(32),
      discoveryKey: b4a.alloc(32),
      manifest: null,
      keyPair: null,
      encryptionKey: b4a.from('a'.repeat(64, 'hex'))
    })
    tx.setHead({
      fork: 1,
      length: 3,
      rootHash: b4a.from('a'.repeat(64), 'hex'),
      signature: b4a.from('b'.repeat(64), 'hex')
    })
    tx.setDependency({
      dataPointer: 1,
      length: 3
    })
    tx.setHints({
      contiguousLength: 1
    })
    tx.putUserData('key', b4a.from('value'))
    tx.putBitfieldPage(0, b4a.from('bitfield-data-1'))

    await tx.flush()
  }

  t.alike(
    await readBlocks(core, 4),
    [b4a.from('block0'), b4a.from('block1'), b4a.from('block2'), b4a.from('block3')],
    'sanity check'
  )

  t.not(await readBlocks(core, 3), [null, null, null], 'sanity check (core itself got updated')
  t.alike(
    await readBlocks(snap, 4),
    [b4a.from('block0'), b4a.from('block1'), null, null],
    'snap blocks unchanged'
  )

  t.not(await readTreeNodes(core, 2), [null, null], 'sanity check (core itself got updated)')
  t.alike(await readTreeNodes(snap, 2), [null, null], 'tree nodes unchanged')

  const origAuth = {
    key: b4a.alloc(32),
    discoveryKey: b4a.alloc(32),
    manifest: null,
    keyPair: null,
    encryptionKey: null
  }
  t.not(await getAuth(core), origAuth, 'sanity check (core itself got updated)')
  t.alike(await getAuth(snap), origAuth, 'auth unchanged')

  t.not(await getHead(core), null, 'sanity check (core itself got updated)')
  t.alike(await getHead(snap), null, 'head unchanged')

  t.not(await getDependency(core), null, 'sanity check (core itself got updated)')
  t.alike(await getDependency(snap), null, 'dependency unchanged')

  t.not(await getHints(core), null, 'sanity check (core itself got updated)')
  t.alike(await getHints(snap), null, 'hints unchanged')

  t.not(await getUserData(core, 'key'), null, 'sanity check (core itself got updated)')
  t.alike(await getUserData(snap, 'key'), null, 'userdata unchanged')

  t.not(await getBitfieldPages(core, 2), [null, null], 'sanity check (core itself got updated)')
  t.alike(await getBitfieldPages(snap, 2), [null, null], 'bitfield pages unchanged')
})

test('snapshot deps are immut', async function (t) {
  const core = await createCore(t)

  const tx = core.write()

  tx.setHead({
    fork: 0,
    length: 5,
    rootHash: b4a.from('a'.repeat(64), 'hex'),
    signature: b4a.from('b'.repeat(64), 'hex')
  })

  await tx.flush()

  const session = await core.createSession('test', null)
  const snap = session.snapshot()

  session.updateDependencyLength(6)

  t.alike(snap.core.dependencies, [{ dataPointer: core.core.dataPointer, length: 5 }])
  t.alike(session.core.dependencies, [{ dataPointer: core.core.dataPointer, length: 6 }])

  await session.close()
  await snap.close()
  await core.close()
})
````

## File: test/streams.js
````javascript
const test = require('brittle')
const b4a = require('b4a')
const { createCore, toArray } = require('./helpers')

test('block stream', async function (t) {
  const core = await createCore(t)

  const tx = core.write()
  const expected = []

  for (let i = 0; i < 10; i++) {
    tx.putBlock(i, b4a.from([i]))
    expected.push({ index: i, value: b4a.from([i]) })
  }

  await tx.flush()

  const blocks = await toArray(core.createBlockStream({ gte: 0, lt: 10 }))

  t.alike(blocks, expected)
})

test('dependency stream', async function (t) {
  const core = await createCore(t)

  const expected = []
  for (let i = 0; i < 30; i++) expected.push({ index: i, value: b4a.from([i]) })

  const head = {
    fork: 0,
    length: 0,
    rootHash: b4a.alloc(32),
    signature: b4a.alloc(64)
  }

  await writeBlocks(core, head, 10)

  const sess1 = await core.createSession('first', null)

  await writeBlocks(sess1, head, 10)

  const sess2 = await sess1.createSession('second', null)

  await writeBlocks(sess2, head, 10)

  const blocks = await toArray(sess2.createBlockStream({ gte: 0, lt: 30 }))

  t.alike(blocks, expected)
})

test('dependency stream with limits', async function (t) {
  const core = await createCore(t)

  const expected = []
  for (let i = 5; i < 25; i++) expected.push({ index: i, value: b4a.from([i]) })

  const head = {
    fork: 0,
    length: 0,
    rootHash: b4a.alloc(32),
    signature: b4a.alloc(64)
  }

  await writeBlocks(core, head, 10)

  const sess1 = await core.createSession('first', null)

  await writeBlocks(sess1, head, 10)

  const sess2 = await sess1.createSession('second', null)

  await writeBlocks(sess2, head, 10)

  const blocks = await toArray(sess2.createBlockStream({ gte: 5, lt: 25 }))

  t.alike(blocks, expected)
})

test('reverse block stream', async function (t) {
  const core = await createCore(t)

  const tx = core.write()
  const expected = []

  for (let i = 0; i < 10; i++) {
    tx.putBlock(i, b4a.from([i]))
    expected.push({ index: i, value: b4a.from([i]) })
  }

  await tx.flush()

  const blocks = await toArray(core.createBlockStream({ gte: 0, lt: 10, reverse: true }))

  t.alike(blocks, expected.reverse())
})

test('reverse dependency stream', async function (t) {
  const core = await createCore(t)

  const expected = []
  for (let i = 29; i >= 0; i--) expected.push({ index: i, value: b4a.from([i]) })

  const head = {
    fork: 0,
    length: 0,
    rootHash: b4a.alloc(32),
    signature: b4a.alloc(64)
  }

  await writeBlocks(core, head, 10)

  const sess1 = await core.createSession('first', null)

  await writeBlocks(sess1, head, 10)

  const sess2 = await sess1.createSession('second', null)

  await writeBlocks(sess2, head, 10)

  const blocks = await toArray(sess2.createBlockStream({ gte: 0, lt: 30, reverse: true }))

  t.alike(blocks, expected)
})

test('reverse dependency stream with limits', async function (t) {
  const core = await createCore(t)

  const expected = []
  for (let i = 24; i >= 5; i--) expected.push({ index: i, value: b4a.from([i]) })

  const head = {
    fork: 0,
    length: 0,
    rootHash: b4a.alloc(32),
    signature: b4a.alloc(64)
  }

  await writeBlocks(core, head, 10)

  const sess1 = await core.createSession('first', null)

  await writeBlocks(sess1, head, 10)

  const sess2 = await sess1.createSession('second', null)

  await writeBlocks(sess2, head, 10)

  const blocks = await toArray(sess2.createBlockStream({ gte: 5, lt: 25, reverse: true }))

  t.alike(blocks, expected)
})

test('block stream (atom)', async function (t) {
  const core = await createCore(t)
  const atom = core.createAtom()

  const a = core.atomize(atom)

  const expected = []

  {
    const tx = a.write()

    for (let i = 0; i < 5; i++) {
      const index = 2 * i
      tx.putBlock(index, b4a.from([index]))
      expected.push({ index, value: b4a.from([index]) })
    }

    await tx.flush()
  }

  await atom.flush()

  {
    const tx = a.write()

    for (let i = 0; i < 5; i++) {
      const index = 2 * i + 1
      tx.putBlock(index, b4a.from([index]))
      expected.push({ index, value: b4a.from([index]) })
    }

    await tx.flush()
  }

  {
    const blocks = await toArray(a.createBlockStream({ gte: 0, lt: 10 }))
    t.alike(blocks, expected.sort(cmpBlock))
  }

  {
    const blocks = await toArray(a.createBlockStream({ gte: 0, lt: 10, reverse: true }))
    t.alike(blocks, expected.sort(cmpBlock).reverse())
  }

  {
    const tx = a.write()
    tx.deleteBlockRange(4, 6)
    await tx.flush()
  }

  expected.sort(cmpBlock).splice(4, 2)

  {
    const blocks = await toArray(a.createBlockStream({ gte: 0, lt: 10 }))
    t.alike(blocks, expected.sort(cmpBlock))
  }

  {
    const blocks = await toArray(a.createBlockStream({ gte: 0, lt: 10, reverse: true }))
    t.alike(blocks, expected.sort(cmpBlock).reverse())
  }

  {
    const tx = a.write()
    tx.deleteBlockRange(0, 2)
    tx.deleteBlockRange(8, 9)
    await tx.flush()
  }

  expected.sort(cmpBlock)

  expected.shift()
  expected.shift()
  const tmp = expected.pop()
  expected.pop()
  expected.push(tmp)

  {
    const blocks = await toArray(a.createBlockStream({ gte: 0, lt: 10 }))
    t.alike(blocks, expected.sort(cmpBlock))
  }

  {
    const blocks = await toArray(a.createBlockStream({ gte: 0, lt: 10, reverse: true }))
    t.alike(blocks, expected.sort(cmpBlock).reverse())
  }

  {
    const tx = a.write()
    tx.deleteBlockRange(8, 10)
    await tx.flush()
  }

  expected.sort(cmpBlock)
  expected.pop()

  {
    const blocks = await toArray(a.createBlockStream({ gte: 0, lt: 10 }))
    t.alike(blocks, expected.sort(cmpBlock))
  }

  {
    const blocks = await toArray(a.createBlockStream({ gte: 0, lt: 10, reverse: true }))
    t.alike(blocks, expected.sort(cmpBlock).reverse())
  }

  t.ok(a.view.changes, 'used atomic view')

  await atom.flush()

  {
    const blocks = await toArray(a.createBlockStream({ gte: 0, lt: 10 }))
    t.alike(blocks, expected.sort(cmpBlock))
  }

  {
    const blocks = await toArray(a.createBlockStream({ gte: 0, lt: 10, reverse: true }))
    t.alike(blocks, expected.sort(cmpBlock).reverse())
  }
})

function cmpBlock (a, b) {
  return a.index - b.index
}

async function writeBlocks (sess, head, n) {
  const start = head.length

  const tx = sess.write()
  for (let i = start; i < start + n; i++) tx.putBlock(i, b4a.from([i]))

  head.length += n
  tx.setHead(head)

  await tx.flush()
}
````

## File: .gitignore
````
node_modules
package-lock.json
coverage/
````

## File: build.js
````javascript
const Hyperschema = require('hyperschema')

const SPEC = './spec/hyperschema'

const schema = Hyperschema.from(SPEC, { versioned: false })
const corestore = schema.namespace('corestore')

corestore.register({
  name: 'allocated',
  compact: true,
  fields: [{
    name: 'cores',
    type: 'uint',
    required: true
  }, {
    name: 'datas',
    type: 'uint',
    required: true
  }]
})

corestore.register({
  name: 'head',
  fields: [{
    name: 'version',
    type: 'uint',
    required: true
  }, {
    name: 'allocated',
    type: '@corestore/allocated'
  }, {
    name: 'seed',
    type: 'fixed32'
  }, {
    name: 'defaultDiscoveryKey',
    type: 'fixed32'
  }]
})

corestore.register({
  name: 'alias',
  compact: true,
  fields: [{
    name: 'name',
    type: 'string',
    required: true
  }, {
    name: 'namespace',
    type: 'fixed32',
    required: true
  }]
})

corestore.register({
  name: 'core',
  fields: [{
    name: 'version',
    type: 'uint',
    required: true
  }, {
    name: 'corePointer',
    type: 'uint',
    required: true
  }, {
    name: 'dataPointer',
    type: 'uint',
    required: true
  }, {
    name: 'alias',
    type: '@corestore/alias'
  }]
})

const core = schema.namespace('core')

core.register({
  name: 'hashes',
  offset: 0,
  strings: true,
  enum: [
    'blake2b'
  ]
})

core.register({
  name: 'signatures',
  offset: 0,
  strings: true,
  enum: [
    'ed25519'
  ]
})

core.register({
  name: 'tree-node',
  compact: true,
  fields: [{
    name: 'index',
    type: 'uint',
    required: true
  }, {
    name: 'size',
    type: 'uint',
    required: true
  }, {
    name: 'hash',
    type: 'fixed32',
    required: true
  }]
})

core.register({
  name: 'signer',
  compact: true,
  fields: [{
    name: 'signature',
    type: '@core/signatures',
    required: true
  }, {
    name: 'namespace',
    type: 'fixed32',
    required: true
  }, {
    name: 'publicKey',
    type: 'fixed32', // should prop have been buffer but we can change when we version bump
    required: true
  }]
})

core.register({
  name: 'prologue',
  compact: true,
  fields: [{
    name: 'hash',
    type: 'fixed32',
    required: true
  }, {
    name: 'length',
    type: 'uint',
    required: true
  }]
})

core.register({
  name: 'manifest',
  flagsPosition: 1, // compat
  fields: [{
    name: 'version',
    type: 'uint',
    required: true
  }, {
    name: 'hash',
    type: '@core/hashes',
    required: true
  }, {
    name: 'quorum',
    type: 'uint',
    required: true
  }, {
    name: 'allowPatch',
    type: 'bool'
  }, {
    name: 'signers',
    array: true,
    required: true,
    type: '@core/signer'
  }, {
    name: 'prologue',
    type: '@core/prologue'
  }, {
    name: 'linked',
    array: true,
    type: 'fixed32'
  }]
})

core.register({
  name: 'keyPair',
  compact: true,
  fields: [{
    name: 'publicKey',
    type: 'buffer',
    required: true
  }, {
    name: 'secretKey',
    type: 'buffer',
    required: true
  }]
})

core.register({
  name: 'auth',
  fields: [{
    name: 'key',
    type: 'fixed32',
    required: true
  }, {
    name: 'discoveryKey',
    type: 'fixed32',
    required: true
  }, {
    name: 'manifest',
    type: '@core/manifest'
  }, {
    name: 'keyPair',
    type: '@core/keyPair'
  }, {
    name: 'encryptionKey',
    type: 'buffer'
  }]
})

core.register({
  name: 'head',
  fields: [{
    name: 'fork',
    type: 'uint',
    required: true
  }, {
    name: 'length',
    type: 'uint',
    required: true
  }, {
    name: 'rootHash',
    type: 'fixed32',
    required: true
  }, {
    name: 'signature',
    type: 'buffer',
    required: true
  }]
})

core.register({
  name: 'hints',
  fields: [{
    name: 'contiguousLength',
    type: 'uint'
  }]
})

core.register({
  name: 'session',
  compact: true,
  fields: [{
    name: 'name',
    type: 'string',
    required: true
  }, {
    name: 'dataPointer',
    type: 'uint',
    required: true
  }]
})

core.register({
  name: 'sessions',
  array: true,
  type: '@core/session'
})

core.register({
  name: 'dependency',
  compact: true,
  fields: [{
    name: 'dataPointer',
    type: 'uint',
    required: true
  }, {
    name: 'length',
    type: 'uint',
    required: true
  }]
})

Hyperschema.toDisk(schema, SPEC)
````

## File: index.js
````javascript
const RocksDB = require('rocksdb-native')
const rrp = require('resolve-reject-promise')
const ScopeLock = require('scope-lock')
const DeviceFile = require('device-file')
const path = require('path')
const fs = require('fs')
const View = require('./lib/view.js')

const VERSION = 1
const COLUMN_FAMILY = 'corestore'

const { store, core } = require('./lib/keys.js')

const {
  CorestoreRX,
  CorestoreTX,
  CoreTX,
  CoreRX
} = require('./lib/tx.js')

const {
  createCoreStream,
  createAliasStream,
  createBlockStream,
  createBitfieldStream,
  createUserDataStream,
  createTreeNodeStream,
  createLocalStream
} = require('./lib/streams.js')

const EMPTY = new View()

class Atom {
  constructor (db) {
    this.db = db
    this.view = new View()
    this.flushedPromise = null
    this.flushing = false
    this.flushes = []
  }

  onflush (fn) {
    this.flushes.push(fn)
  }

  flushed () {
    if (!this.flushing) return Promise.resolve()
    if (this.flushedPromise !== null) return this.flushedPromise.promise
    this.flushedPromise = rrp()
    return this.flushedPromise.promise
  }

  _resolve () {
    const f = this.flushedPromise
    this.flushedPromise = null
    f.resolve()
  }

  async flush () {
    if (this.flushing) throw new Error('Atom already flushing')
    this.flushing = true

    try {
      await View.flush(this.view.changes, this.db)
      this.view.reset()

      const promises = []
      const len = this.flushes.length // in case of reentry
      for (let i = 0; i < len; i++) promises.push(this.flushes[i]())

      await Promise.all(promises)
    } finally {
      this.flushing = false
      if (this.flushedPromise !== null) this._resolve()
    }
  }
}

class HypercoreStorage {
  constructor (store, db, core, view, atom) {
    this.store = store
    this.db = db
    this.core = core
    this.view = view
    this.atom = atom

    this.view.readStart()
  }

  get dependencies () {
    return this.core.dependencies
  }

  getDependencyLength () {
    return this.core.dependencies.length
      ? this.core.dependencies[this.core.dependencies.length - 1].length
      : -1
  }

  getDependency (length) {
    for (let i = this.core.dependencies.length - 1; i >= 0; i--) {
      const dep = this.core.dependencies[i]
      if (dep.length < length) return dep
    }

    return null
  }

  setDependencyHead (dep) {
    const deps = this.core.dependencies

    for (let i = deps.length - 1; i >= 0; i--) {
      const d = deps[i]

      if (d.dataPointer !== dep.dataPointer) continue

      // check if nothing changed
      if (d.length === dep.length && i === deps.length - 1) return

      this.core = {
        corePointer: this.core.corePointer,
        dataPointer: this.core.dataPointer,
        dependencies: deps.slice(0, i + 1)
      }

      this.core.dependencies[i] = {
        dataPointer: dep.dataPointer,
        length: dep.length
      }
    }

    this.core.dependencies = [{
      dataPointer: dep.dataPointer,
      length: dep.length
    }]
  }

  // TODO: this might have to be async if the dependents have changed, but prop ok for now
  updateDependencyLength (length, truncated) {
    const deps = this.core.dependencies

    const i = this.findDependencyIndex(length, truncated)
    if (i === -1) throw new Error('Dependency not found')

    this.core = {
      corePointer: this.core.corePointer,
      dataPointer: this.core.dataPointer,
      dependencies: deps.slice(0, i + 1)
    }

    if (this.core.dependencies[i].length !== length) {
      this.core.dependencies[i] = {
        dataPointer: deps[i].dataPointer,
        length
      }
    }
  }

  findDependencyIndex (length, truncated) {
    const deps = this.core.dependencies

    if (truncated) {
      for (let i = 0; i < deps.length; i++) {
        if (deps[i].length >= length) return i
      }

      return -1
    }

    for (let i = deps.length - 1; i >= 0; i--) {
      if (deps[i].length <= length) return i
    }

    return -1
  }

  get snapshotted () {
    return this.db._snapshot !== null
  }

  snapshot () {
    return new HypercoreStorage(this.store, this.db.snapshot(), this.core, this.view.snapshot(), this.atom)
  }

  atomize (atom) {
    if (this.atom && this.atom !== atom) throw new Error('Cannot atomize and atomized session with a new atom')
    return new HypercoreStorage(this.store, this.db.session(), this.core, atom.view, atom)
  }

  createAtom () {
    return this.store.createAtom()
  }

  createBlockStream (opts) {
    return createBlockStream(this.core, this.db, this.view, opts)
  }

  createTreeNodeStream (opts) {
    return createTreeNodeStream(this.core, this.db, this.view, opts)
  }

  createBitfieldStream (opts) {
    return createBitfieldStream(this.core, this.db, this.view, opts)
  }

  createUserDataStream (opts) {
    return createUserDataStream(this.core, this.db, this.view, opts)
  }

  createLocalStream (opts) {
    return createLocalStream(this.core, this.db, this.view, opts)
  }

  async resumeSession (name) {
    const rx = this.read()
    const existingSessionsPromise = rx.getSessions()

    rx.tryFlush()
    const existingSessions = await existingSessionsPromise

    const sessions = existingSessions || []
    const session = getBatch(sessions, name, false)

    if (session === null) return null

    const core = {
      corePointer: this.core.corePointer,
      dataPointer: session.dataPointer,
      dependencies: []
    }

    const coreRx = new CoreRX(core, this.db, this.view)

    const dependencyPromise = coreRx.getDependency()
    coreRx.tryFlush()

    const dependency = await dependencyPromise
    if (dependency) core.dependencies = this._addDependency(dependency)

    return new HypercoreStorage(this.store, this.db.session(), core, this.atom ? this.view : new View(), this.atom)
  }

  async createSession (name, head) {
    const rx = this.read()

    const existingSessionsPromise = rx.getSessions()
    const existingHeadPromise = rx.getHead()

    rx.tryFlush()

    const [existingSessions, existingHead] = await Promise.all([existingSessionsPromise, existingHeadPromise])
    if (head === null) head = existingHead

    if (existingHead !== null && head.length > existingHead.length) {
      throw new Error('Invalid head passed, ahead of core')
    }

    const sessions = existingSessions || []
    const session = getBatch(sessions, name, true)
    const fresh = session.dataPointer === -1

    if (fresh) {
      session.dataPointer = await this.store._allocData()
    }

    const tx = this.write()

    tx.setSessions(sessions)

    const length = head === null ? 0 : head.length
    const core = {
      corePointer: this.core.corePointer,
      dataPointer: session.dataPointer,
      dependencies: this._addDependency({ dataPointer: this.core.dataPointer, length })
    }

    const coreTx = new CoreTX(core, this.db, tx.view, tx.changes)

    if (length > 0) coreTx.setHead(head)
    coreTx.setDependency(core.dependencies[core.dependencies.length - 1])

    if (!fresh) {
      // nuke all existing state...
      coreTx.deleteBlockRange(0, -1)
      coreTx.deleteTreeNodeRange(0, -1)
      coreTx.deleteBitfieldPageRange(0, -1)
    }

    await tx.flush()

    return new HypercoreStorage(this.store, this.db.session(), core, this.atom ? this.view : new View(), this.atom)
  }

  async createAtomicSession (atom, head) {
    const length = head === null ? 0 : head.length
    const core = {
      corePointer: this.core.corePointer,
      dataPointer: this.core.dataPointer,
      dependencies: this._addDependency(null)
    }

    const coreTx = new CoreTX(core, this.db, atom.view, [])

    if (length > 0) coreTx.setHead(head)

    await coreTx.flush()

    return this.atomize(atom)
  }

  _addDependency (dep) {
    const deps = []

    for (let i = 0; i < this.core.dependencies.length; i++) {
      const d = this.core.dependencies[i]

      if (dep !== null && d.length > dep.length) {
        if (d.dataPointer !== dep.dataPointer) {
          deps.push({ dataPointer: d.dataPointer, length: dep.length })
        }
        return deps
      }

      deps.push(d)
    }

    if (dep !== null && (deps.length === 0 || deps[deps.length - 1].dataPointer !== dep.dataPointer)) {
      deps.push(dep)
    }
    return deps
  }

  read () {
    return new CoreRX(this.core, this.db, this.view)
  }

  write () {
    return new CoreTX(this.core, this.db, this.atom ? this.view : null, [])
  }

  close () {
    if (this.view !== null) {
      this.view.readStop()
      this.view = null
    }

    return this.db.close()
  }
}

class CorestoreStorage {
  constructor (db, opts = {}) {
    const storage = typeof db === 'string' ? db : null

    this.bootstrap = storage !== null
    this.path = storage !== null ? storage : path.join(db.path, '..')
    this.readOnly = !!opts.readOnly

    // tmp sync fix for simplicty since not super deployed yet
    if (this.bootstrap && !this.readOnly) tmpFixStorage(this.path)

    this.rocks = storage === null ? db : new RocksDB(path.join(this.path, 'db'), opts)
    this.db = createColumnFamily(this.rocks, opts)
    this.id = opts.id || null
    this.view = null
    this.enters = 0
    this.lock = new ScopeLock()
    this.flushing = null
    this.version = 0
    this.migrating = null
  }

  get opened () {
    return this.db.opened
  }

  get closed () {
    return this.db.closed
  }

  async ready () {
    if (this.version === 0) await this._migrateStore()
    return this.db.ready()
  }

  async deleteCore (ptr) {
    const rx = new CoreRX(ptr, this.db, EMPTY)

    const authPromise = rx.getAuth()
    const sessionsPromise = rx.getSessions()

    rx.tryFlush()

    const auth = await authPromise
    const sessions = await sessionsPromise

    // no core stored here
    if (!auth) return

    const tx = this.db.write({ autoDestroy: true })

    tx.tryDelete(store.core(auth.discoveryKey))

    // clear core
    const start = core.core(ptr.corePointer)
    const end = core.core(ptr.corePointer + 1)
    tx.tryDeleteRange(start, end)

    if (sessions) {
      for (const { dataPointer } of sessions) {
        const start = core.data(dataPointer)
        const end = core.data(dataPointer + 1)
        tx.tryDeleteRange(start, end)
      }
    }

    return tx.flush()
  }

  static isCoreStorage (db) {
    return isCorestoreStorage(db)
  }

  static from (db) {
    if (isCorestoreStorage(db)) return db
    return new this(db)
  }

  async _flush () {
    while (this.enters > 0) {
      await this.lock.lock()
      await this.lock.unlock()
    }
  }

  // runs pre any other mutation and read
  async _migrateStore () {
    const view = await this._enter()

    try {
      if (this.version === VERSION) return

      await this.db.ready()

      if (this.bootstrap && !this.readOnly) {
        const corestoreFile = path.join(this.path, 'CORESTORE')

        if (!(await DeviceFile.resume(corestoreFile, { id: this.id }))) {
          await DeviceFile.create(corestoreFile, { id: this.id })
        }
      }

      const rx = new CorestoreRX(this.db, view)
      const headPromise = rx.getHead()

      rx.tryFlush()
      const head = await headPromise

      const version = head === null ? 0 : head.version
      if (version === VERSION) {
        this.version = VERSION
        return
      }

      const target = { version: VERSION, dryRun: false }

      switch (version) {
        case 0: {
          await require('./migrations/0').store(this, target)
          break
        }
        default: {
          throw new Error('Unsupported version: ' + version + ' - you should probably upgrade your dependencies')
        }
      }

      this.version = VERSION
    } finally {
      await this._exit()
    }
  }

  // runs pre the core is returned to the user
  async _migrateCore (core, discoveryKey, version, locked) {
    const view = locked ? this.view : await this._enter()
    try {
      if (version === VERSION) return

      const target = { version: VERSION, dryRun: false }

      switch (version) {
        case 0: {
          await require('./migrations/0').core(core, target)
          break
        }
        default: {
          throw new Error('Unsupported version: ' + version + ' - you should probably upgrade your dependencies')
        }
      }

      if (locked === false) return

      // if its locked, then move the core state into the memview
      // in case the core is reopened from the memview, pre flush

      const rx = new CorestoreRX(this.db, EMPTY)
      const tx = new CorestoreTX(view)

      const corePromise = rx.getCore(discoveryKey)
      rx.tryFlush()

      tx.putCore(discoveryKey, await corePromise)
      tx.apply()
    } finally {
      if (!locked) await this._exit()
    }
  }

  async _enter () {
    this.enters++
    await this.lock.lock()
    if (this.view === null) this.view = new View()
    return this.view
  }

  async _exit () {
    this.enters--

    if (this.flushing === null) this.flushing = rrp()
    const flushed = this.flushing.promise

    if (this.enters === 0 || this.view.size() > 128) {
      try {
        await View.flush(this.view.changes, this.db)
        this.flushing.resolve()
      } catch (err) {
        this.flushing.reject(err)
      } finally {
        this.flushing = null
        this.view = null
      }
    }

    this.lock.unlock()
    return flushed
  }

  // when used with core catches this isnt transactional for simplicity, HOWEVER, its just a number
  // so worth the tradeoff
  async _allocData () {
    let dataPointer = 0

    const view = await this._enter()
    const tx = new CorestoreTX(view)

    try {
      const head = await this._getHead(view)

      dataPointer = head.allocated.datas++

      tx.setHead(head)
      tx.apply()
    } finally {
      await this._exit()
    }

    return dataPointer
  }

  // exposes here so migrations can easily access the head in an init state
  async _getHead (view) {
    const rx = new CorestoreRX(this.db, view)
    const headPromise = rx.getHead()
    rx.tryFlush()

    const head = await headPromise
    return head === null ? initStoreHead() : head
  }

  createAtom () {
    return new Atom(this.db)
  }

  async flush () {
    await this.rocks.flush()
  }

  async close () {
    if (this.db.closed) return
    await this._flush()
    await this.db.close()
    await this.rocks.close()
  }

  async clear () {
    if (this.version === 0) await this._migrateStore()

    const view = await this._enter()
    const tx = new CorestoreTX(view)

    tx.clear()
    tx.apply()

    await this._exit()
  }

  createCoreStream () {
    // TODO: be nice to run the mgiration here also, but too much plumbing atm
    return createCoreStream(this.db, EMPTY)
  }

  createAliasStream (namespace) {
    // TODO: be nice to run the mgiration here also, but too much plumbing atm
    return createAliasStream(this.db, EMPTY, namespace)
  }

  async getAlias (alias) {
    if (this.version === 0) await this._migrateStore()

    const rx = new CorestoreRX(this.db, EMPTY)
    const discoveryKeyPromise = rx.getCoreByAlias(alias)
    rx.tryFlush()
    return discoveryKeyPromise
  }

  async getSeed () {
    if (this.version === 0) await this._migrateStore()

    const rx = new CorestoreRX(this.db, EMPTY)
    const headPromise = rx.getHead()

    rx.tryFlush()

    const head = await headPromise
    return head === null ? null : head.seed
  }

  async setSeed (seed, { overwrite = true } = {}) {
    if (this.version === 0) await this._migrateStore()

    const view = await this._enter()
    const tx = new CorestoreTX(view)

    try {
      const rx = new CorestoreRX(this.db, view)
      const headPromise = rx.getHead()

      rx.tryFlush()

      const head = (await headPromise) || initStoreHead()

      if (head.seed === null || overwrite) head.seed = seed
      tx.setHead(head)
      tx.apply()

      return head.seed
    } finally {
      await this._exit()
    }
  }

  async getDefaultDiscoveryKey () {
    if (this.version === 0) await this._migrateStore()

    const rx = new CorestoreRX(this.db, EMPTY)
    const headPromise = rx.getHead()

    rx.tryFlush()

    const head = await headPromise
    return head === null ? null : head.defaultDiscoveryKey
  }

  async setDefaultDiscoveryKey (discoveryKey, { overwrite = true } = {}) {
    if (this.version === 0) await this._migrateStore()

    const view = await this._enter()
    const tx = new CorestoreTX(view)

    try {
      const rx = new CorestoreRX(this.db, view)
      const headPromise = rx.getHead()

      rx.tryFlush()

      const head = (await headPromise) || initStoreHead()

      if (head.defaultDiscoveryKey === null || overwrite) head.defaultDiscoveryKey = discoveryKey
      tx.setHead(head)
      tx.apply()

      return head.defaultDiscoveryKey
    } finally {
      await this._exit()
    }
  }

  async has (discoveryKey, { ifMigrated = false } = {}) {
    if (this.version === 0) await this._migrateStore()

    const rx = new CorestoreRX(this.db, EMPTY)
    const promise = rx.getCore(discoveryKey)

    rx.tryFlush()

    const core = await promise

    if (core === null) return false
    if (core.version !== VERSION && ifMigrated) return false

    return true
  }

  async getAuth (discoveryKey) {
    if (this.version === 0) await this._migrateStore()

    const rx = new CorestoreRX(this.db, EMPTY)
    const corePromise = rx.getCore(discoveryKey)

    rx.tryFlush()

    const core = await corePromise
    if (core === null) return null

    const coreRx = new CoreRX(core, this.db, EMPTY)
    const authPromise = coreRx.getAuth()

    coreRx.tryFlush()

    return authPromise
  }

  async resume (discoveryKey) {
    if (this.version === 0) await this._migrateStore()

    if (!discoveryKey) {
      discoveryKey = await this.getDefaultDiscoveryKey()
      if (!discoveryKey) return null
    }

    const rx = new CorestoreRX(this.db, EMPTY)
    const corePromise = rx.getCore(discoveryKey)

    rx.tryFlush()
    const core = await corePromise

    if (core === null) return null
    return this._resumeFromPointers(EMPTY, discoveryKey, false, core)
  }

  async _resumeFromPointers (view, discoveryKey, create, { version, corePointer, dataPointer }) {
    const core = { corePointer, dataPointer, dependencies: [] }

    while (true) {
      const rx = new CoreRX({ dataPointer, corePointer: 0, dependencies: [] }, this.db, view)
      const dependencyPromise = rx.getDependency()
      rx.tryFlush()
      const dependency = await dependencyPromise
      if (!dependency) break
      core.dependencies.push(dependency)
      dataPointer = dependency.dataPointer
    }

    const result = new HypercoreStorage(this, this.db.session(), core, EMPTY, null)

    if (version < VERSION) await this._migrateCore(result, discoveryKey, version, create)
    return result
  }

  // not allowed to throw validation errors as its a shared tx!
  async _create (view, { key, manifest, keyPair, encryptionKey, discoveryKey, alias, userData }) {
    const rx = new CorestoreRX(this.db, view)
    const tx = new CorestoreTX(view)

    const corePromise = rx.getCore(discoveryKey)
    const headPromise = rx.getHead()

    rx.tryFlush()

    let [core, head] = await Promise.all([corePromise, headPromise])
    if (core) return this._resumeFromPointers(view, discoveryKey, true, core)

    if (head === null) head = initStoreHead()
    if (head.defaultDiscoveryKey === null) head.defaultDiscoveryKey = discoveryKey

    const corePointer = head.allocated.cores++
    const dataPointer = head.allocated.datas++

    core = { version: VERSION, corePointer, dataPointer, alias }

    tx.setHead(head)
    tx.putCore(discoveryKey, core)
    if (alias) tx.putCoreByAlias(alias, discoveryKey)

    const ptr = { corePointer, dataPointer, dependencies: [] }
    const ctx = new CoreTX(ptr, this.db, view, tx.changes)

    ctx.setAuth({
      key,
      discoveryKey,
      manifest,
      keyPair,
      encryptionKey
    })

    if (userData) {
      for (const { key, value } of userData) {
        ctx.putUserData(key, value)
      }
    }

    tx.apply()

    return new HypercoreStorage(this, this.db.session(), ptr, EMPTY, null)
  }

  async create (data) {
    if (this.version === 0) await this._migrateStore()

    const view = await this._enter()

    try {
      return await this._create(view, data)
    } finally {
      await this._exit()
    }
  }
}

module.exports = CorestoreStorage

function initStoreHead () {
  return {
    version: 0, // cause we wanna run the migration
    allocated: {
      datas: 0,
      cores: 0
    },
    seed: null,
    defaultDiscoveryKey: null
  }
}

function getBatch (sessions, name, alloc) {
  for (let i = 0; i < sessions.length; i++) {
    if (sessions[i].name === name) return sessions[i]
  }

  if (!alloc) return null

  const result = { name, dataPointer: -1 }
  sessions.push(result)
  return result
}

function isCorestoreStorage (s) {
  return typeof s === 'object' && !!s && typeof s.setDefaultDiscoveryKey === 'function'
}

function createColumnFamily (db, opts = {}) {
  const {
    tableCacheIndexAndFilterBlocks = true,
    blockCache = true,
    optimizeFiltersForMemory = false
  } = opts

  const col = new RocksDB.ColumnFamily(COLUMN_FAMILY, {
    enableBlobFiles: true,
    minBlobSize: 4096,
    blobFileSize: 256 * 1024 * 1024,
    enableBlobGarbageCollection: true,
    tableBlockSize: 8192,
    tableCacheIndexAndFilterBlocks,
    tableFormatVersion: 6,
    optimizeFiltersForMemory,
    blockCache
  })

  return db.columnFamily(col)
}

// TODO: remove in like 3-6 mo
function tmpFixStorage (p) {
  // if CORESTORE file is written, new format
  if (fs.existsSync(path.join(p, 'CORESTORE'))) return

  let files = []

  try {
    files = fs.readdirSync(p)
  } catch {}

  const notRocks = new Set(['CORESTORE', 'primary-key', 'cores', 'app-preferences', 'cache', 'preferences.json', 'db', 'clone', 'core', 'notifications'])

  for (const f of files) {
    if (notRocks.has(f)) continue

    try {
      fs.mkdirSync(path.join(p, 'db'))
    } catch {}

    fs.renameSync(path.join(p, f), path.join(p, 'db', f))
  }
}
````

## File: LICENSE
````
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
````

## File: NOTICE
````
Copyright 2025 Holepunch Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
````

## File: package.json
````json
{
  "name": "hypercore-storage",
  "version": "1.9.6",
  "main": "index.js",
  "files": [
    "index.js",
    "lib/*.js",
    "spec/hyperschema/*.js",
    "migrations/0/*.js"
  ],
  "scripts": {
    "test": "standard && node test/all.js",
    "test:bare": "bare test/all.js",
    "test:generate": "brittle -r test/all.js test/*.js"
  },
  "author": "Holepunch Inc.",
  "license": "Apache-2.0",
  "description": "Storage engine for Hypercore",
  "imports": {
    "fs": {
      "bare": "bare-fs",
      "default": "fs"
    },
    "path": {
      "bare": "bare-path",
      "default": "path"
    }
  },
  "dependencies": {
    "b4a": "^1.6.7",
    "bare-fs": "^4.0.1",
    "bare-path": "^3.0.0",
    "compact-encoding": "^2.16.0",
    "device-file": "^1.2.2",
    "flat-tree": "^1.12.1",
    "hypercore-crypto": "^3.4.2",
    "hyperschema": "^1.7.0",
    "index-encoder": "^3.3.2",
    "resolve-reject-promise": "^1.0.0",
    "rocksdb-native": "^3.1.1",
    "scope-lock": "^1.2.4",
    "streamx": "^2.21.1"
  },
  "devDependencies": {
    "brittle": "^3.7.0",
    "standard": "^17.1.2",
    "test-tmp": "^1.3.1"
  }
}
````

## File: README.md
````markdown
# hypercore-storage

The storage engine for Hypercore. Built on RocksDB.

```
npm install hypercore-storage
```

## API

The following API is what Hypercore 11 binds to to do I/O.

```js
const Storage = require('hypercore-storage')
```

#### `store = new Storage(dbOrPath)`

Make a new storage engine.

#### `core = await store.create({ key, discoveyKey, manifest?, keyPair?, encryptionKey?, userData? })`

Create a new core, returns a storage instance for that core.

#### `core = await store.resume(discoveryKey)`

Resume a previously make core. If it doesn't exist it returns `null`.

#### `atom = store.createAtom()`

Primitive for making atomic batches across ops. See below for `core.atomize` on how to use it.
When you wanna flush your changes to the underlying storage, use `await atom.flush()`.

Internally to "listen" for when that happens you can add an sync hook with `atom.onflush(fn)`

#### `bool = await store.has(discoveryKey)`

Check if a core exists.

#### `stream = store.createCoreStream()`

List all cores. Stream data looks like this `{ discoveryKey, core }` where core contains the core header.

#### `await store.close()`

Close the storage instance.

#### `rx = core.read()`

Make a read batch on a core storage.

**NOTE:** a read batch DOES NOT flush until you call `rx.tryFlush()`.

#### `await rx.getAuth()`

Returns the auth data around a core.

#### `await rx.getHead()`

Returns the head of the merkle tree.

#### `await rx.getSessions()`

Returns an array of all named sessions.

#### `await rx.getDependency()`

Returns the core this has a dependency on.

#### `await rx.getHints()`

Returns the various storage/replication hints.

#### `await rx.getBlock(index)`

Returns a block stored.

#### `await rx.getTreeNode(index)`

Returns a tree node stored.

#### `await rx.getBitfieldPage(index)`

Return a bitfield page.

#### `await rx.getUserData(key)`

Return a user stored buffer.

#### `rx.tryFlush()`

Flushes the read batch, non of the above promises will resolve until you call this.

#### `tx = core.write()`

Make a write batch on a core storage.

**NOTE:** all the apis below are sync as they just buffer mutations until you flush them.

#### `tx.setAuth(auth)`

Set the auth data around a core.

#### `tx.setHead(auth)`

Set the head of the merkle tree.

#### `tx.setSessions(sessions)`

Set an array of all named sessions.

#### `tx.setDependency(dep)`

Set the core this has a dependency on.

#### `tx.setHints(hints)`

Set the various storage/replication hints.

#### `tx.putBlock(index, buffer)`

Put a block at a specific index.

#### `tx.deleteBlock(index)`

Delete a block at a specific index.

#### `tx.deleteBlockRange(start, index)`

Delete blocks between two indexes.

#### `tx.putTreeNode(node)`

Put a tree node (at its described index).

#### `tx.deleteTreeNode(index)`

Delete a tree node at a specific index.

#### `tx.deleteTreeNodeRange(start, index)`

Delete blocks between two tree indexes.

#### `tx.putBitfieldPage(index, page)`

Put a bitfield page at its described index.

#### `tx.deleteBitfieldPage(index)`

Delete a bitfield page.

#### `tx.deleteBitfieldPageRange(start, end)`

Delete bitfield pages between two indexes.

#### `tx.putUserData(key, value)`

Put a user provided buffer at a user provided key.

#### `tx.deleteUserData(key)`

Delete a user provided key.

#### `await tx.flush()`

Flushes the write batch.

#### `stream = core.createBlockStream(opts)`

Create a stream of all blocks.

#### `stream = core.createTreeNodeStream(opts)`

Create a stream of all tree nodes.

#### `stream = core.createBitfieldStream(opts)`

Create a stream of all bitfield pages.

#### `stream = core.createUserDataStream(opts)`

Create a stream of all user data.

#### `await core.close()`

Close the core storage engine.

#### `atom = core.createAtom()`

Same as `store.createAtom()` but here again for conveinience.

#### `core = core.atomize(atom)`

Atomize a core. Allows you to build up cross core atomic batches and operations.
An atomized core will not flush its changes until you call `atom.flush()`, but you can still read your writes.

#### `core = core.createSession(name, head)`

Create a named session on top of a core. A named session points back to the previous storage,
but is otherwise independent and stored on disk, like a branch in git if you will.

#### `core.dependencies`

Array containing the full list of dependencies for this core (ie tree of named sessions).

## License

Apache-2.0
````
