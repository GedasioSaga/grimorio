import { describe, it, expect } from 'vitest'
import { buscarGlobal } from '../lib/buscaGlobal'
import type { CenarioNode, VaultTree } from '../lib/types'

function ref(nome: string, caminho = `x/${nome}.json`) {
  return { slug: nome.toLowerCase(), nome, caminho, id: `id-${nome}` }
}
function cen(nome: string, filhos: CenarioNode[] = []): CenarioNode {
  return { id: `id-${nome}`, slug: nome.toLowerCase(), nome, caminho: `cenarios/${nome}`, filhos }
}

const arvoreVazia = {
  slug: 'raiz', nome: 'raiz', caminho: 'x', personagens: [], subpastas: [],
}

function tree(parcial: Partial<VaultTree> = {}): VaultTree {
  return {
    campanhas: [],
    canvasesSoltos: [],
    mapasSoltos: [],
    personagensSoltos: arvoreVazia,
    cenarios: { slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', cenarios: [], subpastas: [] },
    itens: { slug: 'itens', nome: 'Itens', caminho: 'itens', itens: [], subpastas: [] },
    ...parcial,
  }
}

describe('buscarGlobal', () => {
  it('tree null ou termo vazio devolvem lista vazia', () => {
    expect(buscarGlobal(null, 'cast')).toEqual([])
    expect(buscarGlobal(tree(), '')).toEqual([])
    expect(buscarGlobal(tree(), '   ')).toEqual([])
  })

  it('cofre sem nada e termo preenchido também devolve lista vazia (não quebra)', () => {
    expect(buscarGlobal(tree(), 'castelo')).toEqual([])
  })

  it('acha personagem solto, ignorando acento e caixa', () => {
    const t = tree({ personagensSoltos: { ...arvoreVazia, personagens: [ref('João Ferreira')] } })
    const r = buscarGlobal(t, 'joao')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ tipo: 'personagem', nome: 'João Ferreira' })
  })

  it('acha personagem de campanha, cenário, item, canvas e mapa — cada um com o tipo certo', () => {
    const t = tree({
      personagensSoltos: { ...arvoreVazia, personagens: [ref('Castelo Guarda')] },
      cenarios: { slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', cenarios: [cen('Castelo Velho')], subpastas: [] },
      itens: { slug: 'itens', nome: 'Itens', caminho: 'itens', itens: [ref('Chave do Castelo')], subpastas: [] },
      canvasesSoltos: [ref('Mapa do Castelo')],
      mapasSoltos: [ref('Castelo - Planta Baixa')],
      campanhas: [{
        id: 'c1', slug: 'campanha-1', nome: 'Campanha 1',
        sessoes: [], canvases: [], escritas: [],
        personagens: [ref('Castelão')],
      }],
    })
    const r = buscarGlobal(t, 'castelo')
    const tipos = r.map((x) => x.tipo).sort()
    expect(tipos).toEqual(['canvas', 'cenario', 'item', 'mapa', 'personagem'])
    // "Castelão" não casa: "castelo" não é substring de "castelao"
    expect(r.find((x) => x.nome === 'Castelão')).toBeUndefined()
  })

  it('personagem de campanha ganha o nome da campanha como rótulo', () => {
    const t = tree({
      campanhas: [{
        id: 'c1', slug: 'c1', nome: 'A Queda de Goa',
        sessoes: [], canvases: [], escritas: [], personagens: [ref('Castelo')],
      }],
    })
    const r = buscarGlobal(t, 'castelo')
    expect(r[0].caminhoRotulo).toBe('A Queda de Goa')
  })

  it('sessão e escrita de campanha entram com tipo próprio', () => {
    const t = tree({
      campanhas: [{
        id: 'c1', slug: 'c1', nome: 'Camp',
        sessoes: [ref('Sessão do Castelo')], canvases: [], escritas: [ref('Escrita do Castelo')], personagens: [],
      }],
    })
    const r = buscarGlobal(t, 'castelo')
    expect(r.map((x) => x.tipo).sort()).toEqual(['escrita', 'sessao'])
  })

  it('ordena prefixo antes de palavra, palavra antes de meio (mesma regra do buscaArvore)', () => {
    const t = tree({
      personagensSoltos: {
        ...arvoreVazia,
        personagens: [ref('Alcaste'), ref('Castelo Velho'), ref('Reino de Goa: Castelo')],
      },
    })
    const r = buscarGlobal(t, 'cast')
    expect(r.map((x) => x.nome)).toEqual(['Castelo Velho', 'Reino de Goa: Castelo', 'Alcaste'])
  })

  it('empate total (mesmo nome, mesma classe) desempata por tipo — ordem fixa e documentada', () => {
    // cenário "Taverna" e item "Taverna": nome, classe (prefixo) e tamanho idênticos
    const t = tree({
      cenarios: { slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', cenarios: [cen('Taverna')], subpastas: [] },
      itens: { slug: 'itens', nome: 'Itens', caminho: 'itens', itens: [ref('Taverna')], subpastas: [] },
    })
    const r = buscarGlobal(t, 'taverna')
    expect(r.map((x) => x.tipo)).toEqual(['item', 'cenario']) // item vem antes de cenário na ORDEM_TIPO
  })

  it('entidade sem nome (string vazia) nunca casa com termo não-vazio', () => {
    const t = tree({ personagensSoltos: { ...arvoreVazia, personagens: [ref('')] } })
    expect(buscarGlobal(t, 'a')).toEqual([])
  })

  it('rótulo de pasta aninhada segue o corte de dois níveis com "…/"', () => {
    const t = tree({
      personagensSoltos: {
        ...arvoreVazia,
        subpastas: [{
          slug: 'a', nome: 'A', caminho: 'p/a', personagens: [],
          subpastas: [{
            slug: 'b', nome: 'B', caminho: 'p/a/b', personagens: [],
            subpastas: [{ slug: 'c', nome: 'C', caminho: 'p/a/b/c', personagens: [ref('Castelo')], subpastas: [] }],
          }],
        }],
      },
    })
    expect(buscarGlobal(t, 'castelo')[0].caminhoRotulo).toBe('…/B/C')
  })
})
