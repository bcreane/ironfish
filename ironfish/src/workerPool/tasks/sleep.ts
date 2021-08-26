/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PromiseUtils } from '../../utils'
import { Job } from '../job'

export type SleepRequest = {
  type: 'sleep'
  sleep: number
}

export type SleepResponse = {
  type: 'sleep'
  aborted: boolean
}

export async function handleSleep({ sleep }: SleepRequest, job: Job): Promise<SleepResponse> {
  await PromiseUtils.sleep(sleep)

  if (job.status === 'aborted') {
    return { type: 'sleep', aborted: true }
  }

  return { type: 'sleep', aborted: false }
}
