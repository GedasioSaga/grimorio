import { describe, it, expect } from 'vitest'
import { JANELA_HISTORICO, normalizarChat } from '../lib/chatIA'

describe('normalizarChat', () => {
  it('aceita formato { mensagens: [...] }', () => {
    const raw = { mensagens: [{ papel: 'user', texto: 'oi', em: '2026-01-01' }] }
    expect(normalizarChat(raw)).toEqual([{ papel: 'user', texto: 'oi', em: '2026-01-01' }])
  })
  it('descarta entradas inválidas e repara "em" ausente', () => {
    const raw = { mensagens: [{ papel: 'model', texto: 'olá' }, { papel: 'x', texto: 'não' }, null, { texto: 'sem papel' }] }
    expect(normalizarChat(raw)).toEqual([{ papel: 'model', texto: 'olá', em: '' }])
  })
  it('lixo → []', () => {
    expect(normalizarChat(null)).toEqual([])
    expect(normalizarChat('oi')).toEqual([])
  })
  it('janela de histórico é 20', () => {
    expect(JANELA_HISTORICO).toBe(20)
  })
})
