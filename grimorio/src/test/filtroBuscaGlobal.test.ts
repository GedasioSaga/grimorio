import { describe, it, expect } from 'vitest'
import { arvoreFiltradaPorCampanha } from '../lib/filtroBuscaGlobal'
import { buscarGlobal } from '../lib/buscaGlobal'
import type { VaultTree, Vinculo } from '../lib/types'
import { TIPO_PARTICIPA } from '../lib/vinculos'

function tree(parcial: Partial<VaultTree> = {}): VaultTree {
  return {
    campanhas: [],
    canvasesSoltos: [],
    mapasSoltos: [],
    personagensSoltos: { slug: 'raiz', nome: 'raiz', caminho: 'personagens-soltos', personagens: [], subpastas: [] },
    cenarios: { slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', cenarios: [], subpastas: [] },
    itens: { slug: 'itens', nome: 'Itens', caminho: 'itens', itens: [], subpastas: [] },
    ...parcial,
  }
}

function participa(entidadeId: string, campanhaId: string): Vinculo {
  return { id: `${entidadeId}->${campanhaId}`, deTipo: 'personagem', deId: entidadeId, paraTipo: 'campanha', paraId: campanhaId, tipo: TIPO_PARTICIPA, notas: '', criadoEm: '' }
}

describe('arvoreFiltradaPorCampanha', () => {
  it('sem campanhaFiltro devolve a mesma árvore (mesma referência)', () => {
    const t = tree()
    expect(arvoreFiltradaPorCampanha(t, [], null, {}, {})).toBe(t)
  })

  it('campanhaFiltro de campanha inexistente (apagada) devolve a árvore inteira — autocura', () => {
    const t = tree({ campanhas: [{ id: 'c1', slug: 'c1', nome: 'C1', personagens: [], sessoes: [], canvases: [], escritas: [] }] })
    expect(arvoreFiltradaPorCampanha(t, [], 'fantasma', {}, {})).toBe(t)
  })

  it('mostra só a campanha selecionada, escondendo as demais', () => {
    const t = tree({
      campanhas: [
        { id: 'c1', slug: 'c1', nome: 'Campanha 1', personagens: [], sessoes: [], canvases: [], escritas: [] },
        { id: 'c2', slug: 'c2', nome: 'Campanha 2', personagens: [], sessoes: [], canvases: [], escritas: [] },
      ],
    })
    const filtrado = arvoreFiltradaPorCampanha(t, [], 'c1', {}, {})
    expect(filtrado.campanhas.map((c) => c.id)).toEqual(['c1'])
  })

  it('poda personagem/item/canvas/mapa soltos que não pertencem à campanha, mantém os que pertencem', () => {
    const t = tree({
      campanhas: [{ id: 'c1', slug: 'c1', nome: 'C1', personagens: [], sessoes: [], canvases: [], escritas: [] }],
      personagensSoltos: {
        slug: 'raiz', nome: 'raiz', caminho: 'personagens-soltos', subpastas: [],
        personagens: [
          { slug: 'joao', nome: 'João (da campanha)', caminho: 'personagens-soltos/joao.json', id: 'p1' },
          { slug: 'maria', nome: 'Maria (sem campanha)', caminho: 'personagens-soltos/maria.json', id: 'p2' },
        ],
      },
      canvasesSoltos: [
        { slug: 'cv1', nome: 'Canvas da campanha', caminho: 'canvases-soltos/cv1.json', id: 'cv1' },
        { slug: 'cv2', nome: 'Canvas sem campanha', caminho: 'canvases-soltos/cv2.json', id: 'cv2' },
      ],
    })
    const vinculos = [participa('p1', 'c1'), participa('cv1', 'c1')]
    const caminhoPorId = { p1: 'personagens-soltos/joao.json', p2: 'personagens-soltos/maria.json' }
    const filtrado = arvoreFiltradaPorCampanha(t, vinculos, 'c1', caminhoPorId, {})
    expect(filtrado.personagensSoltos.personagens.map((p) => p.nome)).toEqual(['João (da campanha)'])
    expect(filtrado.canvasesSoltos.map((c) => c.nome)).toEqual(['Canvas da campanha'])
  })

  it('combinado com buscarGlobal: resultado de outra campanha não aparece quando o filtro está ativo', () => {
    const t = tree({
      campanhas: [
        {
          id: 'c1', slug: 'c1', nome: 'Campanha 1', canvases: [], escritas: [],
          personagens: [{ slug: 'castelao', nome: 'Castelão', caminho: 'campanhas/c1/personagens/castelao.json', id: 'p1' }],
          sessoes: [],
        },
        {
          id: 'c2', slug: 'c2', nome: 'Campanha 2', canvases: [], escritas: [],
          personagens: [{ slug: 'castelano', nome: 'Castelano', caminho: 'campanhas/c2/personagens/castelano.json', id: 'p2' }],
          sessoes: [],
        },
      ],
    })
    const filtrado = arvoreFiltradaPorCampanha(t, [], 'c1', {}, {})
    const resultados = buscarGlobal(filtrado, 'castel')
    expect(resultados.map((r) => r.nome)).toEqual(['Castelão'])
  })
})
