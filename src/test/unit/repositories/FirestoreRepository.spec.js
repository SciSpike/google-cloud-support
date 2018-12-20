/* global describe, it, beforeEach */

'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const { trait } = require('mutrait')
const FirestoreRepository = require('../../../main/repositories/FirestoreRepository')
const DayOfWeek = require('../../../main/entities/DayOfWeek')

const dbMock = {
  collection: () => {
    return { path: '/fakes' }
  }
}

class FakeRepository extends trait(FirestoreRepository) {
  constructor (db) {
    super(...arguments)
    this._initFirestoreRepository(db, 'fakes')
  }
}

describe('unit tests of FirestoreRepository trait', () => {
  let repo

  beforeEach(function () {
    repo = new FakeRepository(dbMock)
  })

  it('should map basic properties correctly', () => {
    const getterPrefix = ''
    const setterPrefixes = ['', '_']
    let sets = 0

    setterPrefixes.forEach(setterPrefix => {
      let from = {
        string: 's',
        number: 1,
        boolean: true
      }

      let to = repo._mapProps({ from, setterPrefix, getterPrefix })
      expect(to[repo._prop('string', setterPrefix)]).to.equal(from.string)
      expect(to[repo._prop('number', setterPrefix)]).to.equal(from.number)
      expect(to[repo._prop('boolean', setterPrefix)]).to.equal(from.boolean)

      from = {
        array: [1, 2, 3]
      }
      to = repo._mapProps({ from,
        setterPrefix,
        getterPrefix,
        mappers: ({ key, from }) => [...from[`${getterPrefix}${key}`]]
      })
      expect(to[repo._prop('array', setterPrefix)]).to.deep.equal(from.array)
      let origArray = [...from.array]
      for (let i = 0; i < from.array.length; i++) from.array[i]++
      expect(to[repo._prop('array', setterPrefix)]).to.deep.equal(origArray)

      from = {
        nested: {
          value: 'nested'
        }
      }
      let mappers = ({ key, from: object }) => ({ value: object[`${getterPrefix}${key}`].value })
      to = repo._mapProps({ from, setterPrefix, getterPrefix, mappers })
      let origValue = from.nested.value
      expect(to[repo._prop('nested', setterPrefix)].value).to.equal(from.nested.value)
      from.nested.value += 'x'
      expect(to[repo._prop('nested', setterPrefix)].value).to.equal(origValue)

      from = {
        enumeration: 2,
        enumerations: ['MONDAY', 3]
      }
      mappers = DayOfWeek
      to = repo._mapProps({ from, setterPrefix, getterPrefix, mappers })
      expect(to[repo._prop('enumeration', setterPrefix)]).to.equal(DayOfWeek.of(from.enumeration))
      expect(to[repo._prop('enumerations', setterPrefix)]).to.deep.equal(from.enumerations.map(DayOfWeek.of))

      from = {
        enumeration: 2,
        enumerations: ['MONDAY', 3]
      }
      mappers = {
        enumeration: DayOfWeek,
        enumerations: DayOfWeek
      }
      to = repo._mapProps({ from, setterPrefix, getterPrefix, mappers })
      expect(to[repo._prop('enumeration', setterPrefix)]).to.equal(DayOfWeek.of(from.enumeration))
      expect(to[repo._prop('enumerations', setterPrefix)]).to.deep.equal(from.enumerations.map(DayOfWeek.of))

      from = {
        string: 's',
        number: 1,
        boolean: true,
        array: [1, 2, 3],
        nested: {
          value: 'nested'
        },
        enumeration: 2,
        enumerations: ['MONDAY', 3]
      }

      class To {
        get string () {
          return this._string
        }
        set string (value) {
          sets++
          this._string = value
        }
      }

      to = repo._mapProps({
        from,
        to: new To(),
        setterPrefix,
        getterPrefix,
        mappers: {
          nested: ({ key, from: object }) => ({ value: object[`${getterPrefix}${key}`].value }),
          enumeration: DayOfWeek,
          enumerations: DayOfWeek
        }
      })
      expect(to[repo._prop('string', setterPrefix)]).to.equal(from.string)
      expect(to.string).to.equal(from.string)
      expect(to._string).to.equal(from.string)
      expect(to[repo._prop('number', setterPrefix)]).to.equal(from.number)
      expect(to[repo._prop('boolean', setterPrefix)]).to.equal(from.boolean)
      expect(to[repo._prop('array', setterPrefix)]).to.deep.equal(from.array)
      origArray = [...from.array]
      for (let i = 0; i < from.array.length; i++) from.array[i]++
      expect(to[repo._prop('array', setterPrefix)]).to.deep.equal(origArray)
      origValue = from.nested.value
      expect(to[repo._prop('nested', setterPrefix)].value).to.equal(from.nested.value)
      from.nested.value += 'x'
      expect(to[repo._prop('nested', setterPrefix)].value).to.equal(origValue)
      expect(to[repo._prop('array', setterPrefix)]).to.deep.equal(origArray)
      expect(sets).to.equal(1)
      expect(to[repo._prop('enumeration', setterPrefix)]).to.equal(DayOfWeek.of(from.enumeration))
      expect(to[repo._prop('enumerations', setterPrefix)]).to.deep.equal(from.enumerations.map(DayOfWeek.of))
    })
  })

  it('should return largest array', () => {
    expect(repo._getLargestArrayAmong()).to.equal(undefined)

    let a = []
    let b = [1]
    expect(repo._getLargestArrayAmong(a, b)).to.equal(b)

    a = [1]
    b = []
    expect(repo._getLargestArrayAmong(a, b)).to.equal(a)

    a = undefined
    b = []
    expect(repo._getLargestArrayAmong(a, b)).to.equal(b)

    a = []
    b = undefined
    expect(repo._getLargestArrayAmong(a, b)).to.equal(a)

    a = undefined
    b = undefined
    expect(repo._getLargestArrayAmong(a, b)).to.equal(undefined)
  })

  it('should grow arrays to largest', () => {
    let a = [1]
    let b = [1, 2]
    repo._growAllArraysToLargestAmong(a, b)
    expect(a.length).to.equal(2)
    expect(a[0]).to.equal(1)
    expect(a[1]).to.equal(undefined)
    expect(a.map(it => it)).to.deep.equal([1, undefined])
    expect(b.length).to.equal(2)

    a = [1]
    b = []
    repo._growAllArraysToLargestAmong(a, b)
    expect(a.length).to.equal(1)
    expect(b.length).to.equal(1)
    expect(b[0]).to.equal(undefined)

    a = undefined
    b = [1]
    repo._growAllArraysToLargestAmong(a, b)
    expect(a).to.equal(undefined)
    expect(b.length).to.equal(1)

    a = [1]
    b = undefined
    repo._growAllArraysToLargestAmong(a, b)
    expect(a.length).to.equal(1)
    expect(b).to.equal(undefined)

    a = undefined
    b = undefined
    repo._growAllArraysToLargestAmong(a, b)
    expect(a).to.equal(undefined)
    expect(b).to.equal(undefined)
  })
})
