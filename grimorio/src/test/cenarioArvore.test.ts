import { describe, expect, it } from 'vitest'
import { coletarCenarioRefs, contarDescendentes, encontrarCenarioNode, paiDoCenario } from '../lib/cenarioArvore'
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

const arvorePais: PastaCenarioNode = {
  slug: 'raiz', nome: 'raiz', caminho: 'cenarios', subpastas: [],
  cenarios: [no('a', [no('b', [no('c')])]), no('d')],
}

describe('paiDoCenario', () => {
  it('acha o pai de um filho', () => {
    expect(paiDoCenario(arvorePais, 'b')).toBe('a')
  })
  it('acha o pai de um neto', () => {
    expect(paiDoCenario(arvorePais, 'c')).toBe('b')
  })
  it('retorna null para raiz', () => {
    expect(paiDoCenario(arvorePais, 'a')).toBeNull()
  })
  it('retorna null para id inexistente', () => {
    expect(paiDoCenario(arvorePais, 'zzz')).toBeNull()
  })
  it('acha o pai de um cenário dentro de subpasta', () => {
    expect(paiDoCenario(raiz, 'bairro')).toBe('cidade')
  })
})
