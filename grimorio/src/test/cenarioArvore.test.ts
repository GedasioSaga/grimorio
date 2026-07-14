import { describe, expect, it } from 'vitest'
import { coletarCenarioRefs, contarDescendentes, encontrarCenarioNode } from '../lib/cenarioArvore'
import type { CenarioNode, PastaCenarioNode } from '../lib/types'

function no(id: string, filhos: CenarioNode[] = []): CenarioNode {
  return { id, slug: id, nome: id, caminho: `cenarios/${id}`, filhos }
}

const raiz: PastaCenarioNode = {
  slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios',
  subpastas: [{
    slug: 'reino', nome: 'Reino', caminho: 'cenarios/reino',
    subpastas: [], cenarios: [no('cidade', [no('bairro', [no('casa')])])],
  }],
  cenarios: [no('floresta')],
}

describe('árvore de cenários (helpers)', () => {
  it('encontra nó por id em qualquer profundidade', () => {
    expect(encontrarCenarioNode(raiz, 'casa')?.caminho).toBe('cenarios/casa')
    expect(encontrarCenarioNode(raiz, 'floresta')?.id).toBe('floresta')
    expect(encontrarCenarioNode(raiz, 'nada')).toBeNull()
  })

  it('coleta todas as refs (pastas + aninhados)', () => {
    const ids = coletarCenarioRefs(raiz).map((r) => r.id).sort()
    expect(ids).toEqual(['bairro', 'casa', 'cidade', 'floresta'])
  })

  it('conta descendentes', () => {
    expect(contarDescendentes(no('x'))).toBe(0)
    expect(contarDescendentes(no('cidade', [no('bairro', [no('casa')])]))).toBe(2)
  })
})
