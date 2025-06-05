const fs = require('fs')
const {join, resolve, dirname} = require('path')
const merge = require('lodash.merge')

const traverse = require('traverse')
const debug = require('debug')('tre-cli-import-files')

const pull = require('pull-stream')
const file = require('pull-file')
const {stdin} = require('pull-stdio')
const {isMsg} = require('ssb-ref')

const Importer = require('tre-file-importer')
const fileFromPath = require('tre-file-importer/file')

const causalOrder = require('./lib/causal-sort')

module.exports = doImport

function doImport(ssb, conf, basedir, pkg, opts, cb) {
  const {dryRun} = opts
  const importConfig = conf.tre || conf
  debug('pkg: %O', pkg)
  debug('importConfig: %O', importConfig)
  importConfig.branches = importConfig.branches || {}
  debug('root: %s', importConfig.branches.root)

  patchForDryRun(ssb, opts)

  const branches = Object.assign({}, importConfig.branches, pkg.branches)
  debug('branches are: %O', branches)
  const protos = pkg.prototypes || {}
  debug('prototypes from package: %O', pkg.prototypes)
  debug('prototypes from command line: %O', conf['publish-prototype'])
  ;(arr(conf['publish-prototype']) || []).forEach(p =>{protos[p] = true})
  publishPrototypes(ssb, protos, branches, (err, prototypes) => {
    if (err) return cb(err)
    prototypes = Object.assign({}, importConfig.prototypes || {}, prototypes)
    debug('prototypes are: %O', prototypes)
    const importers = Object.assign({}, importConfig.importers || {}, pkg.importers || {})
    debug('importers are: %O', importers)
    importFiles(ssb, importers, pkg.files, prototypes, basedir, (err, fileMessages) => {
      if (err) return cb(err)
      const messages = Object.assign({}, fileMessages, pkg.messages || {})
      debug('combined messages: %O', messages)
      publishMessages(ssb, basedir, branches, messages, (err, branches) => {
        if (err) return cb(err)
        const newConfig = {
          branches, prototypes
        }
        //ssb.close()
        cb(null, newConfig)
      })
    })
  })
}

// --

function publishPrototypes(ssb, prototypes, folders, cb) {
  if (!prototypes) {
    return cb(null, {})
  }
  console.error('Publishing prototypes ...')
  makePrototypes(ssb, Object.keys(prototypes).filter(k => prototypes[k]), folders, cb)
}

function importFiles(ssb, importers, files, prototypes, basedir, cb) {
  debug('importers: %O')
  if (!importers || !files) return cb(null, {})
  
  const fileImporter = Importer(ssb, {tre: {prototypes}})
  Object.keys(importers).filter(k => importers[k]).forEach(modname => {
    const m = localRequire(modname)
    fileImporter.use(m)
  })
  
  pull(
    pull.keys(files),
    pull.asyncMap( (name, cb) => {
      const {content, path} = files[name]
      let paths = Array.isArray(path) ? path : [path]
      paths = paths.map(p => join(basedir, p))

      fileImporter.importFiles(paths.map(fileFromPath), (err, _content) => {
        if (err) return cb(err)
        cb(null, {
          name,
          content: merge(_content, content)
        })
      })
    }),
    pull.collect( (err, contents) => {
      if (err) return cb(err)
      cb(
        null,
        contents.reduce( (acc, {name, content}) => {
          acc[name] = content
          return acc
        }, {})
      )
    })
  )
}

function publishMessages(ssb, basedir, folders, messages, cb) {

  function resolveVars(obj) {
    traverse(obj).forEach(function(x) {
      if (typeof x == 'string' && x[0] == '%' && !isMsg(x)) {
        const key = folders[x.substr(1)]
        if (key) {
          this.update(key) 
        } else {
          throw new Error('unknown named message: ' + x)
        }
      } else if (typeof x == 'string' && x.startsWith('$include ')) {
        const path = resolve(join(basedir, x.substr('$include '.length)))
        const fileContent = fs.readFileSync(path, 'utf8')
        this.update(fileContent)
      }
    })
  }

  if (!Object.keys(messages)) return cb(null, folders)

  const sorted = causalOrder(messages)
  debug('Causal order:')
  sorted.forEach(kv => debug('%s', kv.key))

  pull(
    pull.values(sorted),
    pull.asyncMap( (kv, cb) => {
      const content = kv.value
      const name = kv.key
      resolveVars(content)
      ssb.publish(content, (err, msg) => {
        if (err) return cb(err)
        folders[name] = msg.key
        console.error('Published', content.type, name, 'as', msg.key)
        cb(null, msg)
      })
    }),
    pull.collect( err => {
      if (err) return cb(err)
      cb(null, folders)
    })
  )
}

function makePrototypes(ssb, modules, folders, cb) {
  const {root, prototypes} = folders
  const result = {}
  pull(
    pull.values(modules),
    pull.asyncMap( (m, cb) =>{
      const f = localRequire(m).factory
      const content = f({}).prototype()
      if (!content) return cb(new Error(`${m} prototype() returned no content`))
      Object.assign(content, {root, branch: prototypes})
      ssb.publish(content, cb)
    }),
    pull.drain( kv =>{
      result[kv.value.content.type] = kv.key
      console.error(`Published ${kv.value.content.type} prototype as ${kv.key}`)
    }, err => {
      if (err) return cb(err)
      cb(null, result)
    })
  )
}

function localRequire(modname) {
  return modname == '.' ? require(resolve('.')) : require(resolve(`node_modules/${modname}`))
}

function arr(x) {
  if (!x) return []
  if (Array.isArray(x)) return x
  return [x]
}

function patchForDryRun(ssb, opts) {
  if (opts.dryRun) {
    console.error("Won't publish because of --dryRun option")
    ssb.blobs.add = cb => pull.onEnd(err => cb(err, 'fake-hash'))
    ssb.publish = function(content, cb) {
      const msg = {
        key: 'fake-key',
        value: {
          content
        }
      }
      console.error('would publish', JSON.stringify(msg, null, 2))
      cb(null, msg)
    }
  }
}
