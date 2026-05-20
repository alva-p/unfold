import { describe, it, expect } from 'vitest'
import { detectStandards, standardsToLabels } from '../core/standards.js'
import type { AbiItem } from '../types.js'

const fn = (name: string, inputs: number = 0, mutability = 'nonpayable'): AbiItem => ({
  type: 'function',
  name,
  inputs: Array.from({ length: inputs }, (_, i) => ({ name: `p${i}`, type: 'address' })),
  stateMutability: mutability,
})

describe('detectStandards', () => {
  it('detects ERC-20', () => {
    const abi: AbiItem[] = [
      fn('transfer'), fn('approve'), fn('allowance', 0, 'view'),
      fn('balanceOf', 0, 'view'), fn('totalSupply', 0, 'view'),
    ]
    const s = detectStandards(abi)
    expect(s.erc20).toBe(true)
    expect(s.erc721).toBe(false)
  })

  it('detects ERC-721 via safeTransferFrom with 4 inputs', () => {
    const abi: AbiItem[] = [
      fn('ownerOf', 0, 'view'),
      { type: 'function', name: 'safeTransferFrom', inputs: Array.from({ length: 4 }, (_, i) => ({ name: `p${i}`, type: 'address' })), stateMutability: 'nonpayable' },
    ]
    const s = detectStandards(abi)
    expect(s.erc721).toBe(true)
    expect(s.erc20).toBe(false)
  })

  it('detects ERC-1155 via safeTransferFrom with 5 inputs', () => {
    const abi: AbiItem[] = [
      fn('balanceOfBatch', 0, 'view'),
      { type: 'function', name: 'safeTransferFrom', inputs: Array.from({ length: 5 }, (_, i) => ({ name: `p${i}`, type: 'address' })), stateMutability: 'nonpayable' },
    ]
    const s = detectStandards(abi)
    expect(s.erc1155).toBe(true)
  })

  it('detects ERC-2612 via permit with exactly 7 inputs', () => {
    const abi: AbiItem[] = [
      { type: 'function', name: 'permit', inputs: Array.from({ length: 7 }, (_, i) => ({ name: `p${i}`, type: 'address' })), stateMutability: 'nonpayable' },
    ]
    const s = detectStandards(abi)
    expect(s.erc2612).toBe(true)
  })

  it('does NOT detect ERC-2612 for permit with wrong input count', () => {
    const abi: AbiItem[] = [
      { type: 'function', name: 'permit', inputs: Array.from({ length: 3 }, (_, i) => ({ name: `p${i}`, type: 'address' })), stateMutability: 'nonpayable' },
    ]
    const s = detectStandards(abi)
    expect(s.erc2612).toBe(false)
  })

  it('detects Ownable', () => {
    const abi: AbiItem[] = [fn('owner', 0, 'view'), fn('transferOwnership')]
    const s = detectStandards(abi)
    expect(s.ownable).toBe(true)
    expect(s.ownable2Step).toBe(false)
  })

  it('detects Ownable2Step over Ownable when both present', () => {
    const abi: AbiItem[] = [
      fn('owner', 0, 'view'), fn('transferOwnership'),
      fn('pendingOwner', 0, 'view'), fn('acceptOwnership'),
    ]
    const s = detectStandards(abi)
    expect(s.ownable).toBe(true)
    expect(s.ownable2Step).toBe(true)
    const labels = standardsToLabels(s)
    expect(labels).toContain('Ownable2Step')
    expect(labels).not.toContain('Ownable')
  })

  it('detects Pausable', () => {
    const abi: AbiItem[] = [fn('paused', 0, 'view'), fn('pause'), fn('unpause')]
    const s = detectStandards(abi)
    expect(s.pausable).toBe(true)
  })

  it('detects AccessControl', () => {
    const abi: AbiItem[] = [fn('hasRole', 0, 'view'), fn('grantRole'), fn('revokeRole')]
    const s = detectStandards(abi)
    expect(s.accessControl).toBe(true)
  })

  it('detects ReentrancyGuard from source', () => {
    const s = detectStandards([], 'modifier nonReentrant() { ... }')
    expect(s.reentrancyGuard).toBe(true)
  })

  it('returns all false for empty ABI', () => {
    const s = detectStandards([])
    expect(Object.values(s).every(v => v === false)).toBe(true)
  })
})

describe('standardsToLabels', () => {
  it('returns correct labels for ERC-20 + ERC-2612', () => {
    const s = detectStandards([
      fn('transfer'), fn('approve'), fn('allowance', 0, 'view'),
      fn('balanceOf', 0, 'view'), fn('totalSupply', 0, 'view'),
      { type: 'function', name: 'permit', inputs: Array.from({ length: 7 }, (_, i) => ({ name: `p${i}`, type: 'address' })), stateMutability: 'nonpayable' },
    ])
    const labels = standardsToLabels(s)
    expect(labels).toContain('ERC-20')
    expect(labels).toContain('ERC-2612')
  })

  it('returns empty array for no standards', () => {
    expect(standardsToLabels(detectStandards([]))).toEqual([])
  })
})
