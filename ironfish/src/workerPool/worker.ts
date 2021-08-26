/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { WorkerRequestMessage, WorkerResponseMessage } from './messages'
import { generateKey } from 'ironfish-wasm-nodejs'
import { MessagePort, parentPort, Worker as WorkerThread } from 'worker_threads'
import { Assert } from '../assert'
import { createRootLogger, Logger } from '../logger'
import { Job } from './job'
import { handleRequest } from './tasks'

export class Worker {
  thread: WorkerThread | null = null
  parent: MessagePort | null = null
  path: string
  jobs: Map<number, Job>
  maxJobs: number
  started: boolean
  logger: Logger

  get executing(): boolean {
    return this.jobs.size > 0
  }

  get canTakeJobs(): boolean {
    return this.jobs.size < this.maxJobs
  }

  constructor(options: {
    parent?: MessagePort
    path?: string
    maxJobs?: number
    logger?: Logger
  }) {
    this.path = options.path ?? ''
    this.maxJobs = options.maxJobs ?? 1
    this.parent = options.parent ?? null
    this.jobs = new Map<number, Job>()
    this.started = true
    this.logger = options.logger || createRootLogger()

    if (options.parent) {
      this.spawned()
    } else {
      this.spawn()
    }
  }

  execute(job: Job): void {
    this.jobs.set(job.id, job)
    job.execute(this)
  }

  send(message: WorkerRequestMessage | WorkerResponseMessage): void {
    if (this.thread) {
      this.thread.postMessage(message)
    } else if (this.parent) {
      this.parent.postMessage(message)
    } else {
      throw new Error(`Cannot send message: no thread or worker`)
    }
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.started = false

    const jobs = Array.from(this.jobs.values())
    this.jobs.clear()

    for (const job of jobs) {
      job.abort()
    }

    if (this.thread) {
      this.thread.removeAllListeners()
      await this.thread.terminate()
      this.thread = null
    }

    if (this.parent) {
      this.parent.removeAllListeners()
      this.parent = null
    }
  }

  /**
   * Called from the main process to spawn a worker thread
   */
  private spawn() {
    Assert.isNull(this.parent)

    this.thread = new WorkerThread(this.path)

    this.thread.on('message', (response: WorkerResponseMessage): void => {
      const job = this.jobs.get(response.requestId)

      if (job) {
        this.jobs.delete(response.requestId)

        if (response.body.type === 'jobError') {
          Assert.isNotNull(job.reject)
          job.reject(response.body.error)
          return
        }

        Assert.isNotNull(job.resolve)
        job.resolve(response)
      }
    })
  }

  /**
   * Called from the worker thread once the worker spawns in the thread
   */
  private spawned() {
    // Trigger loading of Sapling parameters if we're in a worker thread
    generateKey()

    Assert.isNotNull(this.parent)

    this.parent.on('message', (request: WorkerRequestMessage) => {
      if (request.body.type === 'jobAbort') {
        const job = this.jobs.get(request.requestId)

        if (job) {
          this.jobs.delete(job.id)
          job?.abort()
        }
        return
      }

      const job = new Job(request)
      this.jobs.set(job.id, job)

      void handleRequest(request, job)
        .then((response: WorkerResponseMessage) => {
          this.send(response)
        })
        .catch((e) => {
          this.send({
            requestId: request.requestId,
            body: {
              type: 'jobError',
              error: e,
            },
          })
        })
    })
  }
}

if (parentPort !== null) {
  new Worker({ parent: parentPort })
}

export function getWorkerPath(): string {
  // Works around different paths when run under ts-jest
  let path = __dirname

  if (path.includes('ironfish/src/workerPool')) {
    path = path.replace('ironfish/src/workerPool', 'ironfish/build/src/workerPool')
  }

  return path + '/worker.js'
}
