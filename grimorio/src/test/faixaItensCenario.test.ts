import { describe, expect, it } from 'vitest'
import {
  FAIXA_ITENS_BASE,
  LADOS_FAIXA,
  espessuraFaixa,
  larguraDoConteudo,
  proximoLado,
  tamanhoAoTrocarLado,
  type LadoFaixa,
} from '../lib/faixaItensCenario'
import { CARD_LARGURA_COLUNA, escalaDoCartao } from '../lib/cartaoCanvas'

describe('proximoLado', () => {
  it('gira oculta → baixo → direita → cima → esquerda → oculta', () => {
    const visitados: LadoFaixa[] = []
    let lado: LadoFaixa = 'oculta'
    for (let i = 0; i < LADOS_FAIXA.length + 1; i++) {
      visitados.push(lado)
      lado = proximoLado(lado)
    }
    expect(visitados).toEqual(['oculta', 'baixo', 'direita', 'cima', 'esquerda', 'oculta'])
  })
})

describe('tamanho do card com a faixa', () => {
  const CARD = { w: 240, h: 320 }

  it('faixa embaixo cresce só a altura, na espessura base com o card na escala 1', () => {
    expect(tamanhoAoTrocarLado(CARD, 1, 'oculta', 'baixo')).toEqual({ w: 240, h: 320 + FAIXA_ITENS_BASE })
  })

  it('faixa à direita cresce só a largura, e o conteúdo continua com a mesma escala', () => {
    const t = tamanhoAoTrocarLado(CARD, 1, 'oculta', 'direita')
    expect(t).toEqual({ w: 240 + FAIXA_ITENS_BASE, h: 320 })
    // ligar a faixa ao lado não pode aumentar texto e imagem
    expect(escalaDoCartao(larguraDoConteudo(t.w, 'direita', 1), 1)).toBeCloseTo(escalaDoCartao(240, 1))
  })

  it.each([1, 2, 3])('girar os 4 lados e voltar a oculta devolve o tamanho original (%i coluna(s))', (cols) => {
    const inicio = { w: 517.3, h: 402.9 }
    let tamanho = inicio
    let lado: LadoFaixa = 'oculta'
    for (let i = 0; i < LADOS_FAIXA.length; i++) {
      const proximo = proximoLado(lado)
      tamanho = tamanhoAoTrocarLado(tamanho, cols, lado, proximo)
      lado = proximo
    }
    expect(lado).toBe('oculta')
    expect(tamanho.w).toBeCloseTo(inicio.w, 9)
    expect(tamanho.h).toBeCloseTo(inicio.h, 9)
  })

  it('a faixa acompanha o card redimensionado: card no dobro, faixa no dobro', () => {
    expect(espessuraFaixa(480, 'baixo', 1)).toBeCloseTo(2 * FAIXA_ITENS_BASE)
    const lateral = tamanhoAoTrocarLado({ w: 480, h: 640 }, 1, 'oculta', 'esquerda')
    expect(espessuraFaixa(lateral.w, 'esquerda', 1)).toBeCloseTo(2 * FAIXA_ITENS_BASE)
  })

  it('card expandido (mais colunas) na escala 1 mantém a faixa na espessura base', () => {
    const w = 3 * CARD_LARGURA_COLUNA
    expect(espessuraFaixa(w, 'cima', 3)).toBeCloseTo(FAIXA_ITENS_BASE)
    expect(tamanhoAoTrocarLado({ w, h: 400 }, 3, 'oculta', 'direita').w).toBeCloseTo(w + FAIXA_ITENS_BASE)
  })

  it('faixa oculta não tem espessura nem come largura', () => {
    expect(espessuraFaixa(240, 'oculta', 1)).toBe(0)
    expect(larguraDoConteudo(240, 'oculta', 1)).toBe(240)
    expect(larguraDoConteudo(240, 'baixo', 1)).toBe(240)
  })

  it('trocar de um lado vertical para um horizontal move a espessura de dimensão', () => {
    const embaixo = tamanhoAoTrocarLado(CARD, 1, 'oculta', 'baixo')
    expect(tamanhoAoTrocarLado(embaixo, 1, 'baixo', 'direita')).toEqual({ w: 240 + FAIXA_ITENS_BASE, h: 320 })
  })
})
