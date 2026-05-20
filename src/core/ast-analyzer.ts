import { parse, visit } from '@solidity-parser/parser'
import type {
  AnalyzedEventInput,
  AnalyzedFunction,
  AnalyzedStateVariable,
  AstAnalysis,
  ContractNode,
} from '../types.js'

type Node = Record<string, unknown>

function nameOf(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const node = value as Node
    if (typeof node.name === 'string') return node.name
    if (typeof node.namePath === 'string') return node.namePath  // UserDefinedTypeName
    if (typeof node.typeName === 'object') return nameOf(node.typeName)
    if (typeof node.baseName === 'object') return nameOf(node.baseName)
  }
  return null
}

function typeOf(value: unknown): string {
  if (!value || typeof value !== 'object') return 'unknown'
  const node = value as Node
  if (typeof node.name === 'string') return node.name
  if (typeof node.type === 'string' && typeof node.name === 'string') return node.name
  if (typeof node.baseTypeName === 'object') return `${typeOf(node.baseTypeName)}[]`
  if (typeof node.keyType === 'object' && typeof node.valueType === 'object') {
    return `mapping(${typeOf(node.keyType)} => ${typeOf(node.valueType)})`
  }
  if (typeof node.typeName === 'object') return typeOf(node.typeName)
  return typeof node.type === 'string' ? node.type : 'unknown'
}

function modifiersOf(modifiers: unknown): string[] {
  if (!Array.isArray(modifiers)) return []
  return modifiers
    .map(modifier => nameOf(modifier))
    .filter((name): name is string => Boolean(name))
}

function parentsOf(baseContracts: unknown): string[] {
  if (!Array.isArray(baseContracts)) return []
  return baseContracts
    .map(base => {
      if (!base || typeof base !== 'object') return null
      const node = base as Node
      return nameOf(node.baseName)
    })
    .filter((name): name is string => Boolean(name))
}

function eventInputs(parameters: unknown): AnalyzedEventInput[] {
  if (!Array.isArray(parameters)) return []
  return parameters.map(param => {
    const node = param as Node
    return {
      name: typeof node.name === 'string' ? node.name : '',
      type: typeOf(node.typeName),
      indexed: node.isIndexed === true,
    }
  })
}

function findContracts(sourceCode: string): ContractNode[] {
  const ast = parse(sourceCode, { tolerant: true }) as unknown
  const contracts: ContractNode[] = []

  visit(ast, {
    ContractDefinition(node: unknown) {
      const contract = node as Node
      if (typeof contract.name !== 'string') return
      contracts.push({
        name: contract.name,
        parents: parentsOf(contract.baseContracts),
      })
    },
  })

  return contracts
}

export function analyzeSource(sourceCode: string | null | undefined): AstAnalysis | null {
  if (!sourceCode) return null

  const ast = parse(sourceCode, { tolerant: true }) as unknown
  const analysis: AstAnalysis = {
    inheritanceTree: [],
    functions: [],
    events: [],
    errors: [],
    stateVariables: [],
    imports: [],
  }

  let stateSlot = 0

  visit(ast, {
    ImportDirective(node: unknown) {
      const directive = node as Node
      const path = typeof directive.path === 'string' ? directive.path : null
      if (path) analysis.imports.push(path)
    },

    ContractDefinition(node: unknown) {
      const contract = node as Node
      if (typeof contract.name !== 'string') return
      analysis.inheritanceTree.push({
        name: contract.name,
        parents: parentsOf(contract.baseContracts),
      })
    },

    FunctionDefinition(node: unknown) {
      const fn = node as Node
      const name = typeof fn.name === 'string' && fn.name ? fn.name : '(fallback)'
      analysis.functions.push({
        name,
        visibility: typeof fn.visibility === 'string' ? fn.visibility : null,
        stateMutability: typeof fn.stateMutability === 'string' ? fn.stateMutability : null,
        modifiers: modifiersOf(fn.modifiers),
      })
    },

    EventDefinition(node: unknown) {
      const event = node as Node
      if (typeof event.name !== 'string') return
      analysis.events.push({
        name: event.name,
        inputs: eventInputs(event.parameters),
      })
    },

    CustomErrorDefinition(node: unknown) {
      const error = node as Node
      if (typeof error.name === 'string') analysis.errors.push({ name: error.name })
    },

    StateVariableDeclaration(node: unknown) {
      const declaration = node as Node
      if (!Array.isArray(declaration.variables)) return
      for (const variable of declaration.variables) {
        const v = variable as Node
        if (typeof v.name !== 'string') continue
        analysis.stateVariables.push({
          name: v.name,
          type: typeOf(v.typeName),
          visibility: typeof v.visibility === 'string' ? v.visibility : null,
          slot: stateSlot++,
        })
      }
    },
  })

  return analysis
}

export function buildInheritanceLines(contracts: ContractNode[], rootName?: string): string[] {
  if (contracts.length === 0) return []

  const byName = new Map(contracts.map(contract => [contract.name, contract]))
  const root = rootName && byName.has(rootName)
    ? byName.get(rootName)!
    : contracts[contracts.length - 1]

  const lines: string[] = []
  const seen = new Set<string>()

  function walk(name: string, prefix = '', connector = ''): void {
    if (seen.has(name)) {
      lines.push(`${prefix}${connector}${name} (seen)`)
      return
    }

    seen.add(name)
    lines.push(`${prefix}${connector}${name}`)
    const parents = byName.get(name)?.parents ?? []
    parents.forEach((parent, index) => {
      const isLast = index === parents.length - 1
      const branch = isLast ? '└── ' : '├── '
      const nextPrefix = prefix + (connector ? (isLast ? '    ' : '│   ') : '')
      walk(parent, nextPrefix, branch)
    })
  }

  walk(root.name)
  return lines
}

export function detectOpenZeppelinImports(imports: string[]): string[] {
  return imports.filter(path => path.includes('@openzeppelin/') || path.includes('openzeppelin-contracts'))
}

export function tryAnalyzeSource(sourceCode: string | null | undefined): AstAnalysis | null {
  try {
    return analyzeSource(sourceCode)
  } catch {
    return null
  }
}

export function canParseSource(sourceCode: string | null | undefined): boolean {
  if (!sourceCode) return false
  try {
    findContracts(sourceCode)
    return true
  } catch {
    return false
  }
}
