import { describe, it, expect } from 'vitest'
import { opcoesDeCenario, resolverVinculoSala } from '../lib/vinculoSalaCenario'

describe('resolverVinculoSala', () => {
  it('cenarioId vazio é sem-vínculo', () => {
    expect(resolverVinculoSala('', {})).toEqual({ estado: 'sem-vinculo', nomeCenario: null })
  })

  it('cenarioId presente no mapa de nomes é vinculado', () => {
    expect(resolverVinculoSala('c1', { c1: 'Cozinha' })).toEqual({ estado: 'vinculado', nomeCenario: 'Cozinha' })
  })

  it('cenarioId ausente do mapa de nomes é quebrado (cenário excluído)', () => {
    expect(resolverVinculoSala('c1', {})).toEqual({ estado: 'quebrado', nomeCenario: null })
  })

  /**
   * "O cenário sumiu" e "ainda não li os cenários" chegam aqui como a MESMA coisa: chave
   * ausente. `vaultPath` é setado antes de `carregarCenarios()` resolver e a sidebar já fica
   * clicável nesse meio-tempo, então dá para abrir um mapa com o cache vazio. Sem a distinção,
   * toda sala ligada piscaria o aviso de quebrado ao abrir o cofre — e alarme falso rotineiro
   * treina o usuário a ignorar o alarme de verdade.
   */
  it('cache ainda não carregado é "carregando", não "quebrado"', () => {
    expect(resolverVinculoSala('c1', {}, false)).toEqual({ estado: 'carregando', nomeCenario: null })
  })

  it('sem vínculo continua sem vínculo mesmo carregando', () => {
    expect(resolverVinculoSala('', {}, false)).toEqual({ estado: 'sem-vinculo', nomeCenario: null })
  })

  it('cenário já em cache é vinculado mesmo com o resto ainda carregando', () => {
    expect(resolverVinculoSala('c1', { c1: 'Cozinha' }, false)).toEqual({
      estado: 'vinculado',
      nomeCenario: 'Cozinha',
    })
  })
})

describe('opcoesDeCenario', () => {
  it('ordena por nome (pt-BR)', () => {
    const opcoes = opcoesDeCenario([
      { id: 'b', nome: 'Zeta' },
      { id: 'a', nome: 'Álamo' },
    ])
    expect(opcoes.map((o) => o.id)).toEqual(['a', 'b'])
  })

  it('lista vazia não quebra', () => {
    expect(opcoesDeCenario([])).toEqual([])
  })
})
