import { describe, it, expect } from 'vitest'
import { filtrarPastaPersonagens, filtrarArvoreCenarios } from '../lib/filtroCampanha'
import type { PastaCenarioNode, PastaNode } from '../lib/types'

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
  it('mantém só caminhos permitidos e poda pastas vazias', () => {
    const r = filtrarPastaPersonagens(pastaP, new Set(['personagens-soltos/a.json']))
    expect(r.personagens.map((p) => p.slug)).toEqual(['a'])
    expect(r.subpastas).toHaveLength(0) // viloes sem match e vazia podadas
  })
  it('subpasta com match sobrevive', () => {
    const r = filtrarPastaPersonagens(pastaP, new Set(['personagens-soltos/viloes/x.json']))
    expect(r.personagens).toHaveLength(0)
    expect(r.subpastas.map((s) => s.slug)).toEqual(['viloes'])
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
  it('mantém cenário permitido', () => {
    const r = filtrarArvoreCenarios(arvoreC, new Set(['a']))
    expect(r.cenarios.map((c) => c.id)).toEqual(['a'])
    expect(r.subpastas).toHaveLength(0)
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
  it('pasta sem nada permitido é podada; com match fica', () => {
    expect(filtrarArvoreCenarios(arvoreC, new Set(['d'])).subpastas.map((s) => s.slug)).toEqual(['p1'])
    expect(filtrarArvoreCenarios(arvoreC, new Set(['a'])).subpastas).toHaveLength(0)
  })
})
