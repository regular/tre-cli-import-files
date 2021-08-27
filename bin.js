#!/usr/bin/env node
const fs = require('fs')
const {parse, join, resolve, dirname} = require('path')
const ssbClient = require('ssb-zero-conf-client')
const ssbKeys = require('ssb-keys')
const debug = require('debug')('tre-cli-import-files:bin')
const run = require('.')

const argv = require('minimist')(process.argv.slice(2))
debug('parsed command line arguments: %O', argv)

const conf = require('rc')('tre')
const path = conf.config
debug('read .trerc from %s: %O', path, conf)

if (argv._.length<1 || argv.help) {
  const bin = argv['run-by-tre-cli'] ? 'tre import-files' : 'tre-cli-import-files'
  if (argv.help) {
    console.error(require('./help')(bin))
    process.exit(0)
  } else {
    console.error('Missing argument\nUsage: ' + require('./usage')(bin))
    process.exit(1)
  }
}

if (!path) {
  console.error('.trerc not found')
  process.exit(1)
}

const keys = ssbKeys.loadSync(join(path, '../.tre/secret'))

const sourceFile = resolve(argv._[0])
debug('source: %s', sourceFile)
const sourcePath = dirname(sourceFile)
debug('source path %s:', sourcePath)
let pkg = JSON.parse(fs.readFileSync(sourceFile))
pkg = pkg['tre-import'] || pkg

ssbClient(conf.caps.shs, keys, (err, ssb) => {
  function bail(err) {
    if (err) {
      console.error(err.message)
      if (ssb) ssb.close(()=>process.exit(1))
      else process.exit(1)
    }
  }
  bail(err)

  run(ssb, conf, sourcePath, pkg, argv, (err, newConfig) => {
    bail(err)
    console.log(JSON.stringify(newConfig, null, 2))
    ssb.close(()=>{
      process.exit(0)
    })
  })
})
