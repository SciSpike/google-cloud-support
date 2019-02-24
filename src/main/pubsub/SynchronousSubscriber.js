'use strict'

const EventEmitter = require('events')
const moment = require('moment-timezone')
const MissingRequiredArgumentError = require('@scispike/nodejs-support').errors.MissingRequiredArgumentError
const IllegalArgumentError = require('@scispike/nodejs-support').errors.IllegalArgumentError

/**
 * Uses Google PubSub synchronous pull to retrieve messages and optionally call a given message handler function.
 *
 * This class extends `EventEmitter` for convenience, with the following events:
 * * `willListen` with no arguments
 * * `willPull` with the given or current request & options
 * * `didPull` with the given or current request & options, along with the response & timing
 * * `message` with the message for each message received
 * * `willUnlisten` with no arguments
 * * `didUnlisten` with no arguments
 * * `error` with an Error upon any error
 *
 * When handling the `error` event, ensure that your code doesn't throw.
 *
 * The `unlisten` method simply sets a flag to exit the listening loop upon its next iteration, not immediately.
 */
class SynchronousSubscriber extends EventEmitter {
  /**
   * Constructs.
   * @param {object} subscriberClient The Google PubSub subscriber client.
   * @param {object} requestConfig A subscriber client pull request object with, at minimum, the fully qualified subscription name:  `projects/{project}/subscriptions/{sub}`.
   * See https://cloud.google.com/nodejs/docs/reference/pubsub/0.23.x/v1.SubscriberClient#pull.
   * @param optionsConfig A subscriber client pull options object.
   * See https://googleapis.github.io/gax-nodejs/global.html#CallOptions
   * @param {function} [messageHandler] An optional function to which each message will be given after pulling.
   */
  constructor ({ subscriberClient, requestConfig, optionsConfig, messageHandler } = {}) {
    super(...arguments)
    this.subscriberClient = subscriberClient
    this.requestConfig = requestConfig
    this.optionsConfig = optionsConfig
    this.messageHandler = messageHandler

    this._listening = false
  }

  /**
   * Pulls messages and, for each message received, optionally calls a message handler, if given.
   *
   * @param {object} [request] Optional pull request object.
   * Defaults to `this.requestConfig`.
   * See https://cloud.google.com/nodejs/docs/reference/pubsub/0.23.x/v1.SubscriberClient#pull
   * @param {object} [options] Optional pull options object.
   * Defaults to `this.optionsConfig`.
   * See https://googleapis.github.io/gax-nodejs/global.html#CallOptions
   * @param {function} [messageHandler] Optional message handler function.
   * Defaults to `this.messageHandler`.
   */
  listen ({ request, options, messageHandler } = {}) {
    if (this._listening) return

    this._listening = true
    this._try(() => this.emit('willListen'))

    request = (request && this._testSetRequestConfig(request)) || this.requestConfig
    options = (options && this._testSetOptionsConfig(options)) || this.optionsConfig

    while (this._listening) {
      const timing = { begin: moment().utc() }

      const pull = async () => {
        messageHandler = (messageHandler && this._testSetMessageHandler(messageHandler)) || this._messageHandler

        this._try(() => this.emit('willPull', { request, options }))

        const [response] = await this.subscriberClient.pull(request, options)

        timing.end = moment().utc()
        timing.elapsed = timing.end.diff(timing.begin)
        this._try(() => this.emit('didPull', { request, options, response, timing }))

        response.receivedMessages.forEach(message => {
          if (messageHandler) this._try(() => messageHandler(message))
          this._try(this.emit('message', message))
        })
      }

      this._try(pull)
    }

    this._try(() => this.emit('didUnlisten'))
  }

  /**
   * Causes message pulling to stop after the next pull.
   */
  unlisten () {
    if (!this._listening) return

    this._try(() => this.emit('willUnlisten'))
    this._listening = false
  }

  get listening () {
    return this._listening
  }

  get subscriberClient () {
    return this._subscriberClient
  }

  _testSetSubscriberClient (subscriberClient) {
    if (!subscriberClient) throw new MissingRequiredArgumentError({ msg: 'subscriberClient' })
    if (typeof subscriberClient !== 'object') throw new IllegalArgumentError({ msg: 'subscriberClient' })
    return subscriberClient
  }

  set subscriberClient (subscriberClient) {
    this._subscriberClient = this._testSetSubscriberClient(subscriberClient)
  }

  withSubscriberClient (subscriberClient) {
    this.subscriberClient = subscriberClient
    return this
  }

  get requestConfig () {
    return { ...this._requestConfig }
  }

  _testSetRequestConfig (requestConfig) {
    requestConfig = { ...SynchronousSubscriber.DEFAULT_REQUEST_CONFIG, requestConfig }
    if (!this.requestConfig.subscription) throw new MissingRequiredArgumentError({ msg: 'requestConfig.subscription' })
    if (typeof this.requestConfig.subscription !== 'object') throw new MissingRequiredArgumentError({ msg: 'requestConfig.subscription' })
    return { ...requestConfig }
  }

  set requestConfig (requestConfig) {
    this._requestConfig = this._testSetRequestConfig(requestConfig)
  }

  withRequestConfig (requestConfig) {
    this.requestConfig = requestConfig
    return this
  }

  get optionsConfig () {
    return { ...this._optionsConfig }
  }

  _testSetOptionsConfig (optionsConfig) {
    if (!optionsConfig) return undefined
    if (typeof optionsConfig !== 'object') throw new IllegalArgumentError({ msg: 'optionsConfig' })
    return optionsConfig
  }

  set optionsConfig (optionsConfig) {
    this._optionsConfig = this._testSetOptionsConfig(optionsConfig)
  }

  withOptionsConfig (optionsConfig) {
    this.optionsConfig = optionsConfig
    return this
  }

  get messageHandler () {
    return this._messageHandler
  }

  _testSetMessageHandler (messageHandler) {
    if (messageHandler && typeof messageHandler !== 'function') throw new IllegalArgumentError({ msg: 'messageHandler' })
    return messageHandler
  }

  set messageHandler (messageHandler) {
    messageHandler = this._testSetMessageHandler(messageHandler)
    if (messageHandler) this._messageHandler = messageHandler
    else delete this._messageHandler
  }

  withMessageHandler (messageHandler) {
    this.messageHandler = messageHandler
    return this
  }

  _try (fn) {
    try {
      return fn()
    } catch (e) {
      this.emit('error', e)
    }
  }
}

SynchronousSubscriber.DEFAULT_MAX_MESSAGES = 10
SynchronousSubscriber.DEFAULT_RETURN_IMMEDIATELY = false
SynchronousSubscriber.DEFAULT_REQUEST_CONFIG = {
  maxMessages: SynchronousSubscriber.DEFAULT_MAX_MESSAGES,
  returnImmediately: SynchronousSubscriber.DEFAULT_RETURN_IMMEDIATELY
}
SynchronousSubscriber.DEFAULT_MESSAGE_TRANSFORMER = JSON.parse

module.exports = SynchronousSubscriber
