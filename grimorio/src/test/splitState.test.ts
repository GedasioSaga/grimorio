import { describe, expect, it } from 'vitest'
import { proximoRecolhido, flexDosLados, type Recolhido } from '../lib/splitState'

describe('proximoRecolhido', () => {
  it('recolhe a partir de nenhum', () => {
    expect(proximoRecolhido('nenhum', 'notas')).toBe('notas')
    expect(proximoRecolhido('nenhum', 'mapa')).toBe('mapa')
  })
  it('clicar o lado já recolhido expande (volta a nenhum)', () => {
    expect(proximoRecolhido('notas', 'notas')).toBe('nenhum')
    expect(proximoRecolhido('mapa', 'mapa')).toBe('nenhum')
  })
  it('sempre dá pra voltar a ambos abertos clicando o lado recolhido', () => {
    let r: Recolhido = 'mapa'
    r = proximoRecolhido(r, 'mapa')
    expect(r).toBe('nenhum')
  })
})
describe('flexDosLados', () => {
  it('recolhido zera um lado e enche o outro', () => {
    expect(flexDosLados('notas', 0.5)).toEqual({ escrita: 0, mapa: 1 })
    expect(flexDosLados('mapa', 0.5)).toEqual({ escrita: 1, mapa: 0 })
    expect(flexDosLados('nenhum', 0.3)).toEqual({ escrita: 0.3, mapa: 0.7 })
  })
})
