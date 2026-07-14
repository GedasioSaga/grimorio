// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { calcularLarguraPct } from '../lib/imagem'

describe('calcularLarguraPct', () => {
  it('converte px para % da coluna', () => {
    expect(calcularLarguraPct(400, 0, 800)).toBe(50)
  })
  it('arrastar pra fora aumenta a largura', () => {
    expect(calcularLarguraPct(400, 400, 800)).toBe(100)
  })
  it('trava no mínimo (10%)', () => {
    expect(calcularLarguraPct(400, -1000, 800)).toBe(10)
  })
  it('trava no teto (100%)', () => {
    expect(calcularLarguraPct(700, 400, 800)).toBe(100)
  })
  it('container inválido retorna 100', () => {
    expect(calcularLarguraPct(400, 0, 0)).toBe(100)
  })
})
