import { describe, expect, it } from 'vitest'
import { distanciaEntreCaixas, emQuadrados, medidaDeCaixa, type Caixa } from '../lib/quadrados'

describe('emQuadrados', () => {
  it('converte px inteiro em quadrados inteiros', () => {
    expect(emQuadrados(192, 32)).toBe('6')
  })

  it('converte px em quadrados com meio quadrado', () => {
    expect(emQuadrados(208, 32)).toBe('6,5')
  })

  it('arredonda a 1 casa decimal usando vírgula', () => {
    expect(emQuadrados(40, 32)).toBe('1,3')
  })

  it('trata zero', () => {
    expect(emQuadrados(0, 32)).toBe('0')
  })

  it('mantém o zero antes da vírgula em frações menores que 1', () => {
    expect(emQuadrados(9, 32)).toBe('0,3')
  })

  it('não formata "6,0" quando o arredondamento cai em valor inteiro', () => {
    expect(emQuadrados(191, 32)).toBe('6')
  })
})

describe('medidaDeCaixa', () => {
  it('combina largura e altura em quadrados no formato L×A', () => {
    expect(medidaDeCaixa(192, 128, 32)).toBe('6×4')
  })

  it('combina largura e altura quando um dos lados não é inteiro', () => {
    expect(medidaDeCaixa(208, 128, 32)).toBe('6,5×4')
  })
})

describe('distanciaEntreCaixas', () => {
  it('retorna 0 quando as caixas se sobrepõem', () => {
    const a: Caixa = { x: 0, y: 0, w: 10, h: 10 }
    const b: Caixa = { x: 5, y: 5, w: 10, h: 10 }
    expect(distanciaEntreCaixas(a, b)).toBe(0)
  })

  it('retorna 0 quando as caixas se encostam', () => {
    const a: Caixa = { x: 0, y: 0, w: 10, h: 10 }
    const b: Caixa = { x: 10, y: 0, w: 10, h: 10 }
    expect(distanciaEntreCaixas(a, b)).toBe(0)
  })

  it('mede a folga quando as caixas estão lado a lado no eixo x', () => {
    const a: Caixa = { x: 0, y: 0, w: 10, h: 10 }
    const b: Caixa = { x: 17, y: 0, w: 10, h: 10 }
    expect(distanciaEntreCaixas(a, b)).toBe(7)
  })

  it('mede a hipotenusa dos gaps quando as caixas estão separadas na diagonal', () => {
    const a: Caixa = { x: 0, y: 0, w: 10, h: 10 }
    const b: Caixa = { x: 13, y: 14, w: 10, h: 10 }
    expect(distanciaEntreCaixas(a, b)).toBe(5)
  })

  it('é simétrica (a→b igual a b→a)', () => {
    const a: Caixa = { x: 0, y: 0, w: 10, h: 10 }
    const b: Caixa = { x: 13, y: 14, w: 10, h: 10 }
    expect(distanciaEntreCaixas(a, b)).toBe(distanciaEntreCaixas(b, a))
  })
})
