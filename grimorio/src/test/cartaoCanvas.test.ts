import { describe, expect, it } from 'vitest'
import {
  CARD_LARGURA_COLUNA,
  FAIXA_TEXTO_ALTURA,
  PAINEL_DESCRICAO_LARGURA,
  ajustarLargura,
  alturaMoldadaAImagem,
  colunasPaineisVisiveis,
  colunasTotais,
  escalaDoCartao,
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

describe('colunasTotais', () => {
  it('recolhido = só a coluna principal', () => {
    expect(colunasTotais(false, 0)).toBe(1)
    expect(colunasTotais(false, 2)).toBe(1)
  })
  it('expandido sem seções ao lado = principal + descrição', () => {
    expect(colunasTotais(true, 0)).toBe(2)
  })
  it('expandido com 2 seções ao lado = 4 colunas', () => {
    expect(colunasTotais(true, 2)).toBe(4)
  })
})

describe('escalaDoCartao', () => {
  it('largura base numa coluna = escala 1', () => {
    expect(escalaDoCartao(CARD_LARGURA_COLUNA, 1)).toBe(1)
  })
  it('dobro da largura numa coluna = escala 2 (texto acompanha imagem)', () => {
    expect(escalaDoCartao(CARD_LARGURA_COLUNA * 2, 1)).toBe(2)
  })
  it('expandido: escala usa a largura POR coluna, não a total', () => {
    expect(escalaDoCartao(CARD_LARGURA_COLUNA * 2, 2)).toBe(1)
    expect(escalaDoCartao(CARD_LARGURA_COLUNA * 4, 2)).toBe(2)
  })
  it('cols inválido não divide por zero', () => {
    expect(escalaDoCartao(240, 0)).toBe(1)
  })
})

describe('alturaMoldadaAImagem', () => {
  it('imagem quadrada = largura + faixa de texto', () => {
    expect(alturaMoldadaAImagem(240, 1)).toBe(240 + FAIXA_TEXTO_ALTURA)
  })
  it('paisagem (larga) fica mais baixa que retrato (alto)', () => {
    expect(alturaMoldadaAImagem(240, 16 / 9)).toBeLessThan(alturaMoldadaAImagem(240, 9 / 16))
  })
  it('aspecto inválido não quebra (cai no quadrado)', () => {
    expect(alturaMoldadaAImagem(240, 0)).toBe(240 + FAIXA_TEXTO_ALTURA)
    expect(alturaMoldadaAImagem(240, NaN)).toBe(240 + FAIXA_TEXTO_ALTURA)
  })
})
