import { describe, it, expect } from 'vitest'
import { nomeCenarioExibido } from '../lib/nomeCenarioExibido'

describe('nomeCenarioExibido', () => {
  it('corta o prefixo quando bate exatamente com o nome do pai', () => {
    expect(nomeCenarioExibido('Reino de Goa: Castelo', 'Reino de Goa')).toBe('Castelo')
    expect(nomeCenarioExibido('Reino de Goa: Castelo: Cozinha', 'Reino de Goa: Castelo')).toBe('Cozinha')
  })

  it('aceita dois-pontos sem espaço depois', () => {
    expect(nomeCenarioExibido('Reino de Goa:Castelo', 'Reino de Goa')).toBe('Castelo')
  })

  it('mantém inteiro quando o prefixo não bate com o pai', () => {
    expect(nomeCenarioExibido('Sala 3: a cozinha', 'Torre')).toBe('Sala 3: a cozinha')
    // prefixo parcial do pai não basta: "Reino" ≠ "Reino de Goa"
    expect(nomeCenarioExibido('Reino: Castelo', 'Reino de Goa')).toBe('Reino: Castelo')
    // pai como começo do texto, mas sem os dois-pontos logo depois
    expect(nomeCenarioExibido('Reino de Goa Antiga: Castelo', 'Reino de Goa')).toBe('Reino de Goa Antiga: Castelo')
    // maiúscula/minúscula conta: "exatamente" é exatamente
    expect(nomeCenarioExibido('reino de goa: Castelo', 'Reino de Goa')).toBe('reino de goa: Castelo')
  })

  it('mantém inteiro quando o resto ficaria vazio', () => {
    expect(nomeCenarioExibido('Reino de Goa:', 'Reino de Goa')).toBe('Reino de Goa:')
    expect(nomeCenarioExibido('Reino de Goa:   ', 'Reino de Goa')).toBe('Reino de Goa:   ')
  })

  it('sem pai devolve igual', () => {
    expect(nomeCenarioExibido('Reino de Goa: Castelo', null)).toBe('Reino de Goa: Castelo')
    expect(nomeCenarioExibido('Reino de Goa: Castelo', undefined)).toBe('Reino de Goa: Castelo')
    expect(nomeCenarioExibido('Reino de Goa: Castelo', '')).toBe('Reino de Goa: Castelo')
  })
})
