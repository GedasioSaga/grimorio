import { describe, it, expect } from 'vitest'
import { relRetratoDoCard } from '../lib/copiaImagemCard'

const personagens = { p1: { retrato: 'imagens/p1.png' }, p2: { retrato: null } }
const cenarios = { c1: { retrato: 'imagens/c1.png' }, c2: { retrato: null } }

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
