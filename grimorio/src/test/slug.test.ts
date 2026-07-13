import { describe, expect, it } from 'vitest'
import { slugify, slugUnico } from '../lib/slug'

describe('slugify', () => {
  it('converte nome em kebab-case sem acentos', () => {
    expect(slugify('A Maldição de Strahd')).toBe('a-maldicao-de-strahd')
  })
  it('remove caracteres inválidos de nome de arquivo', () => {
    expect(slugify('Sessão #3: "O Retorno"?')).toBe('sessao-3-o-retorno')
  })
  it('nome vazio vira "sem-nome"', () => {
    expect(slugify('   ')).toBe('sem-nome')
  })
})

describe('slugUnico', () => {
  it('retorna o slug base se livre', () => {
    expect(slugUnico('baldur', ['outro'])).toBe('baldur')
  })
  it('adiciona sufixo numérico se ocupado', () => {
    expect(slugUnico('baldur', ['baldur', 'baldur-2'])).toBe('baldur-3')
  })
})
