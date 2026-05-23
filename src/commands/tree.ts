import { getAddress, isAddress } from 'viem'
import { resolveContract } from '../core/resolver.js'
import { detectStandards, standardsToLabels } from '../core/standards.js'
import { buildInheritanceLines, detectOpenZeppelinImports, tryAnalyzeSource } from '../core/ast-analyzer.js'
import { c } from '../output/colors.js'
import type { Config } from '../types.js'

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

export async function runTree(
  rawAddress: string,
  chainName: string,
  config: Config,
  jsonOutput = false
): Promise<void> {
  const address = validateAddress(rawAddress)
  if (!jsonOutput) process.stdout.write(`  ${c.muted(`Building inheritance tree for ${address.slice(0, 6)}...${address.slice(-4)}...`)}\n`)

  try {
    const contract = await resolveContract(address, chainName, config)
    const standards = detectStandards(contract.abi || [], contract.sourceCode)
    const analysis = tryAnalyzeSource(contract.sourceCode)

    if (jsonOutput) {
      console.log(JSON.stringify({ contract, standards, analysis }, null, 2))
      return
    }

    console.log()
    console.log(`  ${c.bold('INHERITANCE TREE')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))

    if (!analysis) {
      console.log(`  ${c.warn('Source is unavailable or could not be parsed.')}`)
    } else {
      for (const line of buildInheritanceLines(analysis.inheritanceTree, contract.name)) {
        console.log(`  ${line}`)
      }
    }

    console.log()
    console.log(`  ${c.bold('STANDARDS DETECTED')}`)
    const labels = standardsToLabels(standards)
    if (labels.length === 0) {
      console.log(`  ${c.muted('No common ERC standards detected from ABI.')}`)
    } else {
      for (const label of labels) console.log(`  ${c.success('✓')} ${label}`)
    }

    if (analysis) {
      const ozImports = detectOpenZeppelinImports(analysis.imports)
      console.log()
      console.log(`  ${c.bold('SOURCE SUMMARY')}`)
      console.log(`  ${c.muted('contracts')}  ${analysis.inheritanceTree.length}`)
      console.log(`  ${c.muted('functions')}  ${analysis.functions.length}`)
      console.log(`  ${c.muted('events')}     ${analysis.events.length}`)
      console.log(`  ${c.muted('errors')}     ${analysis.errors.length}`)
      if (ozImports.length > 0) {
        console.log(`  ${c.muted('openzeppelin')} ${ozImports.slice(0, 3).join('  ')}`)
      }
    }

    console.log()
  } catch (err) {
    throw err
  }
}
