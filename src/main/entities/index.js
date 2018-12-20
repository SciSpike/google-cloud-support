'use strict'

const fs = require('fs')

const RX = /^(\w+)\.js$/

module.exports = fs.readdirSync(__dirname)
  .reduce((accum, file) => {
    if (__filename.endsWith(file)) return accum // skip this file

    const matches = RX.exec(file)
    if (!matches) return accum

    accum[matches[1]] = require(`./${file}`)

    return accum
  }, {})
