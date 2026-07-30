import { describe, it, expect } from 'vitest'
import {
  CLASSE_MEIO, CLASSE_PALAVRA, CLASSE_PREFIXO,
  buscarCenarios, buscarPersonagens, normalizar, pontuar,
} from '../lib/buscaArvore'
import type { CenarioNode, PastaCenarioNode, PastaNode } from '../lib/types'

function pers(nome: string) {
  return { slug: nome.toLowerCase(), nome, caminho: `x/${nome}.json` }
}
function cen(nome: string, filhos: CenarioNode[] = []): CenarioNode {
  return { id: nome, slug: nome.toLowerCase(), nome, caminho: `cenarios/${nome}`, filhos }
}

describe('normalizar', () => {
  it('tira acento e caixa', () => {
    expect(normalizar('João')).toBe('joao')
    expect(normalizar('Reino de Goá')).toBe('reino de goa')
    expect(normalizar('  Castelo  ')).toBe('castelo')
  })
})

describe('pontuar', () => {
  it('nome que começa com o termo é prefixo', () => {
    expect(pontuar('Castelo Velho', 'cast')).toEqual({ classe: CLASSE_PREFIXO, posicao: 0 })
  })

  it('termo que abre uma palavra no meio do nome é classe palavra', () => {
    const p = pontuar('Reino de Goa: Castelo', 'cast')
    expect(p?.classe).toBe(CLASSE_PALAVRA)
    expect(p?.posicao).toBe('reino de goa: '.length)
  })

  it('dois pontos e hífen contam como separador de palavra', () => {
    expect(pontuar('Goa:Castelo', 'cast')?.classe).toBe(CLASSE_PALAVRA)
    expect(pontuar('Goa-Castelo', 'cast')?.classe).toBe(CLASSE_PALAVRA)
  })

  it('termo no miolo de uma palavra é classe meio', () => {
    expect(pontuar('Alcaste', 'cast')?.classe).toBe(CLASSE_MEIO)
  })

  it('vale a MELHOR ocorrência, não a primeira', () => {
    // "cast" aparece no miolo de "Alcaste" antes de abrir "Castelo"
    const p = pontuar('Alcaste Castelo', 'cast')
    expect(p?.classe).toBe(CLASSE_PALAVRA)
    expect(p?.posicao).toBe('alcaste '.length)
  })

  it('acento não atrapalha nos dois lados', () => {
    expect(pontuar('João Ferreira', 'joao')?.classe).toBe(CLASSE_PREFIXO)
    expect(pontuar('Joao Ferreira', 'joão')?.classe).toBe(CLASSE_PREFIXO)
  })

  it('devolve null quando não casa e quando o termo é vazio', () => {
    expect(pontuar('Castelo', 'zzz')).toBeNull()
    expect(pontuar('Castelo', '   ')).toBeNull()
  })
})

const arvoreP: PastaNode = {
  slug: 'raiz', nome: 'raiz', caminho: 'personagens-soltos',
  personagens: [pers('Alcaste'), pers('Castelo Velho'), pers('Reino de Goa: Castelo')],
  subpastas: [
    {
      slug: 'viloes', nome: 'Vilões', caminho: 'personagens-soltos/viloes',
      personagens: [pers('João Ferreira')],
      subpastas: [
        {
          slug: 'capangas', nome: 'Capangas', caminho: 'personagens-soltos/viloes/capangas',
          personagens: [pers('João o Velho')], subpastas: [],
        },
      ],
    },
  ],
}

describe('buscarPersonagens', () => {
  it('ordena prefixo antes de palavra, e palavra antes de meio', () => {
    const r = buscarPersonagens(arvoreP, 'cast')
    expect(r.map((a) => a.item.nome)).toEqual(['Castelo Velho', 'Reino de Goa: Castelo', 'Alcaste'])
  })

  it('empate de classe desempata pelo nome mais curto', () => {
    const arvore: PastaNode = {
      ...arvoreP, subpastas: [],
      personagens: [pers('Castelo Velho da Colina'), pers('Castelo')],
    }
    expect(buscarPersonagens(arvore, 'cast').map((a) => a.item.nome))
      .toEqual(['Castelo', 'Castelo Velho da Colina'])
  })

  it('rotula a pasta: vazio na raiz, um nível, e corta com … acima de dois', () => {
    const r = buscarPersonagens(arvoreP, 'joao')
    expect(r.map((a) => a.caminhoRotulo)).toEqual(['Vilões/Capangas', 'Vilões'])
    expect(buscarPersonagens(arvoreP, 'alcaste')[0].caminhoRotulo).toBe('')
  })

  it('termo vazio e termo sem match devolvem lista vazia', () => {
    expect(buscarPersonagens(arvoreP, '')).toEqual([])
    expect(buscarPersonagens(arvoreP, '  ')).toEqual([])
    expect(buscarPersonagens(arvoreP, 'zzz')).toEqual([])
  })
})

describe('rótulo com mais de dois níveis', () => {
  it('mostra só os dois últimos, com … na frente', () => {
    const fundo: PastaNode = {
      slug: 'raiz', nome: 'raiz', caminho: 'personagens-soltos', personagens: [],
      subpastas: [{
        slug: 'a', nome: 'A', caminho: 'p/a', personagens: [],
        subpastas: [{
          slug: 'b', nome: 'B', caminho: 'p/a/b', personagens: [],
          subpastas: [{ slug: 'c', nome: 'C', caminho: 'p/a/b/c', personagens: [pers('Castelo')], subpastas: [] }],
        }],
      }],
    }
    expect(buscarPersonagens(fundo, 'cast')[0].caminhoRotulo).toBe('…/B/C')
  })
})

const arvoreC: PastaCenarioNode = {
  slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios',
  cenarios: [cen('Reino de Goa', [cen('Reino de Goa: Castelo', [cen('Reino de Goa: Castelo: Cozinha')])])],
  subpastas: [
    {
      slug: 'mundos', nome: 'Mundos', caminho: 'cenarios/mundos',
      cenarios: [cen('Castelo Velho')], subpastas: [],
    },
  ],
}

describe('buscarCenarios', () => {
  it('acha sub-cenário aninhado e põe os cenários pais no rótulo', () => {
    const r = buscarCenarios(arvoreC, 'cozinha')
    expect(r).toHaveLength(1)
    expect(r[0].item.nome).toBe('Reino de Goa: Castelo: Cozinha')
    expect(r[0].caminhoRotulo).toBe('Reino de Goa/Reino de Goa: Castelo')
  })

  it('varre pastas e cenários aninhados na mesma lista, ranqueados juntos', () => {
    const r = buscarCenarios(arvoreC, 'cast')
    expect(r.map((a) => a.item.nome)).toEqual([
      'Castelo Velho',                    // prefixo
      'Reino de Goa: Castelo',            // palavra, nome mais curto
      'Reino de Goa: Castelo: Cozinha',   // palavra, nome mais longo
    ])
    expect(r[0].caminhoRotulo).toBe('Mundos')
  })

  it('cenário na raiz da seção fica sem rótulo', () => {
    expect(buscarCenarios(arvoreC, 'reino de goa')[0].caminhoRotulo).toBe('')
  })

  it('termo vazio devolve lista vazia', () => {
    expect(buscarCenarios(arvoreC, '')).toEqual([])
  })
})
