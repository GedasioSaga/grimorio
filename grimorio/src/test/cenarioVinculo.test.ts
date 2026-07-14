import { describe, expect, it } from 'vitest'
import { desvincularPersonagem, personagensVivos, vincularPersonagem } from '../lib/cenarioVinculo'

describe('vínculo de personagens', () => {
  it('vincula com dedupe (mesma lista se já existe)', () => {
    const lista = ['a']
    expect(vincularPersonagem(lista, 'b')).toEqual(['a', 'b'])
    expect(vincularPersonagem(lista, 'a')).toBe(lista)
  })

  it('desvincula por id', () => {
    expect(desvincularPersonagem(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('filtra ids órfãos (personagem excluído some da exibição)', () => {
    const cache = { a: {}, c: {} }
    expect(personagensVivos(['a', 'b', 'c'], cache)).toEqual(['a', 'c'])
  })
})
