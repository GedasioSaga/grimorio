import { describe, it, expect } from 'vitest'
import { promptMelhorar, promptVersao } from '../lib/promptsIA'

describe('promptVersao', () => {
  it('curta menciona a aba e o formato curto', () => {
    const p = promptVersao('História', 'curta')
    expect(p).toContain('"História"')
    expect(p).toMatch(/CURTA/)
  })
  it('longa menciona parágrafos', () => {
    expect(promptVersao('Descrição', 'longa')).toMatch(/LONGA|parágrafos/)
  })
  it('pede só o texto, sem título/preâmbulo', () => {
    expect(promptVersao('Eventos', 'curta')).toMatch(/sem título/i)
  })
})

describe('promptMelhorar', () => {
  it('menciona a aba e manter os fatos', () => {
    const p = promptMelhorar('Eventos')
    expect(p).toContain('"Eventos"')
    expect(p).toMatch(/fatos|mantend/i)
  })
})
