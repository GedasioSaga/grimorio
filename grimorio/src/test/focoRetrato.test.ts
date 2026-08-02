import { describe, it, expect } from 'vitest'
import {
  FOCO_CENTRO, PRESETS_FOCO, alinhamentoSvg, cantoDoFoco, focoDeCanto, normalizarFoco, posicaoCss,
} from '../lib/focoRetrato'

/**
 * O mesmo enquadramento do perfil, aplicado às miniaturas da teia. O SVG não tem
 * `object-position`, só nove alinhamentos — daí o arredondamento por terços.
 */
describe('alinhamentoSvg', () => {
  it('sem foco é centro, como sempre foi', () => {
    expect(alinhamentoSvg(undefined)).toBe('xMidYMid slice')
    expect(alinhamentoSvg(FOCO_CENTRO)).toBe('xMidYMid slice')
  })

  it('os presets da janela de enquadrar caem nos cantos certos', () => {
    expect(alinhamentoSvg(PRESETS_FOCO.topo)).toBe('xMidYMin slice')
    expect(alinhamentoSvg(PRESETS_FOCO.centro)).toBe('xMidYMid slice')
    expect(alinhamentoSvg(PRESETS_FOCO.base)).toBe('xMidYMax slice')
  })

  it('os dois eixos são independentes', () => {
    expect(alinhamentoSvg({ x: 0, y: 100 })).toBe('xMinYMax slice')
    expect(alinhamentoSvg({ x: 100, y: 0 })).toBe('xMaxYMin slice')
  })

  it('valor intermediário cai no terço mais próximo', () => {
    expect(alinhamentoSvg({ x: 30, y: 70 })).toBe('xMinYMax slice')
    expect(alinhamentoSvg({ x: 40, y: 60 })).toBe('xMidYMid slice')
  })

  it('sempre pede slice — sem ele o retrato sairia espremido em vez de cortado', () => {
    for (const f of [PRESETS_FOCO.topo, PRESETS_FOCO.base, { x: 0, y: 0 }, { x: 100, y: 100 }]) {
      expect(alinhamentoSvg(f)).toMatch(/ slice$/)
    }
  })
})

describe('normalizarFoco', () => {
  it('aceita par numérico dentro de 0–100', () => {
    expect(normalizarFoco({ x: 50, y: 0 })).toEqual({ x: 50, y: 0 })
    expect(normalizarFoco({ x: 0, y: 100 })).toEqual({ x: 0, y: 100 })
  })

  it('recusa fora de faixa, tipo errado, NaN e campo faltando', () => {
    expect(normalizarFoco({ x: 50, y: 101 })).toBeUndefined()
    expect(normalizarFoco({ x: -1, y: 50 })).toBeUndefined()
    expect(normalizarFoco({ x: '50', y: 50 })).toBeUndefined()
    expect(normalizarFoco({ x: NaN, y: 50 })).toBeUndefined()
    expect(normalizarFoco({ x: 50 })).toBeUndefined()
  })

  it('recusa não-objeto', () => {
    expect(normalizarFoco(undefined)).toBeUndefined()
    expect(normalizarFoco(null)).toBeUndefined()
    expect(normalizarFoco('topo')).toBeUndefined()
    expect(normalizarFoco(42)).toBeUndefined()
  })
})

describe('posicaoCss', () => {
  it('sem foco desenha centralizado, igual a sempre', () => {
    expect(posicaoCss(undefined)).toBe('50% 50%')
    expect(posicaoCss(FOCO_CENTRO)).toBe('50% 50%')
  })

  it('foco vira object-position', () => {
    expect(posicaoCss(PRESETS_FOCO.topo)).toBe('50% 0%')
    expect(posicaoCss(PRESETS_FOCO.base)).toBe('50% 100%')
    expect(posicaoCss({ x: 25, y: 12 })).toBe('25% 12%')
  })
})

describe('focoDeCanto', () => {
  // preview de imagem alta: 200 de largura, 400 de altura, quadrado de lado 200
  it('imagem alta: topo do quadrado percorre a sobra vertical', () => {
    expect(focoDeCanto(200, 400, 200, 0, 0)).toEqual({ x: 50, y: 0 })
    expect(focoDeCanto(200, 400, 200, 0, 100)).toEqual({ x: 50, y: 50 })
    expect(focoDeCanto(200, 400, 200, 0, 200)).toEqual({ x: 50, y: 100 })
  })

  it('eixo sem sobra devolve 50 — NaN ali invalidaria a regra CSS inteira, em silêncio', () => {
    // largura == lado: sobra horizontal zero
    const alta = focoDeCanto(200, 400, 200, 0, 100)
    expect(alta.x).toBe(50)
    expect(Number.isNaN(alta.x)).toBe(false)
    // imagem quadrada: sobra zero nos dois eixos
    expect(focoDeCanto(300, 300, 300, 0, 0)).toEqual({ x: 50, y: 50 })
  })

  it('canto além da borda fica preso em 0–100', () => {
    expect(focoDeCanto(200, 400, 200, 0, 999).y).toBe(100)
    expect(focoDeCanto(200, 400, 200, 0, -50).y).toBe(0)
  })

  it('imagem deitada: a sobra é horizontal', () => {
    expect(focoDeCanto(400, 200, 200, 0, 0)).toEqual({ x: 0, y: 50 })
    expect(focoDeCanto(400, 200, 200, 200, 0)).toEqual({ x: 100, y: 50 })
  })
})

describe('cantoDoFoco', () => {
  it('é o inverso de focoDeCanto', () => {
    const canto = cantoDoFoco(200, 400, 200, { x: 50, y: 25 })
    expect(canto).toEqual({ x: 0, y: 50 })
    expect(focoDeCanto(200, 400, 200, canto.x, canto.y)).toEqual({ x: 50, y: 25 })
  })

  it('sem foco cai no meio da sobra', () => {
    expect(cantoDoFoco(200, 400, 200, undefined)).toEqual({ x: 0, y: 100 })
  })

  it('imagem menor que o quadrado não gera canto negativo', () => {
    expect(cantoDoFoco(100, 100, 200, PRESETS_FOCO.base)).toEqual({ x: 0, y: 0 })
  })
})
