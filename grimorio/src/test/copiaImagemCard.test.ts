import { describe, it, expect } from 'vitest'
import { relRetratoDoCard } from '../lib/copiaImagemCard'

const personagens = {
  p1: { versoes: [{ id: 'pv1', nome: 'P1', retrato: 'imagens/p1.png', resumo: '', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [] }], versaoAtivaId: 'pv1' },
  p2: { versoes: [{ id: 'pv2', nome: 'P2', retrato: null, resumo: '', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [] }], versaoAtivaId: 'pv2' },
}
const cenarios = {
  c1: { versoes: [{ id: 'v1', nome: 'Base', retrato: 'imagens/c1.png', resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '', imagens: [] }], versaoAtivaId: 'v1' },
  c2: { versoes: [{ id: 'v2', nome: 'Base', retrato: null, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '', imagens: [] }], versaoAtivaId: 'v2' },
}

describe('relRetratoDoCard', () => {
  it('card de personagem com retrato', () => {
    expect(
      relRetratoDoCard({ type: 'character-card', props: { personagemId: 'p1' } }, personagens, cenarios),
    ).toBe('imagens/p1.png')
  })
  it('card de cenário com retrato', () => {
    expect(
      relRetratoDoCard({ type: 'cenario-card', props: { cenarioId: 'c1' } }, personagens, cenarios),
    ).toBe('imagens/c1.png')
  })
  it('card sem retrato → null', () => {
    expect(
      relRetratoDoCard({ type: 'character-card', props: { personagemId: 'p2' } }, personagens, cenarios),
    ).toBeNull()
  })
  it('registro inexistente → null', () => {
    expect(
      relRetratoDoCard({ type: 'cenario-card', props: { cenarioId: 'zzz' } }, personagens, cenarios),
    ).toBeNull()
  })
  it('shape nulo → null', () => {
    expect(relRetratoDoCard(null, personagens, cenarios)).toBeNull()
  })
  it('outro tipo de shape (não-card) → null', () => {
    expect(relRetratoDoCard({ type: 'geo', props: {} }, personagens, cenarios)).toBeNull()
  })
})
