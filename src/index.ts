#!/usr/bin/env node
import { Command } from 'commander'
import { printBanner } from './output/banner.js'
import { runInspect } from './commands/inspect.js'
import { runExport } from './commands/export.js'
import { runProxy } from './commands/proxy.js'
import { runRead } from './commands/read.js'
import { runSecurity } from './commands/security.js'
import { runStorage } from './commands/storage.js'
import { runTree } from './commands/tree.js'
import { runWatch } from './commands/watch.js'
import { loadConfig } from './core/config.js'
import { runInteractive } from './interactive.js'
import { c } from './output/colors.js'
import { CHAINS } from './core/rpc.js'

const program = new Command()

program
  .name('unfold')
  .description('Unfold any EVM contract in seconds')
  .version('0.1.0')
  .argument('[address]', 'EVM contract address (omit to enter interactive mode)')
  .option('--chain <name>', 'Target chain')
  .option('--rpc <url>', 'Custom RPC URL')
  .option('--json', 'Output as JSON (no banner or interactive menu)')
  .option('--proxy', 'Full proxy analysis')
  .option('--tree', 'Inheritance tree + standards')
  .option('--security', 'Security surface scan')
  .option('--watch <event>', 'Watch contract events live')
  .option('--storage <slot>', 'Read a storage slot or variable name')
  .option('--read <call>', 'Call any view function, e.g. balanceOf(0x...)')
  .option('--export <format>', 'Export: foundry | abi | json')
  .action(async (address: string | undefined, options: {
    chain?: string
    rpc?: string
    json?: boolean
    proxy?: boolean
    tree?: boolean
    security?: boolean
    watch?: string
    storage?: string
    read?: string
    export?: string
  }) => {
    const isJson = options.json === true

    if (!isJson) printBanner()

    const config = loadConfig()
    const chain = options.chain ?? config.defaultChain ?? 'mainnet'

    // No address → full interactive mode
    if (!address) {
      await runInteractive(config)
      return
    }

    if (!CHAINS[chain]) {
      console.error(c.danger(`\n  Unknown chain: "${chain}"`))
      console.error(c.muted(`  Supported: ${Object.keys(CHAINS).join(', ')}\n`))
      process.exit(1)
    }

    if (options.proxy)   { await runProxy(address, chain, config, options.rpc, isJson); return }
    if (options.tree)    { await runTree(address, chain, config, isJson); return }
    if (options.security){ await runSecurity(address, chain, config, options.rpc, isJson); return }
    if (options.watch)   { await runWatch(address, options.watch, chain, config, options.rpc); return }
    if (options.storage) { await runStorage(address, options.storage, chain, config, options.rpc, isJson); return }
    if (options.read)    { await runRead(address, options.read, chain, config, options.rpc, isJson); return }
    if (options.export)  { await runExport(address, options.export, chain, config, isJson); return }

    await runInspect(address, chain, config, options.rpc, isJson)
  })

program
  .command('config')
  .description('Manage unfold configuration')
  .command('init')
  .description('Initialize config file')
  .action(async () => {
    const { default: inquirer } = await import('inquirer')
    const { getConfigPath, saveConfig } = await import('./core/config.js')

    printBanner()
    console.log(c.muted('  Initializing ~/.unfold/config.json\n'))

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'etherscanApiKey',
        message: 'Etherscan API key (leave blank to skip):',
      },
      {
        type: 'list',
        name: 'defaultChain',
        message: 'Default chain:',
        choices: Object.keys(CHAINS),
        default: 'mainnet',
      },
      {
        type: 'confirm',
        name: 'addRpcOverrides',
        message: 'Add custom RPC URLs now?',
        default: false,
      },
      {
        type: 'checkbox',
        name: 'rpcChains',
        message: 'Chains to configure:',
        choices: Object.keys(CHAINS),
        when: (a: Record<string, unknown>) => a.addRpcOverrides === true,
      },
    ])

    const rpcOverrides: Record<string, string> = {}
    for (const chainName of answers.rpcChains || []) {
      const answer = await inquirer.prompt([{
        type: 'input',
        name: 'rpcUrl',
        message: `${chainName} RPC URL:`,
        validate: (value: string) => value.startsWith('http://') || value.startsWith('https://') ? true : 'Enter an http(s) URL',
      }])
      if (answer.rpcUrl) rpcOverrides[chainName as string] = answer.rpcUrl as string
    }

    const cfg = {
      defaultChain: answers.defaultChain as string,
      ...(answers.etherscanApiKey ? { etherscanApiKey: answers.etherscanApiKey as string } : {}),
      ...(Object.keys(rpcOverrides).length > 0 ? { rpcOverrides } : {}),
    }

    saveConfig(cfg)
    console.log(c.success(`\n  ✓ Config saved to ${getConfigPath()}\n`))
  })

program.parse()
