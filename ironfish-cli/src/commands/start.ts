/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { IronfishNode, NodeUtils, PromiseUtils } from 'ironfish'
import { Platform } from 'ironfish'
import { IronfishCommand, SIGNALS } from '../command'
import {
  ConfigFlag,
  ConfigFlagKey,
  DatabaseFlag,
  DatabaseFlagKey,
  DataDirFlag,
  DataDirFlagKey,
  RpcTcpHostFlag,
  RpcTcpHostFlagKey,
  RpcTcpPortFlag,
  RpcTcpPortFlagKey,
  RpcUseIpcFlag,
  RpcUseIpcFlagKey,
  RpcUseTcpFlag,
  RpcUseTcpFlagKey,
  VerboseFlag,
  VerboseFlagKey,
} from '../flags'
import { ONE_FISH_IMAGE, TELEMETRY_BANNER } from '../images'

const DEFAULT_ACCOUNT_NAME = 'default'

export default class Start extends IronfishCommand {
  static description = 'Start the node'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
    [DatabaseFlagKey]: DatabaseFlag,
    [RpcUseIpcFlagKey]: { ...RpcUseIpcFlag, allowNo: true },
    [RpcUseTcpFlagKey]: { ...RpcUseTcpFlag, allowNo: true },
    [RpcTcpHostFlagKey]: RpcTcpHostFlag,
    [RpcTcpPortFlagKey]: RpcTcpPortFlag,
    bootstrap: flags.string({
      char: 'b',
      description: 'comma-separated addresses of bootstrap nodes to connect to',
      multiple: true,
    }),
    port: flags.integer({
      char: 'p',
      description: 'port to run the local ws server on',
    }),
    workers: flags.integer({
      description:
        'number of CPU workers to use for long-running operations. 0 disables (likely to cause performance issues), -1 auto-detects based on CPU cores',
    }),
    graffiti: flags.string({
      char: 'g',
      default: undefined,
      description: 'Set the graffiti for the node',
    }),
    name: flags.string({
      char: 'n',
      description: 'name for the node',
      hidden: true,
    }),
    worker: flags.boolean({
      char: 'w',
      description: 'is this a worker node',
      hidden: true,
    }),
    listen: flags.boolean({
      allowNo: true,
      default: undefined,
      description: 'disable the web socket listen server',
      hidden: true,
    }),
    forceMining: flags.boolean({
      default: undefined,
      description: 'force mining even if we are not synced',
      hidden: true,
    }),
    logPeerMessages: flags.boolean({
      default: undefined,
      description: 'track all messages sent and received by peers',
      hidden: true,
    }),
  }

  node: IronfishNode | null = null

  /**
   * This promise is used to wait until start is finished beforer closeFromSignal continues
   * because you can cause errors if you attempt to shutdown while the node is still starting
   * up to reduce shutdown hanging, start should cancel if it detects this.isClosing is true
   * and resolve this promise
   */
  startDonePromise: Promise<void> | null = null

  async start(): Promise<void> {
    const [startDonePromise, startDoneResolve] = PromiseUtils.split<void>()
    this.startDonePromise = startDonePromise

    const { flags } = this.parse(Start)
    const {
      bootstrap,
      forceMining,
      graffiti,
      listen,
      logPeerMessages,
      name,
      port,
      worker,
      workers,
    } = flags

    if (bootstrap !== undefined) {
      this.sdk.config.setOverride('bootstrapNodes', bootstrap.filter(Boolean))
    }
    if (port !== undefined && port !== this.sdk.config.get('peerPort')) {
      this.sdk.config.setOverride('peerPort', port)
    }
    if (workers !== undefined && workers !== this.sdk.config.get('nodeWorkers')) {
      this.sdk.config.setOverride('nodeWorkers', workers)
    }
    if (graffiti !== undefined && graffiti !== this.sdk.config.get('blockGraffiti')) {
      this.sdk.config.setOverride('blockGraffiti', graffiti)
    }
    if (name !== undefined && name.trim() !== this.sdk.config.get('nodeName')) {
      this.sdk.config.setOverride('nodeName', name.trim())
    }
    if (listen !== undefined && listen !== this.sdk.config.get('enableListenP2P')) {
      this.sdk.config.setOverride('enableListenP2P', listen)
    }
    if (worker !== undefined && worker !== this.sdk.config.get('isWorker')) {
      this.sdk.config.setOverride('isWorker', worker)
    }
    if (forceMining !== undefined && forceMining !== this.sdk.config.get('miningForce')) {
      this.sdk.config.setOverride('miningForce', forceMining)
    }
    if (
      logPeerMessages !== undefined &&
      logPeerMessages !== this.sdk.config.get('logPeerMessages')
    ) {
      this.sdk.config.setOverride('logPeerMessages', logPeerMessages)
    }

    const node = await this.sdk.node()

    const version = Platform.getAgent('cli')
    const nodeName = this.sdk.config.get('nodeName').trim() || null
    const peerPort = this.sdk.config.get('peerPort')
    const bootstraps = this.sdk.config.getArray('bootstrapNodes')

    this.log(`\n${ONE_FISH_IMAGE}`)
    this.log(`Peer Identity ${node.peerNetwork.localPeer.publicIdentity}`)
    this.log(`Peer Agent    ${version}`)
    this.log(`Port          ${peerPort}`)
    this.log(`Bootstrap     ${bootstraps.join(',') || 'NONE'}`)
    this.log(`Node Name     ${nodeName || 'NONE'}`)
    this.log(` `)

    await NodeUtils.waitForOpen(node, () => this.closing)

    if (this.closing) {
      return startDoneResolve()
    }

    const trees = await node.chain.verifier.blockMatchesTrees(node.chain.head)
    if (!trees.valid) {
      this.log(
        `Error starting node: your merkle trees are corrupt: ${String(trees.reason)}.` +
          `\n  1. Run ironfish chain:repair to attempt repair` +
          `\n  2. Delete your database at ${node.config.chainDatabasePath}`,
      )

      this.exit(1)
    }

    if (node.internal.get('isFirstRun')) {
      await this.firstRun(node)
    }

    await node.start()
    this.node = node

    startDoneResolve()
    this.listenForSignals()
    await node.waitForShutdown()
  }

  async closeFromSignal(signal: SIGNALS): Promise<void> {
    this.log(`Shutting down node after ${signal}`)
    await this.startDonePromise
    await this.node?.shutdown()
    await this.node?.closeDB()
  }

  /**
   * Information displayed the first time a node is running
   */
  async firstRun(node: IronfishNode): Promise<void> {
    // Try to get the user to display telementry
    if (!node.config.get('enableTelemetry')) {
      this.log(TELEMETRY_BANNER)
    }

    // Create a default account on startup
    if (!node.accounts.getDefaultAccount()) {
      if (node.accounts.accountExists(DEFAULT_ACCOUNT_NAME)) {
        await node.accounts.setDefaultAccount(DEFAULT_ACCOUNT_NAME)
        this.log(`The default account is now: ${DEFAULT_ACCOUNT_NAME}\n`)
      } else {
        await this.sdk.clientMemory.connect(node)

        const result = await this.sdk.clientMemory.createAccount({
          name: DEFAULT_ACCOUNT_NAME,
        })

        this.log(
          `New default account created: ${DEFAULT_ACCOUNT_NAME} \nAccount's public address: ${result?.content.publicAddress}\n`,
        )
      }
    }

    node.internal.set('isFirstRun', false)
    await node.internal.save()
  }
}
