'use strict'

const _ = require('lodash')
const { Trait } = require('mutrait')

const { Enum } = require('enumify')
const moment = require('moment-timezone')
const { Timestamp } = require('@google-cloud/firestore')
const uuid = require('uuid/v4')

const ObjectNotFoundError = require('@scispike/nodejs-support').errors.ObjectNotFoundError
const ObjectExistsError = require('@scispike/nodejs-support').errors.ObjectNotFoundError
const IllegalArgumentError = require('@scispike/nodejs-support').errors.IllegalArgumentError
const MethodNotImplementedError = require('@scispike/nodejs-support').errors.MethodNotImplementedError

const Period = require('../entities/Period')
const DatePeriod = require('../entities/DatePeriod')

const FirestoreRepository = Trait(s => class extends s {
  _db
  _name
  _collection
  _path

  constructor (...args) {
    super(...args)
    this._mapperCache = {}
    this._bindMethods()
  }

  _bindMethods (target) {
    target = target || this

    this._toMoment = this._toMoment.bind(target)
    this._toTimestamp = this._toTimestamp.bind(target)
  }

  _getMapper (mapper, name) {
    name = name || mapper.name
    return this._mapperCache[name] || (this._mapperCache[name] = ({ key, from, getterPrefix }) => {
      const value = from[`${getterPrefix}${key}`]
      if (value === undefined) return value
      return Array.isArray(value) ? [...value.map(mapper)] : mapper(value)
    })
  }

  _noOpMapper () {
    return this._getMapper(it => it, 'noop')
  }

  _toMomentMapper () {
    return this._getMapper(it => this._toMoment(it), 'moment')
  }

  _toStringMapper () {
    return this._getMapper(it => it?.toString(), 'string')
  }

  _toFloatMapper () {
    return this._getMapper(it => parseFloat(it), 'float')
  }

  _toIntMapper () {
    return this._getMapper(it => parseInt(it), 'int')
  }

  _toBooleanMapper () {
    return this._getMapper(it => Boolean(it), 'boolean')
  }

  _toEnumMapper ({ enumeration }) {
    return this._getMapper(enumeration.of, `enum:${enumeration.name}`)
  }

  _initFirestoreRepository (db, name) {
    this._db = db
    this._name = name
    this._collection = this._db.collection(name)
    this._path = this._collection.path
  }

  async insert (entity, options) {
    if (await this.findById(entity.id)) {
      throw new ObjectExistsError(`${entity.constructor?.name}@${entity.id}`)
    }
    return this.upsert(entity, options)
  }

  async upsert (entity, options) {
    if (!entity._id) entity._id = uuid()
    return this._tryAsync(async () => this._collection.doc(entity._id).set(this._toDocument(entity), options || this._setOptions))
  }

  async findById (id) {
    if (!id) return null

    return this._tryAsync(async () => {
      const snapshot = await this._db.doc(this._docpath(id)).get()
      return snapshot.exists && this._fromDocument({ plain: snapshot.data(), setterPrefix: '_', getterPrefix: '_' })
    })
  }

  async getById (id) {
    const it = await this.findById(id)
    if (!it) throw new ObjectNotFoundError(this._docpath(id))
  }

  _docpath (...it) {
    return [this._path, ...it].join('/')
  }

  /**
   * The customizer function to use when {@link _toTree} calls lodash's `cloneDeepWith` function.
   *
   * This default customizer returns a function that only
   * <ul>
   * <li>converts `enumify` `Enum` instances to their symbolic name,</li>
   * <li>converts `Date` and `moment` instances to `firebase.firestore.Timestamp`</li>
   * </ul>
   * If you need more sophisticated behavior, either override this method or override {@link _toTree}.
   *
   * @returns {*}
   * @private
   */
  get _toTreeCustomizer () {
    return it => {
      // remember: only return something if you're converting it!
      // see https://github.com/lodash/lodash/issues/2846

      if (it instanceof Enum) return it.name
      if (moment.isMoment(it)) return Timestamp.fromMillis(it.valueOf())
      if (it instanceof Date) return Timestamp.fromDate(it)
      if (it instanceof Timestamp) return it
    }
  }

  /**
   * Returns the given argument as a Google Firestore `Timestamp`.
   * See https://firebase.google.com/docs/reference/js/firebase.firestore.Timestamp for more info.
   *
   * @param it {number|Timestamp|Date|moment}
   * @return {Timestamp}
   * @private
   */
  _toTimestamp (it) {
    if (it instanceof Timestamp) it = it.toMillis()
    else if (moment.isMoment(it)) it = it.valueOf()
    else if (it instanceof Date) it = it.getTime()

    try {
      return Timestamp.fromMillis(it)
    } catch (e) {
      throw new IllegalArgumentError({ msg: it })
    }
  }

  /**
   * Returns the given argument as a UTC `moment` instance.
   * See http://momentjs.com/docs/#/parsing/ for supported argument types.
   * This method has explicit support for Google Firestore `Timestamp` types.
   * If you don't need `Timestamp` support, just use `moment(it).utc()`, because that's all this method does after
   * converting the `Timestamp` to milliseconds.
   * See https://firebase.google.com/docs/reference/js/firebase.firestore.Timestamp for more info.
   *
   * @param it {*}
   * @returns {moment}
   * @private
   */
  _toMoment (it) {
    if (!it) return it
    if (this._isTimestampLike(it, false)) it = this._fromTimestampDocument(it)
    if (it instanceof Timestamp) it = it.toMillis()

    const m = moment.utc(it)
    if (!m.isValid()) throw new IllegalArgumentError(it)

    return m
  }

  _fromTimestampDocument (plain) {
    return plain && new Timestamp(plain._seconds, plain._nanoseconds)
  }

  _isTimestampLike (it, valueIfInstanceOf) {
    if (it instanceof Timestamp) return valueIfInstanceOf
    return typeof it?._seconds === 'number' && typeof it?._nanoseconds === 'number'
  }

  /**
   * Returns a new {@link Period} instance from the given period document, which uses {@link Timestamp}s.
   *
   * @param plain
   * @param context
   * @return {Period}
   * @private
   */
  _fromPeriodDocument ({ plain, entity = new Period(), context = {}, setterPrefix = '' } = {}) {
    if (!plain) return entity

    return this._mapProps({
      keys: ['begin', 'end'],
      from: plain,
      to: entity,
      setterPrefix,
      getterPrefix: '_',
      mappers: this._toMomentMapper()
    })
  }

  /**
   * Returns a new {@link DatePeriod} instance from the given period document, which uses {@link Timestamp}s.
   *
   * @param plain
   * @param context
   * @return {DatePeriod}
   * @private
   */
  _fromDatePeriodDocument ({ plain, entity = new DatePeriod(), context = {}, setterPrefix = '' } = {}) {
    return this._fromPeriodDocument({ plain, entity, context, setterPrefix })
  }

  /**
   * Returns a plain JavaScript object of the period with {@link Timestamp}s instead of `moment`s.
   *
   * @param period
   * @param context
   * @return {{_begin: Timestamp, _end: Timestamp}}
   * @private
   */
  _toPeriodDocument (period, context) {
    const result = {
      _type: period.constructor.name
    }
    if (period._begin) {
      result._begin = period._begin && this._toTimestamp(period._begin)
    }
    if (period._end) {
      result._end = period._end && this._toTimestamp(period._end)
    }
    return result
  }
  /**
   * Converts the given entity graph into a tree structure.
   * This method is called by {@link _toDocument}.
   *
   * Subclasses must override this if the root entity of this repository type forms a graph.
   * If the root entity only forms a tree, this method can probably be used.
   * This default implementation uses {@link _toTreeCustomizer}.
   *
   * @param entity
   * @returns {any}
   * @private
   * @see _toTreeCustomizer
   * @see _toDocument
   */
  _toTree (entity) {
    return _.cloneDeepWith(entity, this._toTreeCustomizer)
  }

  /**
   * Converts the given entity into a plain, JavaScript object suitable for persistence into Firestore.
   * Objects of type `Timestamp` are preserved unchanged.
   *
   * @param it
   * @return {*}
   */
  _toFirestoreDocument (it) {
    if (typeof it === 'function') throw new IllegalArgumentError(`functions cannot be converted to a Firestore document`)
    if (it instanceof Timestamp) return it
    if (Array.isArray(it)) return it.map(it => this._toFirestoreDocument(it))
    if (it instanceof Period || it instanceof DatePeriod) {
      return this._toPeriodDocument(it)
    }

    if (typeof it === 'object') {
      return Object.keys(it)
        .filter(k => (typeof it[k] !== 'function') && (it[k] !== undefined))
        .map(k => ({ [k]: this._toFirestoreDocument(it[k]) }))
        .reduce((accum, next) => Object.assign(accum, next), {})
    }

    return it
  }

  /**
   * Extracts the persistable state of the given entity into a plain JavaScript tree structure, representing the document that will be stored.
   * This method calls {@link _toTree} before extracting the persistable state.
   *
   * @param entity
   * @returns {*}
   * @private
   * @see _toTree
   */
  _toDocument (entity) {
    const doc = this._toFirestoreDocument(this._toTree(entity))
    return doc
  }

  _fromDocument ({ plain, entity, context = {}, setterPrefix = '' } = {}) {
    throw new MethodNotImplementedError('FirestoreRepository#_fromDocument')
  }

  /**
   * Maps top-level properties (nonrecursively) from one object to another, optionally with a single custom mapping function or mapping functions by property name.
   *
   * @param {string|[string]} [keys] Optional key or keys to map; defaults to `Object.keys(from)`.
   * @param {*} [from] Optional object from which to map properties; defaults to `{}`.
   * @param {*} [to] Optional object to which to map properties; defaults to `{}`.
   * @param {string} [setterPrefix] Optional property setter prefix to use when setting properties on {@param to}; defaults to the empty string (`''`).
   * @param {string} [getterPrefix] Optional property getter prefix to use when getting properties from {@param from}; defaults to the empty string (`''`).
   * @param {function|{ string: function }} [mappers] Optional property conversion function, or functions by property name; defaults to the identity mapping with array copying if the source property is an array.
   * @return {*} The object mapped {@param to}.
   * @private
   */
  _mapProps ({
    keys,
    from,
    to,
    setterPrefix,
    getterPrefix,
    mappers
  } = {}) {
    from = from || {}
    to = to || {}
    setterPrefix = setterPrefix || ''
    getterPrefix = getterPrefix || ''

    keys = keys || Object.keys(from)
    if (!Array.isArray(keys)) keys = [keys]

    return keys.reduce((accum, key) => {
      let map = (mappers && mappers[key]) || mappers

      let e
      if (Array.isArray(map?.enumValues) && typeof map?.enumValues[0] === 'object') {
        // then map is a reference to an enum class
        e = map
        map = this._toEnumMapper({ key, from, enumeration: e })
      } else if (typeof map !== 'function') {
        // then map's either undefined or an object of mappers that doesn't apply to given key, so use default
        map = this._noOpMapper({ key, from })
      }

      const value = map({ key, from, getterPrefix, enumeration: e, to })
      if (value !== undefined) to[`${setterPrefix}${key}`] = value

      return accum
    }, to)
  }

  /**
   * Returns the given name prefixed by the given prefix.
   *
   * @param {string} name
   * @param {string} prefix
   * @return {string}
   * @private
   */
  _prop (name, prefix = '') {
    return `${prefix}${name}`
  }

  /**
   * Returns the array among the given arrays that is the array with the greatest `length`.
   *
   * @param {[*]} arrays
   * @return {[*]}
   * @private
   */
  _getLargestArrayAmong (...arrays) {
    return (arrays || []).reduce((accum, next) => {
      if (accum) {
        if (next) {
          return accum.length >= next.length ? accum : next
        }
        return accum
      }
      if (next) return next
      return accum
    }, undefined)
  }

  /**
   * Given a collection of arrays, makes the length of all arrays the same length as the largest array among them.
   * Newly created array elements are explicitly given the value `undefined` so that they appear when `map`ping.
   *
   * @param {[[*]]} arrays A collection of arrays.
   * @private
   */
  _growAllArraysToLargestAmong (...arrays) {
    if (arrays.length === 0) return
    const length = this._getLargestArrayAmong(...arrays)?.length
    if (!length) return

    arrays.forEach(it => {
      if (!it) return
      const origLength = it.length
      it.length = length
      // ensure that any new elements show up when iterating via map, forEach, etc
      it.fill(undefined, origLength)
    })
  }

  get _setOptions () {
    return DEFAULT_SET_OPTIONS
  }

  _translateError (e) {
    return e // TODO: translate exception into datastore-agnostic error
  }

  _trySync (it) {
    try {
      return it()
    } catch (x) {
      throw this._translateError(x)
    }
  }

  async _tryAsync (it) {
    try {
      return await it()
    } catch (x) {
      throw this._translateError(x)
    }
  }
})

const DEFAULT_SET_OPTIONS = FirestoreRepository.DEFAULT_SET_OPTIONS = Object.freeze({ merge: true })

module.exports = FirestoreRepository
