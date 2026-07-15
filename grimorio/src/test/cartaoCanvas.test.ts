import { describe, expect, it } from 'vitest'
import {
  PAINEL_DESCRICAO_LARGURA,
  ajustarLargura,
  colunasPaineisVisiveis,
  larguraDoCartao,
} from '../lib/cartaoCanvas'

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

describe('larguraDoCartao', () => {
  it('base sem colunas de painel', () => {
    expect(larguraDoCartao(240, 0)).toBe(240)
  })
  it('uma coluna soma um painel', () => {
    expect(larguraDoCartao(240, 1)).toBe(240 + 240)
  })
  it('três colunas somam três painéis', () => {
    expect(larguraDoCartao(240, 3)).toBe(240 + 3 * 240)
  })
})

describe('colunasPaineisVisiveis', () => {
  it('recolhido não tem colunas', () => {
    expect(colunasPaineisVisiveis(false, 2)).toBe(0)
  })
  it('expandido sem seções ao lado tem só a coluna da Descrição', () => {
    expect(colunasPaineisVisiveis(true, 0)).toBe(1)
  })
  it('expandido com duas seções ao lado tem três colunas', () => {
    expect(colunasPaineisVisiveis(true, 2)).toBe(3)
  })
})
