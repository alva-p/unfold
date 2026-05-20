/**
 * Multichain smoke tests — make real RPC + Sourcify calls.
 * Run with: npm run test:smoke
 * Requires network access. No API key needed (uses Sourcify fallback).
 */
import { describe, it, expect } from 'vitest'
import { resolveContract } from '../core/resolver.js'
import { resolveProxyChain } from '../core/proxy-detector.js'
import { detectStandards } from '../core/standards.js'
import { createClient } from '../core/rpc.js'

const config = {}

describe('mainnet — WETH (simple ERC-20)', () => {
  it('resolves source and ABI', async () => {
    const contract = await resolveContract('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'mainnet', config)
    expect(contract.isVerified).toBe(true)
    expect(contract.name).toBe('WETH9')
    expect(contract.abi).not.toBeNull()
    expect(contract.sourceCode).not.toBeNull()
  }, 30_000)

  it('detects ERC-20 standard', async () => {
    const contract = await resolveContract('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'mainnet', config)
    const s = detectStandards(contract.abi!, contract.sourceCode)
    expect(s.erc20).toBe(true)
  }, 30_000)

  it('detects no proxy', async () => {
    const contract = await resolveContract('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'mainnet', config)
    const client = createClient('mainnet', config)
    const proxy = await resolveProxyChain('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', contract.abi, client)
    expect(proxy).toBeNull()
  }, 30_000)
})

describe('mainnet — wstETH (ERC-20 + ERC-2612)', () => {
  it('resolves as verified', async () => {
    const contract = await resolveContract('0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', 'mainnet', config)
    expect(contract.isVerified).toBe(true)
    expect(contract.name).toBe('WstETH')
  }, 30_000)

  it('detects ERC-20 and ERC-2612', async () => {
    const contract = await resolveContract('0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', 'mainnet', config)
    const s = detectStandards(contract.abi!, contract.sourceCode)
    expect(s.erc20).toBe(true)
    expect(s.erc2612).toBe(true)
  }, 30_000)
})

describe('base — USDC (proxy)', () => {
  it('resolves FiatTokenProxy as verified', async () => {
    const contract = await resolveContract('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'base', config)
    expect(contract.isVerified).toBe(true)
    expect(contract.name).toMatch(/FiatToken|USDC/i)
  }, 30_000)
})

describe('arbitrum — connectivity + proxy resolution', () => {
  it('can connect to Arbitrum RPC', async () => {
    const client = createClient('arbitrum', config)
    const block = await client.getBlockNumber()
    expect(block).toBeGreaterThan(0n)
  }, 15_000)

  it('resolves ARB proxy as verified and detects proxy pattern', async () => {
    const contract = await resolveContract('0x912CE59144191C1204E64559FE8253a0e49E6548', 'arbitrum', config)
    expect(contract.isVerified).toBe(true)
    const client = createClient('arbitrum', config)
    const proxy = await resolveProxyChain('0x912CE59144191C1204E64559FE8253a0e49E6548', contract.abi, client)
    expect(proxy).not.toBeNull()
    expect(proxy!.implementationAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
  }, 30_000)
})

describe('sepolia — test contract', () => {
  it('can connect to Sepolia RPC', async () => {
    const client = createClient('sepolia', config)
    const block = await client.getBlockNumber()
    expect(block).toBeGreaterThan(0n)
  }, 15_000)
})
