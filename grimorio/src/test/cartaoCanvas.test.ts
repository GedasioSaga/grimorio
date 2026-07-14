import { describe, expect, it } from 'vitest'
import { PAINEL_DESCRICAO_LARGURA, ajustarLargura } from '../lib/cartaoCanvas'

describe('ajustarLargura', () => {
  it('abrir um painel soma a largura do painel', () => {
    expect(ajustarLargura(240, 1)).toBe(240 + PAINEL_DESCRICAO_LARGURA)
  })

  it('fechar um painel devolve a largura original (ida e volta)', () => {
    const expandida = ajustarLargura(240, 1)
    expect(ajustarLargura(expandida, -1)).toBe(240)
  })

  it('abrir dois painéis de uma vez (descrição + informações ao lado)', () => {
    expect(ajustarLargura(240, 2)).toBe(240 + 2 * PAINEL_DESCRICAO_LARGURA)
  })

  it('fechar dois painéis volta ao original', () => {
    const expandida = ajustarLargura(240, 2)
    expect(ajustarLargura(expandida, -2)).toBe(240)
  })

  it('fechar nunca deixa o card menor que o mínimo', () => {
    expect(ajustarLargura(200, -1)).toBe(160)
    expect(ajustarLargura(300, -2)).toBe(160)
  })
})
