import { select, input, Separator } from '@inquirer/prompts'
import { isAddress, getAddress } from 'viem'
import { exec } from 'child_process'
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

async function askAction(): Promise<string> {
  return select({
    message: 'What do you want to do?',
    choices: [
      { name: 'inspect         full fingerprint', value: 'inspect' },
      { name: 'proxy           proxy chain + upgrade history', value: 'proxy' },
      { name: 'tree            inheritance tree + standards', value: 'tree' },
      { name: 'security        security surface scan', value: 'security' },
      { name: 'read state      call any view function', value: 'read' },
      { name: 'watch events    stream live events to terminal', value: 'watch' },
      { name: 'inspect storage read any slot by name or index', value: 'storage' },
      { name: 'export foundry  generate .t.sol with fork configured', value: 'export-foundry' },
      { name: 'export abi      save ABI as JSON', value: 'export-abi' },
      { name: 'open etherscan  launch in browser', value: 'etherscan' },
      new Separator(),
      { name: 'exit', value: 'exit' },
    ],
    pageSize: 12,
  })
}

async function askAddress(): Promise<string> {
  const raw = await input({
    message: 'EVM address:',
    validate: (v: string) => isAddress(v.trim()) ? true : 'Enter a valid EVM address (0x...)',
  })
  return getAddress(raw.trim())
}

async function askChain(config: Config): Promise<string> {
  return select({
    message: 'Chain:',
    choices: Object.keys(CHAINS).map(name => ({ name, value: name })),
    default: config.defaultChain ?? 'mainnet',
    pageSize: 10,
  })
}

async function askExtra(action: string): Promise<string> {
  const prompts: Record<string, { message: string; default?: string }> = {
    read:           { message: 'Function call (e.g. balanceOf(0x...)):' },
    storage:        { message: 'Slot, variable name, or mapping (e.g. balanceOf[0x...]):' },
    watch:          { message: 'Event name (or "all"):', default: 'all' },
    'export-foundry': { message: 'Output path (optional):', default: '' },
    'export-abi':   { message: 'Output path (optional):', default: '' },
  }
  const cfg = prompts[action]
  if (!cfg) return ''
  const value = await input({
    message: cfg.message,
    default: cfg.default,
  })
  return value.trim()
}

async function askContinue(): Promise<'new' | 'same' | 'exit'> {
  return select({
    message: 'What next?',
    choices: [
      { name: 'do something else with this contract', value: 'same' },
      { name: 'inspect a different contract', value: 'new' },
      { name: 'exit', value: 'exit' },
    ],
  }) as Promise<'new' | 'same' | 'exit'>
}

async function openBrowser(url: string): Promise<void> {
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
  exec(`${cmd} "${url}"`)
  console.log(`\n  ${c.muted('Opening')} ${c.address(url)}\n`)
}

async function runAction(
  action: string,
  address: string,
  chain: string,
  config: Config,
  extra: string,
  rpc?: string
): Promise<void> {
  process.stdout.write('\n'.repeat(5))
  switch (action) {
    case 'inspect':        return runInspect(address, chain, config, rpc, false, false)
    case 'proxy':          return runProxy(address, chain, config, rpc)
    case 'tree':           return runTree(address, chain, config)
    case 'security':       return runSecurity(address, chain, config, rpc)
    case 'read':           return runRead(address, extra, chain, config, rpc)
    case 'storage':        return runStorage(address, extra, chain, config, rpc)
    case 'watch':          return runWatch(address, extra, chain, config, rpc)
    case 'export-foundry': return runExport(address, 'foundry', chain, config)
    case 'export-abi':     return runExport(address, 'abi', chain, config)
    case 'etherscan': {
      const chainConfig = CHAINS[chain]
      if (chainConfig) {
        await openBrowser(`${chainConfig.explorerUrl}${address}`)
      }
      return
    }
  }
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
      const newAddress = await askAddress()
      const newChain = await askChain(config)
      await runInteractiveLoop(newAddress, newChain, config)
      break
    }
  }

  console.log(`\n  ${c.muted('bye.')}\n`)
}
