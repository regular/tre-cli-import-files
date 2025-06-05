const traverse = require('traverse')
const debug = require('debug')('causal-sort')

module.exports = function causalSort(messages) {
  const pointers = {} // maps a msgid to a set of referenced messages
  const allKeys = Object.keys(messages)
  debug('all keys: %O', allKeys)
  for (const key of allKeys) {
    traverse(messages[key]).forEach(x => {
      if (typeof x == 'string' && x[0] == '%') {
        // is this a reference to another message in our soup?
        const name = x.substr(1)
        if (allKeys.includes(name)) {
          debug('Found pointer from %s to %s', key, name)
          const s = pointers[key] || new Set()
          s.add(name)
          pointers[key] = s
        }
      }
    })
  }

  debug('Pointers: %O', pointers)

  let list = []
  Object.entries(messages).forEach( ([key, value])=>{
    list.push({key, value})
  })

  let result
  do {
    result = sortList(list, pointers)
    list = result[0]
  } while(result[1])

  return list
}

function sortList(kv, pointers) {
  let did_move = false
  // for each element in the list, we make sure that
  // every object it points to is higher up in the list
  // We do this by simply pushing all referenced objects right in front of us
  const allKeys = kv.map( x=>x.key )
  for(const key of allKeys) {
    const i = kv.findIndex(x=>x.key == key)
    if (i == -1) throw new Error("Can't find msg!?")
    const head = kv.slice(0, i)
    let tail = (i == kv.length - 1) ? [] : kv.slice(i+1)
    debug('found %s at index %d, head=%O, tail=%O', key, i, Object.keys(head), Object.keys(tail))
    // We move all referenced messages that we find in tail to the end of head
    for(const p of Array.from(pointers[key] || [])) {
      const i = tail.findIndex(x=> x.key == p)
      if (i == -1) continue
      debug('Moving %s to head', tail[i].key)
      did_move = true
      head.push(tail[i])
      delete tail[i]
      tail = tail.filter(x=>x)
    }
    kv = head.concat([kv[i]]).concat(tail)
  }
  return [kv, did_move]
}
