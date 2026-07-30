import { describe, it, expect } from 'vitest'
import { normalizarCenario, normalizarPersonagem } from '../lib/vaultRepo'
import { aplicarPatchPersonagem } from '../lib/personagemVersao'
import { aplicarPatchCenario } from '../lib/cenarioVersao'
import type { Cenario, Personagem } from '../lib/types'

// O foco tem 3 pontos onde some em silêncio: o normalizador (que reconstrói campo a campo),
// a lista CHAVES_VERSAO (que roteia o patch) e o spread da migração legada.

describe('foco sobrevive ao round-trip do JSON', () => {
  it('personagem com versões guarda e devolve o foco', () => {
    const p = normalizarPersonagem({
      id: 'p1', versoes: [{ id: 'v1', nome: 'Hawk', retrato: 'a.png', foco: { x: 50, y: 12 } }],
      versaoAtivaId: 'v1',
    })
    expect(p.versoes[0].foco).toEqual({ x: 50, y: 12 })
  })

  it('cenário com versões guarda e devolve o foco', () => {
    const c = normalizarCenario({
      id: 'c1', nome: 'Goa',
      versoes: [{ id: 'v1', nome: 'Dia', retrato: 'a.png', foco: { x: 0, y: 100 } }],
      versaoAtivaId: 'v1',
    })
    expect(c.versoes[0].foco).toEqual({ x: 0, y: 100 })
  })

  it('sem foco fica undefined (some do arquivo em vez de virar campo vazio)', () => {
    const p = normalizarPersonagem({ id: 'p1', versoes: [{ id: 'v1', nome: 'Hawk' }], versaoAtivaId: 'v1' })
    expect(p.versoes[0].foco).toBeUndefined()
    expect(JSON.stringify(p.versoes[0])).not.toContain('foco')
  })

  it('foco corrompido no disco vira undefined, não quebra o carregamento', () => {
    const p = normalizarPersonagem({
      id: 'p1', versoes: [{ id: 'v1', nome: 'Hawk', foco: { x: 'topo', y: 999 } }], versaoAtivaId: 'v1',
    })
    expect(p.versoes[0].foco).toBeUndefined()
  })
})

describe('migração de arquivo plano legado', () => {
  it('personagem sem versoes leva o foco pra forma base', () => {
    const p = normalizarPersonagem({ id: 'p1', nome: 'Hawk', retrato: 'a.png', foco: { x: 50, y: 0 } })
    expect(p.versoes).toHaveLength(1)
    expect(p.versoes[0].foco).toEqual({ x: 50, y: 0 })
  })

  it('cenário sem versoes leva o foco pra versão Base', () => {
    const c = normalizarCenario({ id: 'c1', nome: 'Goa', retrato: 'a.png', foco: { x: 50, y: 0 } })
    expect(c.versoes).toHaveLength(1)
    expect(c.versoes[0].nome).toBe('Base')
    expect(c.versoes[0].foco).toEqual({ x: 50, y: 0 })
  })
})

const duasFormas: Personagem = {
  id: 'p1', nome: 'Hulk', versaoAtivaId: 'v2', criadoEm: '', modificadoEm: '',
  versoes: [
    { id: 'v1', nome: 'Bruce Banner', retrato: null, resumo: '', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [] },
    { id: 'v2', nome: 'Hulk', retrato: null, resumo: '', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [] },
  ],
}

const duasVersoes: Cenario = {
  id: 'c1', nome: 'Goa', personagens: [], versaoAtivaId: 'v2', criadoEm: '', modificadoEm: '',
  versoes: [
    { id: 'v1', nome: 'Dia', retrato: null, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '', imagens: [] },
    { id: 'v2', nome: 'Noite', retrato: null, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '', imagens: [] },
  ],
}

describe('patch de foco vai pra versão ativa, não pro topo', () => {
  it('personagem: só a forma ativa muda', () => {
    const r = aplicarPatchPersonagem(duasFormas, { foco: { x: 50, y: 10 } })
    expect(r.versoes[1].foco).toEqual({ x: 50, y: 10 })
    expect(r.versoes[0].foco).toBeUndefined()
    // fora de CHAVES_VERSAO_PERSONAGEM, o foco pousaria aqui e valeria pras duas formas
    expect(r).not.toHaveProperty('foco')
  })

  it('cenário: só a versão ativa muda', () => {
    const r = aplicarPatchCenario(duasVersoes, { foco: { x: 0, y: 100 } })
    expect(r.versoes[1].foco).toEqual({ x: 0, y: 100 })
    expect(r.versoes[0].foco).toBeUndefined()
    expect(r).not.toHaveProperty('foco')
  })
})
