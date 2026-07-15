import { describe, it, expect } from 'vitest'
import { paresParaLigar } from '../lib/ligacaoCenario'
import type { PastaCenarioNode } from '../lib/types'

function no(id: string, filhos: any[] = []) {
  return { id, slug: id, nome: id, caminho: id, filhos }
}
const arvore: PastaCenarioNode = {
  slug: 'raiz', nome: 'raiz', caminho: 'cenarios', subpastas: [],
  cenarios: [no('a', [no('b', [no('c')]), no('d')])],
}

describe('paresParaLigar', () => {
  it('cenário do meio liga ao pai e aos filhos', () => {
    expect(paresParaLigar(arvore, 'b')).toEqual([
      { paiId: 'a', filhoId: 'b' },
      { paiId: 'b', filhoId: 'c' },
    ])
  })
  it('raiz liga só aos filhos', () => {
    expect(paresParaLigar(arvore, 'a')).toEqual([
      { paiId: 'a', filhoId: 'b' },
      { paiId: 'a', filhoId: 'd' },
    ])
  })
  it('folha liga só ao pai', () => {
    expect(paresParaLigar(arvore, 'c')).toEqual([{ paiId: 'b', filhoId: 'c' }])
  })
  it('id inexistente não gera pares', () => {
    expect(paresParaLigar(arvore, 'zzz')).toEqual([])
  })
})
