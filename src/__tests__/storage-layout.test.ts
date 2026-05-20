import { describe, it, expect } from 'vitest'
import { findStorageSlot, decodeStorageValue } from '../core/storage-layout.js'

const SIMPLE_SOURCE = `
pragma solidity ^0.8.0;
contract Simple {
  address public owner;
  uint256 public totalSupply;
  mapping(address => uint256) public balanceOf;
  bool public paused;
}
`

describe('findStorageSlot', () => {
  it('resolves numeric slot 0', () => {
    const result = findStorageSlot(null, '0')
    expect(result?.kind).toBe('slot')
    expect(result?.slot).toBe('0x' + '0'.repeat(64))
  })

  it('resolves numeric slot 3', () => {
    const result = findStorageSlot(null, '3')
    expect(result?.kind).toBe('slot')
    expect(result?.slot).toBe('0x' + '0'.repeat(63) + '3')
  })

  it('resolves hex slot', () => {
    const result = findStorageSlot(null, '0xff')
    expect(result?.kind).toBe('slot')
    expect(result?.slot).toBe('0x' + '0'.repeat(62) + 'ff')
  })

  it('resolves named variable "owner" to slot 0', () => {
    const result = findStorageSlot(SIMPLE_SOURCE, 'owner')
    expect(result?.kind).toBe('variable')
    expect(result?.slot).toBe('0x' + '0'.repeat(64))
    expect(result?.variable?.name).toBe('owner')
    expect(result?.variable?.type).toBe('address')
  })

  it('resolves named variable "totalSupply" to slot 1', () => {
    const result = findStorageSlot(SIMPLE_SOURCE, 'totalSupply')
    expect(result?.kind).toBe('variable')
    expect(result?.slot).toBe('0x' + '0'.repeat(63) + '1')
  })

  it('resolves mapping slot via keccak256', () => {
    const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    const result = findStorageSlot(SIMPLE_SOURCE, `balanceOf[${addr}]`)
    expect(result?.kind).toBe('mapping')
    expect(result?.slot).toMatch(/^0x[0-9a-f]{64}$/)
    expect(result?.mappingKey).toBe(addr)
  })

  it('returns null for unknown variable name', () => {
    const result = findStorageSlot(SIMPLE_SOURCE, 'nonExistent')
    expect(result).toBeNull()
  })

  it('returns null for mapping when source is null', () => {
    const result = findStorageSlot(null, 'balanceOf[0x1234]')
    expect(result).toBeNull()
  })
})

describe('decodeStorageValue', () => {
  it('decodes address type', () => {
    const raw = '0x000000000000000000000000d8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as `0x${string}`
    const result = decodeStorageValue(raw, { name: 'owner', type: 'address', visibility: 'public' })
    expect(result.toLowerCase()).toBe('0xd8da6bf26964af9d7eed9e03e53415d37aa96045')
  })

  it('decodes uint256 type', () => {
    const raw = '0x0000000000000000000000000000000000000000000000000000000000000064' as `0x${string}`
    const result = decodeStorageValue(raw, { name: 'supply', type: 'uint256', visibility: 'public' })
    expect(result).toBe('100')
  })

  it('decodes bool true', () => {
    const raw = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`
    const result = decodeStorageValue(raw, { name: 'paused', type: 'bool', visibility: 'public' })
    expect(result).toBe('true')
  })

  it('decodes bool false', () => {
    const raw = '0x' + '0'.repeat(64) as `0x${string}`
    const result = decodeStorageValue(raw, { name: 'paused', type: 'bool', visibility: 'public' })
    expect(result).toBe('false')
  })

  it('returns raw hex when no variable type', () => {
    const raw = '0xdeadbeef' as `0x${string}`
    expect(decodeStorageValue(raw)).toBe('0xdeadbeef')
  })

  it('returns 0x for undefined raw', () => {
    expect(decodeStorageValue(undefined)).toBe('0x')
  })
})
