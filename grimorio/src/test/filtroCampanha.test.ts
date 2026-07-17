import { describe, it, expect } from 'vitest'
import { contarCenarios, contarPersonagens, filtrarArvoreCenarios, filtrarCanvasesSoltos, filtrarPastaPersonagens } from '../lib/filtroCampanha'
import type { ItemRef, PastaCenarioNode, PastaNode } from '../lib/types'

const pastaP: PastaNode = {
  slug: 'raiz', nome: 'raiz', caminho: 'personagens-soltos',
  subpastas: [
    {
      slug: 'viloes', nome: 'viloes', caminho: 'personagens-soltos/viloes', subpastas: [],
      personagens: [{ slug: 'x', nome: 'X', caminho: 'personagens-soltos/viloes/x.json' }],
    },
    { slug: 'vazia', nome: 'vazia', caminho: 'personagens-soltos/vazia', subpastas: [], personagens: [] },
  ],
  personagens: [
    { slug: 'a', nome: 'A', caminho: 'personagens-soltos/a.json' },
    { slug: 'b', nome: 'B', caminho: 'personagens-soltos/b.json' },
  ],
}

describe('filtrarPastaPersonagens', () => {
  it('mantém só caminhos permitidos; pastas ficam TODAS visíveis (estrutura não é filtrada)', () => {
    const r = filtrarPastaPersonagens(pastaP, new Set(['personagens-soltos/a.json']))
    expect(r.personagens.map((p) => p.slug)).toEqual(['a'])
    // pasta recém-criada (vazia) precisa aparecer mesmo sob filtro — senão criar parece quebrado
    expect(r.subpastas.map((s) => s.slug)).toEqual(['viloes', 'vazia'])
    expect(r.subpastas[0].personagens).toHaveLength(0)
  })
  it('personagem dentro de subpasta sobrevive quando permitido', () => {
    const r = filtrarPastaPersonagens(pastaP, new Set(['personagens-soltos/viloes/x.json']))
    expect(r.personagens).toHaveLength(0)
    expect(r.subpastas[0].personagens.map((p) => p.slug)).toEqual(['x'])
  })
})

function cen(id: string, filhos: PastaCenarioNode['cenarios'] = []) {
  return { id, slug: id, nome: id, caminho: id, filhos }
}
const arvoreC: PastaCenarioNode = {
  slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios',
  subpastas: [
    { slug: 'p1', nome: 'p1', caminho: 'cenarios/p1', subpastas: [], cenarios: [cen('d')] },
  ],
  cenarios: [cen('a', [cen('b', [cen('c')])])],
}

describe('filtrarArvoreCenarios', () => {
  it('mantém cenário permitido; pastas ficam sempre visíveis', () => {
    const r = filtrarArvoreCenarios(arvoreC, new Set(['a']))
    expect(r.cenarios.map((c) => c.id)).toEqual(['a'])
    expect(r.subpastas.map((s) => s.slug)).toEqual(['p1'])
    expect(r.subpastas[0].cenarios).toHaveLength(0)
  })
  it('cenário permitido traz a subárvore inteira (filhos herdam)', () => {
    const r = filtrarArvoreCenarios(arvoreC, new Set(['a']))
    expect(r.cenarios[0].filhos.map((c) => c.id)).toEqual(['b'])
    expect(r.cenarios[0].filhos[0].filhos.map((c) => c.id)).toEqual(['c'])
  })
  it('ancestral de permitido fica (contexto), irmãos caem', () => {
    const r = filtrarArvoreCenarios(arvoreC, new Set(['c']))
    expect(r.cenarios.map((c) => c.id)).toEqual(['a'])
    expect(r.cenarios[0].filhos.map((c) => c.id)).toEqual(['b'])
    expect(r.cenarios[0].filhos[0].filhos.map((c) => c.id)).toEqual(['c'])
  })
  it('cenário permitido dentro de pasta continua visível', () => {
    const r = filtrarArvoreCenarios(arvoreC, new Set(['d']))
    expect(r.subpastas[0].cenarios.map((c) => c.id)).toEqual(['d'])
  })
})

const canvases: ItemRef[] = [
  { slug: 'a', nome: 'A', caminho: 'canvases-soltos/a.json', id: 'ca' },
  { slug: 'b', nome: 'B', caminho: 'canvases-soltos/b.json', id: 'cb' },
  { slug: 'leg', nome: 'Legado', caminho: 'canvases-soltos/leg.json' }, // sem id (legado)
]

describe('filtrarCanvasesSoltos', () => {
  it('mantém só os canvases com id permitido; sem-id fica sempre visível', () => {
    expect(filtrarCanvasesSoltos(canvases, new Set(['ca'])).map((c) => c.slug)).toEqual(['a', 'leg'])
  })
  it('id fora do conjunto some; canvas sem id (legado/ilegível) não é escondido', () => {
    expect(filtrarCanvasesSoltos(canvases, new Set(['zzz'])).map((c) => c.slug)).toEqual(['leg'])
  })
})

describe('contadores (aviso de ocultos pelo filtro)', () => {
  it('contarPersonagens soma recursivo', () => {
    expect(contarPersonagens(pastaP)).toBe(3) // a, b, viloes/x
    const filtrada = filtrarPastaPersonagens(pastaP, new Set(['personagens-soltos/a.json']))
    expect(contarPersonagens(pastaP) - contarPersonagens(filtrada)).toBe(2) // b e x ocultos
  })
  it('contarCenarios soma sub-cenários e pastas', () => {
    expect(contarCenarios(arvoreC)).toBe(4) // a, b, c, d
    const filtrada = filtrarArvoreCenarios(arvoreC, new Set(['d']))
    expect(contarCenarios(arvoreC) - contarCenarios(filtrada)).toBe(3) // a, b, c ocultos
  })
})
