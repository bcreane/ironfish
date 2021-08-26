/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PromiseReject, PromiseResolve, PromiseUtils } from '../utils'
import { JobAbortedError } from './errors'
import { WorkerRequestMessage, WorkerResponse, WorkerResponseMessage } from './messages'
import { handleRequest } from './tasks'
import { Worker } from './worker'

export class Job {
  id: number
  request: WorkerRequestMessage
  worker: Worker | null
  status: 'waiting' | 'executing' | 'success' | 'error' | 'aborted'
  promise: Promise<WorkerResponseMessage> | null
  resolve: PromiseResolve<WorkerResponseMessage> | null
  reject: PromiseReject | null

  constructor(request: WorkerRequestMessage) {
    this.id = request.requestId
    this.request = request
    this.worker = null
    this.status = 'waiting'
    this.promise = null
    this.resolve = null
    this.reject = null
  }

  abort(): void {
    if (this.status !== 'waiting' && this.status !== 'executing') {
      return
    }

    this.status = 'aborted'

    if (this.worker) {
      this.worker.send({ requestId: this.id, body: { type: 'jobAbort' } })
      this.worker.jobs.delete(this.id)
    }

    if (this.reject) {
      this.reject(new JobAbortedError())
    }
  }

  execute(worker: Worker | null = null): void {
    this.status = 'executing'

    const [promise, resolve, reject] = PromiseUtils.split<WorkerResponseMessage>()

    this.promise = promise
    this.resolve = resolve
    this.reject = reject
    this.worker = worker
    this.status = 'executing'

    if (worker) {
      worker.send(this.request)
      return
    }

    void handleRequest(this.request, this)
      .then((r) => {
        if (this.status !== 'aborted') {
          this.status = 'success'
          this.resolve?.(r)
        }
      })
      .catch((e) => {
        if (this.status !== 'aborted') {
          this.status = 'error'
          this.reject?.(e)
        }
      })
  }

  async response(): Promise<WorkerResponse> {
    const response = await this.promise

    if (response === null || response.body.type !== this.request.body.type) {
      throw new Error(
        `Response type must match request type: ${String(response?.body.type)}, ${
          this.request.body.type
        } as ${this.status}`,
      )
    }

    return response.body
  }
}
