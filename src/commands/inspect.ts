import { isAddress, getAddress } from 'viem'
import type { PublicClient } from 'viem'
import { resolveContract } from '../core/resolver.js'
import { resolveProxyChain } from '../core/proxy-detector.js'
import { detectStandards } from '../core/standards.js'
import { printFingerprint } from '../output/fingerprint.js'
import { c } from '../output/colors.js'
import { printEoaInfo } from '../output/eoa.js'
import type { Config } from '../types.js'
import { createClient, CHAINS } from '../core/rpc.js'

function validateAddress(raw: string): string {
  if (!isAddress(raw)) {
    throw new Error(`Invalid EVM address: ${raw}`)
  }
  return getAddress(raw)
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

async function checkIsContract(client: PublicClient, address: `0x${string}`): Promise<boolean> {
  const code = await client.getBytecode({ address })
  return !!code && code !== '0x'
}

export async function runInspect(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  jsonOutput = false,
  startLoop = true
): Promise<void> {
  let address: string
  try {
    address = validateAddress(rawAddress)
  } catch (err) {
    console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    process.exit(1)
    return
  }

  const chainConfig = CHAINS[chainName]
  if (!chainConfig) {
    console.error(c.danger(`Unknown chain: ${chainName}`))
    process.exit(1)
    return
  }

  if (!jsonOutput) {
    process.stdout.write(`\n  ${c.muted(`Resolving ${shortAddr(address)} on ${chainConfig.name}...`)}\n`)
  }

  try {
    const client = createClient(chainName, config, rpcOverride)

    const [isContract, contract] = await Promise.all([
      checkIsContract(client, address as `0x${string}`),
      resolveContract(address, chainName, config),
    ])

    if (!isContract) {
      let balance: bigint | undefined
      let transactionCount: number | undefined
      try {
        ;[balance, transactionCount] = await Promise.all([
          client.getBalance({ address: address as `0x${string}` }),
          client.getTransactionCount({ address: address as `0x${string}` }),
        ])
      } catch {
        // keep the EOA output useful even if one RPC method fails
      }

      if (jsonOutput) {
        console.log(JSON.stringify({
          address,
          chain: chainConfig.name,
          type: 'eoa',
          balance: balance?.toString() ?? null,
          transactionCount: transactionCount ?? null,
        }, null, 2))
        return
      }

      process.stdout.write('\x1B[1A\x1B[2K')
      printEoaInfo(address, chainConfig.name, balance, transactionCount)
      return
    }

    const proxy = await resolveProxyChain(address, contract.abi, client)

    if (proxy) {
      contract.isProxy = true
      contract.implementationAddress = proxy.implementationAddress
      if (!contract.implementationName) {
        try {
          const impl = await resolveContract(proxy.implementationAddress, chainName, config)
          contract.implementationName = impl.name
        } catch {
          // ignore
        }
      }
    }

    const standards = detectStandards(contract.abi || [], contract.sourceCode)

    let balance: bigint | undefined
    let totalSupply: bigint | undefined
    try {
      balance = await client.getBalance({ address: address as `0x${string}` })
    } catch {
      // ignore
    }

    if (standards.erc20 || standards.erc1155) {
      try {
        totalSupply = await client.readContract({
          address: address as `0x${string}`,
          abi: [{ name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] }],
          functionName: 'totalSupply',
        }) as bigint
      } catch {
        // ignore if contract doesn't have totalSupply
      }
    }

    if (jsonOutput) {
      console.log(JSON.stringify({ contract, proxy, standards }, null, 2))
      return
    }

    // overwrite the "Resolving..." line
    process.stdout.write('\x1B[1A\x1B[2K')
    console.log()
    if (contract.isVerified) {
      console.log(`  ${c.success('✓')} ${c.muted('Source verified on Etherscan')}`)
    }
    const fnCount = (contract.abi || []).filter(i => i.type === 'function').length
    const evCount = (contract.abi || []).filter(i => i.type === 'event').length
    if (fnCount > 0) {
      console.log(`  ${c.success('✓')} ${c.muted(`ABI parsed — ${fnCount} functions · ${evCount} events`)}`)
    }
    if (proxy) {
      console.log(`  ${c.success('✓')} ${c.muted(`Proxy detected — ${proxy.pattern}`)}`)
    }
    console.log()

    printFingerprint(contract, proxy, standards, chainConfig.name, balance, totalSupply)

    if (startLoop) {
      const { runInteractiveLoop } = await import('../interactive.js')
      await runInteractiveLoop(address, chainName, config, rpcOverride)
    }
  } catch (err) {
    process.stdout.write('\x1B[1A\x1B[2K')
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`\n  ${c.danger('Error:')} ${msg}\n`)
    process.exit(1)
  }
}
