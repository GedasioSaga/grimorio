import { describe, it, expect } from 'vitest'
import {
  acharCampanhaDaSessao,
  achatarCenarios,
  frasesDeVinculos,
  frasesDeVinculosNoEscopo,
  montarContextoCampanha,
} from '../lib/contextoIA'
import type { PastaCenarioNode, VaultTree, Vinculo } from '../lib/types'

describe('acharCampanhaDaSessao', () => {
  const tree = {
    campanhas: [{ id: 'c1', slug: 'rpg', nome: 'RPG', sessoes: [], personagens: [], canvases: [], escritas: [] }],
  } as unknown as VaultTree
  it('acha pelo slug do caminho', () => {
    expect(acharCampanhaDaSessao(tree, 'campanhas/rpg/sessoes/01.json')?.id).toBe('c1')
  })
  it('caminho fora de campanha → null', () => {
    expect(acharCampanhaDaSessao(tree, 'canvases-soltos/x.json')).toBeNull()
  })
})

describe('frasesDeVinculos', () => {
  const nomes: Record<string, string> = { a: 'Alice', b: 'Bob' }
  const nomeDe = (id: string) => nomes[id] ?? null
  const v = (p: Partial<Vinculo>): Vinculo => ({
    id: 'v1', deTipo: 'personagem', deId: 'a', paraTipo: 'personagem', paraId: 'b',
    tipo: 'conhece', notas: '', criadoEm: '', ...p,
  })
  it('monta frases e inclui notas', () => {
    expect(frasesDeVinculos([v({}), v({ id: 'v2', tipo: 'teme', notas: 'desde a guerra' })], nomeDe))
      .toEqual(['Alice conhece Bob', 'Alice teme Bob (desde a guerra)'])
  })
  it('ignora participação em campanha e órfãos', () => {
    expect(frasesDeVinculos([
      v({ paraTipo: 'campanha', paraId: 'c1', tipo: 'participa' }),
      v({ id: 'v2', paraId: 'zzz' }),
    ], nomeDe)).toEqual([])
  })
})

describe('frasesDeVinculosNoEscopo', () => {
  const nomes: Record<string, string> = { a: 'Alice', b: 'Bob', c: 'Caio' }
  const nomeDe = (id: string) => nomes[id] ?? null
  const v = (p: Partial<Vinculo>): Vinculo => ({
    id: 'v1', deTipo: 'personagem', deId: 'a', paraTipo: 'personagem', paraId: 'b',
    tipo: 'conhece', notas: '', criadoEm: '', ...p,
  })
  it('inclui só o par com os dois lados no escopo', () => {
    expect(frasesDeVinculosNoEscopo([v({})], new Set(['a', 'b']), nomeDe))
      .toEqual(['Alice conhece Bob'])
  })
  it('exclui par com um lado fora do escopo (vínculo de outra campanha)', () => {
    expect(frasesDeVinculosNoEscopo([v({ id: 'v2', paraId: 'c', tipo: 'teme' })], new Set(['a', 'b']), nomeDe))
      .toEqual([])
  })
  it('escopo vazio → []', () => {
    expect(frasesDeVinculosNoEscopo([v({})], new Set(), nomeDe)).toEqual([])
  })
})

describe('achatarCenarios', () => {
  const raiz = {
    slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', subpastas: [{
      slug: 'p', nome: 'p', caminho: 'cenarios/p', subpastas: [],
      cenarios: [{ id: 'x', slug: 'x', nome: 'X', caminho: 'x', filhos: [] }],
    }],
    cenarios: [{
      id: 'a', slug: 'a', nome: 'Oxonia', caminho: 'a',
      filhos: [{ id: 'b', slug: 'b', nome: 'Distrito', caminho: 'b', filhos: [] }],
    }],
  } as unknown as PastaCenarioNode
  it('achata com nível e resolve resumo', () => {
    const resumoDe = (id: string) => (id === 'a' ? 'cidade' : '')
    expect(achatarCenarios(raiz, resumoDe)).toEqual([
      { nome: 'Oxonia', resumo: 'cidade', nivel: 0 },
      { nome: 'Distrito', resumo: '', nivel: 1 },
      { nome: 'X', resumo: '', nivel: 0 },
    ])
  })
})

describe('montarContextoCampanha', () => {
  it('monta seções e indenta cenários', () => {
    const ctx = montarContextoCampanha({
      nomeCampanha: 'RPG',
      personagens: [{ nome: 'Alice', resumo: 'maga' }],
      cenarios: [{ nome: 'Oxonia', resumo: 'cidade', nivel: 0 }, { nome: 'Distrito', resumo: '', nivel: 1 }],
      vinculos: ['Alice conhece Bob'],
      notas: 'a sessão começa à noite',
    })
    expect(ctx).toContain('## Campanha\nRPG')
    expect(ctx).toContain('- Alice — maga')
    expect(ctx).toContain('- Oxonia — cidade\n  - Distrito')
    expect(ctx).toContain('## Vínculos\n- Alice conhece Bob')
    expect(ctx).toContain('## Notas da sessão\na sessão começa à noite')
  })
  it('omite seções vazias', () => {
    const ctx = montarContextoCampanha({ nomeCampanha: '', personagens: [], cenarios: [], vinculos: [], notas: '' })
    expect(ctx).toBe('')
  })
})
