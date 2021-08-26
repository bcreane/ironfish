/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey } from 'ironfish-wasm-nodejs'
import { Strategy } from '../strategy'
import { WorkerPool } from './pool'

describe('Worker Pool', () => {
  let pool: WorkerPool

  afterEach(async () => {
    await pool?.stop()
  })

  it('task: createMinersFee()', async () => {
    pool = new WorkerPool()
    pool.start()

    expect(pool.workers.length).toBe(1)

    const strategy = new Strategy(pool)
    const promise = strategy.createMinersFee(BigInt(0), 0, generateKey().spending_key)
    expect(pool.executing).toBe(1)

    const minersFee = await promise
    expect(pool.executing).toBe(0)

    expect(minersFee.serialize()).toBeInstanceOf(Buffer)
  }, 60000)
})
