import { getAddress, isAddress } from 'viem'
import { createClient } from '../core/rpc.js'
import { resolveContract } from '../core/resolver.js'
import { getUpgradeHistory, resolveProxyChain } from '../core/proxy-detector.js'
import { c } from '../output/colors.js'
import type { Config, ProxyInfo } from '../types.js'

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function printProxy(proxy: ProxyInfo, address: string): void {
  console.log(`  ${c.muted('pattern')}    ${proxy.pattern}`)
  console.log(`  ${c.muted('proxy')}      ${c.address(shortAddr(address))}  (this contract)`)
  if (proxy.proxySlot) console.log(`  ${c.muted('impl slot')}  ${proxy.proxySlot.slice(0, 10)}...  ->  ${c.address(shortAddr(proxy.implementationAddress))}`)
  else console.log(`  ${c.muted('impl')}       ${c.address(shortAddr(proxy.implementationAddress))}`)
  if (proxy.adminAddress) console.log(`  ${c.muted('admin')}      ${c.address(shortAddr(proxy.adminAddress))}`)
  if (proxy.chain) {
    console.log(`  ${c.muted('nested')}     ${proxy.chain.pattern}  ->  ${c.address(shortAddr(proxy.chain.implementationAddress))}`)
  }
}

export async function runProxy(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  jsonOutput = false
): Promise<void> {
  const address = validateAddress(rawAddress)
  if (!jsonOutput) process.stdout.write(`  ${c.muted(`Inspecting proxy for ${address.slice(0, 6)}...${address.slice(-4)}...`)}\n`)

  try {
    const client = createClient(chainName, config, rpcOverride)
    const contract = await resolveContract(address, chainName, config)
    const proxy = await resolveProxyChain(address, contract.abi, client)
    const history = proxy ? await getUpgradeHistory(address, client) : []

    if (jsonOutput) {
      console.log(JSON.stringify({
        proxy,
        history: history.map(entry => ({
          ...entry,
          blockNumber: entry.blockNumber.toString(),
        })),
      }, null, 2))
      return
    }

    console.log()
    console.log(`  ${c.bold('PROXY ANALYSIS')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))

    if (!proxy) {
      console.log(`  ${c.success('No proxy pattern detected.')}`)
      console.log()
      return
    }

    printProxy(proxy, address)

    console.log()
    console.log(`  ${c.bold('UPGRADE HISTORY')}`)
    if (history.length === 0) {
      console.log(`  ${c.muted('No Upgraded(address) logs found from block 0.')}`)
    } else {
      for (const entry of history.slice(-8).reverse()) {
        console.log(`  ${c.muted(entry.blockNumber.toString().padEnd(10))} ${c.address(shortAddr(entry.address))}`)
      }
    }

    console.log()
    console.log(`  ${c.bold('PATTERNS CHECKED')}`)
    console.log(`  ${proxy.pattern.includes('EIP-1967') || proxy.pattern.includes('Transparent') ? c.success('✓') : c.muted('○')} EIP-1967 Transparent`)
    console.log(`  ${proxy.pattern.includes('UUPS') ? c.success('✓') : c.muted('○')} UUPS (EIP-1822)`)
    console.log(`  ${proxy.pattern.includes('Diamond') ? c.success('✓') : c.muted('○')} Diamond (EIP-2535)`)
    console.log(`  ${proxy.pattern.includes('Beacon') ? c.success('✓') : c.muted('○')} Beacon Proxy`)
    console.log(`  ${proxy.pattern.includes('Minimal') ? c.success('✓') : c.muted('○')} Minimal Proxy EIP-1167`)

    if (proxy.adminAddress) {
      console.log()
      console.log(`  ${c.warn('⚠')} ${c.muted('admin can upgrade without timelock')}`)
    }
    console.log()
  } catch (err) {
    throw err
  }
}
