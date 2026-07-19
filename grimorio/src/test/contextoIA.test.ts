import { describe, it, expect } from 'vitest'
import {
  acharCampanhaDaSessao,
  acharCampanhaPorCaminho,
  achatarCenarios,
  campanhaDeEntidade,
  contextoDeEntidade,
  contextoDoCaminho,
  frasesDeVinculos,
  frasesDeVinculosNoEscopo,
  montarContextoCampanha,
  montarContextoDaCampanha,
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

describe('campanhaDeEntidade', () => {
  const tree = {
    campanhas: [{ id: 'c1', slug: 'rpg', nome: 'RPG', sessoes: [], personagens: [], canvases: [], escritas: [] }],
  } as unknown as VaultTree
  const participa = (deId: string, paraId: string): Vinculo => ({
    id: `v-${deId}`, deTipo: 'personagem', deId, paraTipo: 'campanha', paraId,
    tipo: 'participa', notas: '', criadoEm: '',
  })
  it('acha por vínculo participa', () => {
    expect(campanhaDeEntidade(tree, [participa('a', 'c1')], () => undefined, 'a')?.id).toBe('c1')
  })
  it('sem vínculo, acha personagem pela pasta da campanha', () => {
    const caminhoDe = (id: string) => (id === 'a' ? 'campanhas/rpg/personagens/a.json' : undefined)
    expect(campanhaDeEntidade(tree, [], caminhoDe, 'a')?.slug).toBe('rpg')
  })
  it('cenário global (caminho fora de campanhas/) → null', () => {
    expect(campanhaDeEntidade(tree, [], () => 'cenarios/reino/cidade-alta', 'x')).toBeNull()
  })
  it('sem vínculo e sem caminho → null', () => {
    expect(campanhaDeEntidade(tree, [], () => undefined, 'z')).toBeNull()
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

describe('acharCampanhaPorCaminho', () => {
  const tree = {
    campanhas: [{ id: 'c1', slug: 'rpg', nome: 'RPG', sessoes: [], personagens: [], canvases: [], escritas: [] }],
  } as unknown as VaultTree
  it('acha pelo slug de um caminho de escrita', () => {
    expect(acharCampanhaPorCaminho(tree, 'campanhas/rpg/escrita/lore.notas')?.id).toBe('c1')
  })
  it('caminho fora de campanha → null', () => {
    expect(acharCampanhaPorCaminho(tree, 'canvases-soltos/x')).toBeNull()
  })
})

describe('montarContextoDaCampanha / wrappers', () => {
  const camp = { id: 'c1', slug: 'rpg', nome: 'RPG', sessoes: [], personagens: [], canvases: [], escritas: [] }
  const tree = {
    campanhas: [camp],
    cenarios: {
      slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', subpastas: [],
      cenarios: [{ id: 'cen1', slug: 'oxonia', nome: 'Oxonia', caminho: 'cenarios/oxonia', filhos: [] }],
    },
  } as unknown as VaultTree
  const participa = (deId: string): Vinculo => ({
    id: `v-${deId}`, deTipo: 'personagem', deId, paraTipo: 'campanha', paraId: 'c1',
    tipo: 'participa', notas: '', criadoEm: '',
  })
  const deps = {
    tree,
    personagens: { p1: { id: 'p1', nome: 'Alice', resumo: 'maga' } },
    cenarios: { cen1: { id: 'cen1', nome: 'Oxonia', versoes: [{ id: 'cv1', nome: 'Base', retrato: null, resumo: 'cidade', descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '', imagens: [] }], versaoAtivaId: 'cv1' } },
    vinculos: [participa('p1'), participa('cen1')],
  }

  it('monta o contexto com personagens e cenários no escopo da campanha', () => {
    const ctx = montarContextoDaCampanha(camp as never, deps)
    expect(ctx).toContain('## Campanha\nRPG')
    expect(ctx).toContain('- Alice — maga')
    expect(ctx).toContain('- Oxonia — cidade')
  })

  it('contextoDoCaminho acha a campanha pelo caminho do caderno', () => {
    expect(contextoDoCaminho('campanhas/rpg/escrita/lore.notas', deps)).toContain('## Campanha\nRPG')
  })

  it('contextoDoCaminho fora de campanha → string vazia', () => {
    expect(contextoDoCaminho('canvases-soltos/x', deps)).toBe('')
  })

  it('contextoDeEntidade acha a campanha pelo vínculo participa', () => {
    expect(contextoDeEntidade('p1', { ...deps, caminhoPorId: {} })).toContain('## Campanha\nRPG')
  })
})
