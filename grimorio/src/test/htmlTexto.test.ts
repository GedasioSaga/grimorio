import { describe, expect, it } from 'vitest'
import { temConteudo } from '../lib/htmlTexto'

describe('temConteudo', () => {
  it('vazio/null/undefined → false', () => {
    expect(temConteudo('')).toBe(false)
    expect(temConteudo(null)).toBe(false)
    expect(temConteudo(undefined)).toBe(false)
  })

  it('parágrafo vazio do TipTap → false', () => {
    expect(temConteudo('<p></p>')).toBe(false)
  })

  it('só espaços / nbsp / br → false', () => {
    expect(temConteudo('<p>  </p>')).toBe(false)
    expect(temConteudo('<p>&nbsp;</p>')).toBe(false)
    expect(temConteudo('<p><br></p>')).toBe(false)
  })

  it('texto real → true', () => {
    expect(temConteudo('<p>Um homem velho</p>')).toBe(true)
  })

  it('lista com itens → true', () => {
    expect(temConteudo('<ul><li>Cabelos brancos</li></ul>')).toBe(true)
  })
})
