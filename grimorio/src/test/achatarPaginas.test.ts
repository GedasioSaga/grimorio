import { describe, it, expect } from 'vitest'
import { achatarPaginas } from '../lib/achatarPaginas'
import type { PaginaNode } from '../lib/types'

function no(slug: string, titulo: string, filhos: PaginaNode[] = [], erro?: boolean): PaginaNode {
  return { slug, id: slug, titulo, paiId: null, ordem: 0, erro, filhos }
}

describe('achatarPaginas', () => {
  it('DFS pré-ordem: pai antes dos filhos, recursivo em vários níveis', () => {
    const arvore: PaginaNode[] = [
      no('a', 'A', [no('a1', 'A1'), no('a2', 'A2', [no('a2x', 'A2X')])]),
      no('b', 'B'),
    ]
    expect(achatarPaginas(arvore).map((p) => p.slug)).toEqual(['a', 'a1', 'a2', 'a2x', 'b'])
  })

  it('lista vazia retorna []', () => {
    expect(achatarPaginas([])).toEqual([])
  })

  it('preserva slug, titulo e erro', () => {
    expect(achatarPaginas([no('x', 'X', [], true)])).toEqual([{ slug: 'x', titulo: 'X', erro: true }])
  })
})
