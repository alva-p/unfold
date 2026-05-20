import { describe, it, expect } from 'vitest'
import { analyzeSource, buildInheritanceLines, detectOpenZeppelinImports, tryAnalyzeSource } from '../core/ast-analyzer.js'

const ERC20_SOURCE = `
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC20, Ownable {
  uint256 public maxSupply;
  mapping(address => bool) public minters;

  event Minted(address indexed to, uint256 amount);
  error ExceedsMaxSupply();

  function mint(address to, uint256 amount) external onlyOwner {
    _mint(to, amount);
    emit Minted(to, amount);
  }

  function addMinter(address minter) external onlyOwner {
    minters[minter] = true;
  }
}
`

describe('analyzeSource', () => {
  it('extracts contract inheritance', () => {
    const result = analyzeSource(ERC20_SOURCE)
    expect(result).not.toBeNull()
    const myToken = result!.inheritanceTree.find(c => c.name === 'MyToken')
    expect(myToken).toBeDefined()
    expect(myToken!.parents).toContain('ERC20')
    expect(myToken!.parents).toContain('Ownable')
  })

  it('extracts functions with modifiers', () => {
    const result = analyzeSource(ERC20_SOURCE)!
    const mint = result.functions.find(f => f.name === 'mint')
    expect(mint).toBeDefined()
    expect(mint!.modifiers).toContain('onlyOwner')
    expect(mint!.visibility).toBe('external')
  })

  it('extracts events', () => {
    const result = analyzeSource(ERC20_SOURCE)!
    const minted = result.events.find(e => e.name === 'Minted')
    expect(minted).toBeDefined()
    expect(minted!.inputs[0].indexed).toBe(true)
    expect(minted!.inputs[0].type).toBe('address')
  })

  it('extracts custom errors', () => {
    const result = analyzeSource(ERC20_SOURCE)!
    expect(result.errors.some(e => e.name === 'ExceedsMaxSupply')).toBe(true)
  })

  it('extracts state variables with sequential slots', () => {
    const result = analyzeSource(ERC20_SOURCE)!
    const maxSupply = result.stateVariables.find(v => v.name === 'maxSupply')
    expect(maxSupply?.slot).toBe(0)
    const minters = result.stateVariables.find(v => v.name === 'minters')
    expect(minters?.slot).toBe(1)
    expect(minters?.type).toContain('mapping')
  })

  it('extracts imports', () => {
    const result = analyzeSource(ERC20_SOURCE)!
    expect(result.imports.some(i => i.includes('ERC20'))).toBe(true)
    expect(result.imports.some(i => i.includes('Ownable'))).toBe(true)
  })

  it('returns null for null source', () => {
    expect(analyzeSource(null)).toBeNull()
    expect(analyzeSource('')).toBeNull()
  })
})

describe('tryAnalyzeSource', () => {
  it('returns null on invalid Solidity without throwing', () => {
    expect(tryAnalyzeSource('this is not solidity }{{')).toBeNull()
  })

  it('parses valid source', () => {
    const result = tryAnalyzeSource('pragma solidity ^0.8.0; contract Foo {}')
    expect(result).not.toBeNull()
    expect(result!.inheritanceTree[0].name).toBe('Foo')
  })
})

describe('buildInheritanceLines', () => {
  it('builds tree from single contract with no parents', () => {
    const lines = buildInheritanceLines([{ name: 'Foo', parents: [] }])
    expect(lines).toEqual(['Foo'])
  })

  it('builds tree with parent chain', () => {
    const contracts = [
      { name: 'Base', parents: [] },
      { name: 'Middle', parents: ['Base'] },
      { name: 'Top', parents: ['Middle'] },
    ]
    const lines = buildInheritanceLines(contracts, 'Top')
    expect(lines[0]).toBe('Top')
    expect(lines[1]).toContain('Middle')
    expect(lines[2]).toContain('Base')
  })

  it('handles diamond inheritance without infinite loop', () => {
    const contracts = [
      { name: 'Base', parents: [] },
      { name: 'A', parents: ['Base'] },
      { name: 'B', parents: ['Base'] },
      { name: 'Diamond', parents: ['A', 'B'] },
    ]
    const lines = buildInheritanceLines(contracts, 'Diamond')
    const baseCount = lines.filter(l => l.includes('Base')).length
    expect(baseCount).toBe(2) // appears once per branch, second time as "(seen)"
  })

  it('returns empty for empty contracts', () => {
    expect(buildInheritanceLines([])).toEqual([])
  })
})

describe('detectOpenZeppelinImports', () => {
  it('detects OZ imports', () => {
    const result = analyzeSource(ERC20_SOURCE)!
    const oz = detectOpenZeppelinImports(result.imports)
    expect(oz.length).toBe(2)
    expect(oz.every(i => i.includes('@openzeppelin'))).toBe(true)
  })

  it('returns empty when no OZ imports', () => {
    expect(detectOpenZeppelinImports(['./Foo.sol', '../Bar.sol'])).toEqual([])
  })
})
