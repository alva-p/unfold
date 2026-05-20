import { default as inquirer } from 'inquirer'
import { isAddress, getAddress } from 'viem'
import { c } from './output/colors.js'
import { CHAINS } from './core/rpc.js'
import { runInspect } from './commands/inspect.js'
import { runProxy } from './commands/proxy.js'
import { runTree } from './commands/tree.js'
import { runSecurity } from './commands/security.js'
import { runStorage } from './commands/storage.js'
import { runRead } from './commands/read.js'
import { runWatch } from './commands/watch.js'
import { runExport } from './commands/export.js'
import type { Config } from './types.js'

const ACTIONS = [
  { name: 'inspect         full fingerprint', value: 'inspect' },
  { name: 'proxy           proxy chain + upgrade history', value: 'proxy' },
  { name: 'tree            inheritance tree + standards', value: 'tree' },
  { name: 'security        security surface scan', value: 'security' },
  { name: 'read            call a view function', value: 'read' },
  { name: 'storage         read a storage slot or variable', value: 'storage' },
  { name: 'watch           live event stream', value: 'watch' },
  { name: 'export          export to foundry | abi | json', value: 'export' },
  new inquirer.Separator(),
  { name: 'exit', value: 'exit' },
]

async function askAction(): Promise<string> {
  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: c.bold('What do you want to do?'),
    choices: ACTIONS,
    pageSize: 12,
  }])
  return action as string
}

async function askAddress(): Promise<string> {
  const { raw } = await inquirer.prompt([{
    type: 'input',
    name: 'raw',
    message: c.muted('EVM address:'),
    validate: (v: string) => isAddress(v.trim()) ? true : c.danger('Enter a valid EVM address (0x...)'),
  }])
  return getAddress((raw as string).trim())
}

async function askChain(config: Config): Promise<string> {
  const defaultChain = config.defaultChain ?? 'mainnet'
  const { chain } = await inquirer.prompt([{
    type: 'list',
    name: 'chain',
    message: c.muted('Chain:'),
    choices: Object.keys(CHAINS),
    default: defaultChain,
    pageSize: 10,
  }])
  return chain as string
}

async function askExtra(action: string): Promise<string> {
  const prompts: Record<string, string> = {
    read:    'Function call (e.g. balanceOf(0x...)):',
    storage: 'Slot, variable name, or mapping (e.g. balanceOf[0x...]):',
    watch:   'Event name (or "all"):',
    export:  'Format (foundry | abi | json):',
  }
  const message = prompts[action]
  if (!message) return ''
  const { value } = await inquirer.prompt([{
    type: 'input',
    name: 'value',
    message: c.muted(message),
    default: action === 'watch' ? 'all' : action === 'export' ? 'foundry' : undefined,
    validate: (v: string) => v.trim().length > 0 ? true : 'Required',
  }])
  return (value as string).trim()
}

async function runAction(
  action: string,
  address: string,
  chain: string,
  config: Config,
  extra: string,
  rpc?: string
): Promise<void> {
  console.log()
  switch (action) {
    case 'inspect':  return runInspect(address, chain, config, rpc)
    case 'proxy':    return runProxy(address, chain, config, rpc)
    case 'tree':     return runTree(address, chain, config)
    case 'security': return runSecurity(address, chain, config, rpc)
    case 'read':     return runRead(address, extra, chain, config, rpc)
    case 'storage':  return runStorage(address, extra, chain, config, rpc)
    case 'watch':    return runWatch(address, extra, chain, config, rpc)
    case 'export':   return runExport(address, extra, chain, config)
  }
}

async function askContinue(): Promise<'new' | 'same' | 'exit'> {
  const { next } = await inquirer.prompt([{
    type: 'list',
    name: 'next',
    message: c.muted('What next?'),
    choices: [
      { name: 'do something else with this contract', value: 'same' },
      { name: 'inspect a different contract', value: 'new' },
      { name: 'exit', value: 'exit' },
    ],
  }])
  return next as 'new' | 'same' | 'exit'
}

export async function runInteractive(config: Config): Promise<void> {
  if (!process.stdout.isTTY) return

  let address = ''
  let chain = ''

  while (true) {
    const action = await askAction()
    if (action === 'exit') break

    if (!address) {
      address = await askAddress()
      chain = await askChain(config)
    }

    const extra = await askExtra(action)

    try {
      await runAction(action, address, chain, config, extra)
    } catch (err) {
      console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    }

    const next = await askContinue()
    if (next === 'exit') break
    if (next === 'new') {
      address = ''
      chain = ''
    }
  }

  console.log(`\n  ${c.muted('bye.')}\n`)
}

// Called from inspect after the fingerprint is shown — address already known
export async function runInteractiveLoop(
  address: string,
  chain: string,
  config: Config,
  rpcOverride?: string
): Promise<void> {
  if (!process.stdout.isTTY) return

  while (true) {
    const action = await askAction()
    if (action === 'exit') break

    const extra = await askExtra(action)

    try {
      await runAction(action, address, chain, config, extra, rpcOverride)
    } catch (err) {
      console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    }

    const next = await askContinue()
    if (next === 'exit') break
    if (next === 'new') {
      // Hand back to full interactive mode
      const newAddress = await askAddress()
      const newChain = await askChain(config)
      await runInteractiveLoop(newAddress, newChain, config)
      break
    }
    // 'same' → loop with same address
  }

  console.log(`\n  ${c.muted('bye.')}\n`)
}
