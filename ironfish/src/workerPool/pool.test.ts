/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '../testUtilities/matchers'
import { JobAbortedError } from './errors'
import { WorkerPool } from './pool'

describe('Worker Pool', () => {
  let pool: WorkerPool

  afterEach(async () => {
    await pool?.stop()
  })

  it('stops and starts workers', async () => {
    pool = new WorkerPool()

    expect(pool.started).toBe(false)
    expect(pool.workers.length).toBe(0)

    pool.start()

    expect(pool.started).toBe(true)
    expect(pool.workers.length).toBe(1)

    const worker = pool.workers[0]
    const stopSpy = jest.spyOn(worker, 'stop')

    await pool.stop()

    expect(pool.started).toBe(false)
    expect(pool.workers.length).toBe(0)

    expect(stopSpy).toHaveBeenCalled()
  })

  it('if pool is empty, executes on main thread', async () => {
    pool = new WorkerPool({ maxWorkers: 0 })
    pool.start()

    expect(pool.workers.length).toBe(0)
    await pool.sleep().response()
    expect(pool.workers.length).toBe(0)
  })

  it('executes in worker', async () => {
    pool = new WorkerPool({ maxWorkers: 1 })
    pool.start()

    expect(pool.workers.length).toBe(1)
    await pool.sleep().response()
    expect(pool.workers.length).toBe(1)
  }, 10000)

  it('aborts job in worker', async () => {
    pool = new WorkerPool({ maxWorkers: 1 })
    pool.start()

    expect(pool.workers.length).toBe(1)
    const worker = pool.workers[0]

    const job = pool.sleep()

    expect(job.status).toBe('executing')
    expect(worker.executing).toBe(true)
    expect(pool.size).toBe(1)

    job.abort()

    await expect(job.response()).toRejectErrorInstance(JobAbortedError)

    expect(worker.executing).toBe(false)
    expect(job.status).toBe('aborted')
    expect(pool.workers.length).toBe(1)
    expect(pool.size).toBe(0)
  }, 10000)

  it('counts queue size', async () => {
    pool = new WorkerPool()
    pool.start()

    const worker = pool.workers[0]
    void pool.sleep()
    void pool.sleep()

    expect(worker.jobs.size).toBe(1)
    expect(pool.queued).toBe(1)
    expect(pool.executing).toBe(1)

    await pool.stop()

    expect(pool.workers.length).toBe(0)
    expect(pool.executing).toBe(0)
    expect(pool.queued).toBe(0)
  }, 60000)
})
