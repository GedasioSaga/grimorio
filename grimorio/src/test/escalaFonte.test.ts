import { describe, it, expect } from 'vitest'
import { FONTE_MIN, FONTE_MAX, proximaEscala } from '../lib/escalaFonte'

describe('proximaEscala', () => {
  it('aumenta em passo de 0.1', () => {
    expect(proximaEscala(1, 0.1)).toBe(1.1)
  })
  it('diminui em passo de 0.1', () => {
    expect(proximaEscala(1, -0.1)).toBe(0.9)
  })
  it('trava no mínimo', () => {
    expect(proximaEscala(FONTE_MIN, -0.1)).toBe(FONTE_MIN)
  })
  it('trava no máximo', () => {
    expect(proximaEscala(FONTE_MAX, 0.1)).toBe(FONTE_MAX)
  })
  it('arredonda para 1 casa (sem erro de ponto flutuante)', () => {
    expect(proximaEscala(1.1, 0.1)).toBe(1.2)
  })
})
