import axios from 'axios'
import { isObject } from '../helpers'
import * as validate from '../types/validate'
import { isInstanceofOfNewMessage } from '../types/message'

const ATTEMPTS = 10
const ATTEMPT_TIMEOUT = 500

/**
 * Send transaction to the blockchain
 * @param {string} transactionEndpoint
 * @param {string} explorerBasePath
 * @param {Object} data
 * @param {string} signature
 * @param {NewMessage} type
 * @return {Promise}
 */
export function send (transactionEndpoint, explorerBasePath, data, signature, type) {
  if (typeof transactionEndpoint !== 'string') {
    throw new TypeError('Transaction endpoint of wrong data type is passed. String is required.')
  }
  if (typeof explorerBasePath !== 'string') {
    throw new TypeError('Explorer base path endpoint of wrong data type is passed. String is required.')
  }
  if (!isObject(data)) {
    throw new TypeError('Data of wrong data type is passed. Object is required.')
  }
  if (!validate.validateHexadecimal(signature, 64)) {
    throw new TypeError('Signature of wrong type is passed. Hexadecimal expected.')
  }
  if (!isInstanceofOfNewMessage(type)) {
    throw new TypeError('Transaction of wrong type is passed.')
  }

  type.signature = signature
  const hash = type.hash(data)

  return axios.post(transactionEndpoint, {
    protocol_version: type.protocol_version,
    service_id: type.service_id,
    message_id: type.message_id,
    body: data,
    signature: signature
  }).then(() => {
    let count = ATTEMPTS

    return (function attempt () {
      return axios.get(`${explorerBasePath}${hash}`).then(response => {
        if (response.data.type === 'committed') {
          return response.data
        }
        if (response.data.type === 'in-pool') {
          if (--count > 0) {
            return new Promise((resolve) => {
              setTimeout(resolve, ATTEMPT_TIMEOUT)
            }).then(attempt)
          }
          throw new Error('Transaction has not been accepted to the blockchain.')
        } else {
          if (response.data.type === 'unknown') {
            throw new Error('Unknown transaction has been passed.')
          }
          throw new Error('Unexpected format of transaction explorer response.')
        }
      })
    })()
  })
}

/**
 * Send transaction to the blockchain
 * @param {string} transactionEndpoint
 * @param {string} explorerBasePath
 * @param {Array} transactions
 * @return {Promise}
 */
export function sendQueue (transactionEndpoint, explorerBasePath, transactions) {
  let index = 0
  let responses = []

  return (function shift () {
    let transaction = transactions[index++]

    return send(transactionEndpoint, explorerBasePath, transaction.data, transaction.signature, transaction.type).then(response => {
      responses.push(response)
      if (index < transactions.length) {
        return shift()
      } else {
        return responses
      }
    })
  })()
}
