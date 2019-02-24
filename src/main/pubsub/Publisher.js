'use strict'

const MissingRequiredArgumentError = require('@scispike/nodejs-support').errors.MissingRequiredArgumentError
const IllegalArgumentError = require('@scispike/nodejs-support').errors.IllegalArgumentError

/**
 * Publishes Google PubSub messages to a topic, optionally with a message transformer.
 */
class Publisher {
  /**
   * Constructs.
   * @param {object} topic The Google PubSub topic.
   * @param {function} [transformer] Optional message transformation function that returns a `Buffer` containing the message.
   */
  constructor ({ topic, transformer } = {}) {
    this.topic = topic
    this.transformer = transformer || Publisher.DEFAULT_TRANSFORMER
  }

  /**
   * Publishes the given message with the given optional attributes using the given optional transformer.
   * @param {*} message The message to publish.
   * @param {object} attributes Optional attributes with exclusively string values.
   * @param {function} transformer Optional message transformer that returns a `Buffer` containing the message.
   * Defaults to `Publisher.DEFAULT_TRANSFORMER`.
   * @return {Promise<*>}
   */
  async publish ({ message, attributes, transformer } = {}) {
    if (!message) throw new MissingRequiredArgumentError({ msg: 'message' })
    attributes = attributes || undefined

    transformer = (transformer && this._testSetTransformer(transformer)) || this._transformer

    return this._topic.publish(transformer(message), attributes)
  }

  get topic () {
    return this._topic
  }

  _testSetTopic (topic) {
    if (!topic) throw MissingRequiredArgumentError({ msg: 'topic' })
    if (typeof topic !== 'object') throw new IllegalArgumentError({ msg: 'topic' })
    return topic
  }

  set topic (topic) {
    this._topic = this._testSetTopic(topic)
  }

  withTopic (topic) {
    this.topic = topic
    return this
  }

  get transformer () {
    return this._transformer
  }

  _testSetTransformer (transformer) {
    if (!transformer) throw MissingRequiredArgumentError({ msg: 'topic' })
    if (typeof transformer !== 'object') throw new IllegalArgumentError({ msg: 'topic' })
    return transformer
  }

  set transformer (transformer) {
    this._transformer = this._testSetTransformer(transformer)
  }

  withTransformer (transformer) {
    this.transformer = transformer
    return this
  }
}

/**
 * Default message transformation function.
 * Returns a `Buffer` of the JSON-stringified message.
 * @param {*} message The message.
 * @return {Buffer}
 */
Publisher.DEFAULT_TRANSFORMER = message => Buffer.from(JSON.stringify(message))

module.exports = Publisher
