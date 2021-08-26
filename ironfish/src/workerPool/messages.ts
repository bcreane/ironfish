/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BoxMessageRequest, BoxMessageResponse } from './tasks/boxMessage'
import { CreateMinersFeeRequest, CreateMinersFeeResponse } from './tasks/createMinersFee'
import { CreateTransactionRequest, CreateTransactionResponse } from './tasks/createTransaction'
import { MineHeaderRequest, MineHeaderResponse } from './tasks/mineHeader'
import { SleepRequest, SleepResponse } from './tasks/sleep'
import { TransactionFeeRequest, TransactionFeeResponse } from './tasks/transactionFee'
import { UnboxMessageRequest, UnboxMessageResponse } from './tasks/unboxMessage'
import { VerifyTransactionRequest, VerifyTransactionResponse } from './tasks/verifyTransaction'

/**
 * Request and response message types used for communication
 * between the worker pool and workers.
 */

export type JobAbortRequest = {
  type: 'jobAbort'
}

export type JobErrorResponse = {
  type: 'jobError'
  error: unknown
}

export type WorkerRequestMessage = {
  requestId: number
  body: WorkerRequest
}

export type WorkerResponseMessage = {
  requestId: number
  body: WorkerResponse
}

export type WorkerRequest =
  | CreateMinersFeeRequest
  | CreateTransactionRequest
  | TransactionFeeRequest
  | VerifyTransactionRequest
  | BoxMessageRequest
  | UnboxMessageRequest
  | MineHeaderRequest
  | SleepRequest
  | JobAbortRequest

export type WorkerResponse =
  | CreateMinersFeeResponse
  | CreateTransactionResponse
  | TransactionFeeResponse
  | VerifyTransactionResponse
  | BoxMessageResponse
  | UnboxMessageResponse
  | MineHeaderResponse
  | SleepResponse
  | JobErrorResponse
