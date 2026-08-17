import { describe, expect, it } from 'vitest'
import {
  comprimentoDaLinha,
  ehLinhaDeClique,
  LINHA_COMPRIMENTO_MINIMO,
  LINHA_COMPRIMENTO_PADRAO,
  segmentoPadraoDeClique,
} from '../lib/linhaMapa'

/**
 * Lógica pura por trás do conserto de "a peça fica grudada na mão". O comportamento na
 * ferramenta de verdade está em `ferramentasDesenhoMapa.test.ts`; aqui ficam os casos de
 * borda que seriam desconfortáveis de encenar com evento de ponteiro.
 */

describe('comprimentoDaLinha', () => {
  it('soma segmento a segmento, não a distância entre as pontas', () => {
    const emL = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 40 },
    ]
    expect(comprimentoDaLinha(emL)).toBe(70) // 30 + 40, não os 50 da hipotenusa
  })

  it('linha reta simples', () => {
    expect(comprimentoDaLinha([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5)
  })

  it('ponto único e lista vazia não têm comprimento', () => {
    expect(comprimentoDaLinha([{ x: 5, y: 5 }])).toBe(0)
    expect(comprimentoDaLinha([])).toBe(0)
  })
})

describe('ehLinhaDeClique', () => {
  it('a linha degenerada do tldraw (0,0)→(0.1,0.1) é clique', () => {
    expect(ehLinhaDeClique([{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }])).toBe(true)
  })

  it('tremor de mão dentro do limiar ainda é clique', () => {
    expect(ehLinhaDeClique([{ x: 0, y: 0 }, { x: LINHA_COMPRIMENTO_MINIMO - 0.5, y: 0 }])).toBe(true)
  })

  it('traço desenhado de propósito NÃO é clique', () => {
    expect(ehLinhaDeClique([{ x: 0, y: 0 }, { x: LINHA_COMPRIMENTO_MINIMO + 1, y: 0 }])).toBe(false)
    expect(ehLinhaDeClique([{ x: 0, y: 0 }, { x: 300, y: 0 }])).toBe(false)
  })

  it('linha sem dois pontos é tratada como clique (não há traço para preservar)', () => {
    expect(ehLinhaDeClique([{ x: 0, y: 0 }])).toBe(true)
    expect(ehLinhaDeClique([])).toBe(true)
  })

  it('o limiar é menor que o segmento colocado, senão a peça nova seria apagada de novo', () => {
    expect(LINHA_COMPRIMENTO_MINIMO).toBeLessThan(LINHA_COMPRIMENTO_PADRAO)
  })
})

describe('segmentoPadraoDeClique', () => {
  it('devolve um segmento horizontal do comprimento padrão', () => {
    const { pontos } = segmentoPadraoDeClique()
    expect(comprimentoDaLinha(pontos)).toBe(LINHA_COMPRIMENTO_PADRAO)
    expect(pontos[0].y).toBe(0)
    expect(pontos[1].y).toBe(0)
  })

  it('o deslocamento centra o segmento no ponto clicado', () => {
    const { deslocamentoX, pontos } = segmentoPadraoDeClique()
    expect(deslocamentoX).toBe(LINHA_COMPRIMENTO_PADRAO / 2)
    // origem do shape = clique - deslocamento; as pontas caem simétricas ao redor do clique
    expect(-deslocamentoX + pontos[0].x).toBe(-LINHA_COMPRIMENTO_PADRAO / 2)
    expect(-deslocamentoX + pontos[1].x).toBe(LINHA_COMPRIMENTO_PADRAO / 2)
  })

  it('aceita comprimento sob medida', () => {
    const { deslocamentoX, pontos } = segmentoPadraoDeClique(100)
    expect(deslocamentoX).toBe(50)
    expect(comprimentoDaLinha(pontos)).toBe(100)
  })
})
