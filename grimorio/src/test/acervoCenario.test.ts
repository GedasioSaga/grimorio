import { describe, expect, it } from 'vitest'
import { acervoVivo, adicionarAoAcervo, definirQtd, removerDoAcervo } from '../lib/acervoCenario'

describe('acervo do cenário', () => {
  it('adiciona sem quantidade (item único não ganha contador)', () => {
    expect(adicionarAoAcervo([], 'a')).toEqual([{ itemId: 'a' }])
  })

  it('não duplica: mesma lista se o item já está no acervo', () => {
    const lista = [{ itemId: 'a' }]
    expect(adicionarAoAcervo(lista, 'a')).toBe(lista)
  })

  it('remove por id', () => {
    expect(removerDoAcervo([{ itemId: 'a' }, { itemId: 'b' }], 'a')).toEqual([{ itemId: 'b' }])
  })

  it('define quantidade', () => {
    expect(definirQtd([{ itemId: 'a' }], 'a', 3)).toEqual([{ itemId: 'a', qtd: 3 }])
  })

  it('quantidade 1, zero, negativa ou inválida volta a ser item único', () => {
    const com = [{ itemId: 'a', qtd: 5 }]
    expect(definirQtd(com, 'a', 1)).toEqual([{ itemId: 'a' }])
    expect(definirQtd(com, 'a', 0)).toEqual([{ itemId: 'a' }])
    expect(definirQtd(com, 'a', -2)).toEqual([{ itemId: 'a' }])
    expect(definirQtd(com, 'a', Number.NaN)).toEqual([{ itemId: 'a' }])
    expect(definirQtd(com, 'a', undefined)).toEqual([{ itemId: 'a' }])
  })

  it('quantidade fracionária é truncada (2.9 vira 2)', () => {
    expect(definirQtd([{ itemId: 'a' }], 'a', 2.9)).toEqual([{ itemId: 'a', qtd: 2 }])
  })

  it('definir quantidade de item ausente não cria entrada', () => {
    const lista = [{ itemId: 'a' }]
    expect(definirQtd(lista, 'zzz', 3)).toBe(lista)
  })

  it('item excluído do acervo some da exibição sem reescrever o disco', () => {
    const cache = { a: {}, c: {} }
    const lista = [{ itemId: 'a' }, { itemId: 'b', qtd: 2 }, { itemId: 'c' }]
    expect(acervoVivo(lista, cache)).toEqual([{ itemId: 'a' }, { itemId: 'c' }])
    expect(lista).toHaveLength(3) // a lista salva continua intacta
  })
})
