import { describe, it, expect } from 'vitest'
import { proximoNumero } from '../lib/portaMapa'

describe('proximoNumero', () => {
  it('começa em 1 quando não há marcador', () => {
    expect(proximoNumero([])).toBe(1)
  })

  it('continua do maior existente', () => {
    expect(proximoNumero(['1', '2', '3'])).toBe(4)
  })

  it('não repete número quando apagam um do meio', () => {
    expect(proximoNumero(['1', '3'])).toBe(4)
  })

  it('ignora rótulo que não é número', () => {
    expect(proximoNumero(['1', 'entrada', '  '])).toBe(2)
  })

  it('ignora número negativo e zero', () => {
    expect(proximoNumero(['-5', '0'])).toBe(1)
  })
})
