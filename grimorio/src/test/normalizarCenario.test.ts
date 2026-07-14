import { describe, expect, it } from 'vitest'
import { normalizarCenario } from '../lib/vaultRepo'

describe('normalizarCenario', () => {
  it('objeto vazio ganha todos os defaults', () => {
    const c = normalizarCenario({})
    expect(c.id).toBeTruthy()
    expect(c.nome).toBe('')
    expect(c.retrato).toBeNull()
    expect(c.resumo).toBe('')
    expect(c.descricao).toBe('')
    expect(c.informacao).toBe('')
    expect(c.historia).toBe('')
    expect(c.eventos).toBe('')
    expect(c.itens).toBe('')
    expect(c.anotacoes).toBe('')
    expect(c.imagens).toEqual([])
    expect(c.personagens).toEqual([])
    expect(c.criadoEm).toBeTruthy()
    expect(c.modificadoEm).toBeTruthy()
  })

  it('JSON antigo sem campos novos sobe de versão preservando o que tem', () => {
    const c = normalizarCenario({
      id: 'abc', nome: 'Cidade Alta', resumo: 'capital',
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-02T00:00:00.000Z',
    })
    expect(c.id).toBe('abc')
    expect(c.nome).toBe('Cidade Alta')
    expect(c.resumo).toBe('capital')
    expect(c.eventos).toBe('')
    expect(c.personagens).toEqual([])
    expect(c.criadoEm).toBe('2020-01-01T00:00:00.000Z')
  })

  it('formato completo passa intocado', () => {
    const completo = {
      id: 'x', nome: 'N', retrato: 'imagens-cenarios/r.png', resumo: 'r',
      descricao: '<p>d</p>', informacao: '<p>i</p>', historia: '<p>h</p>',
      eventos: '<p>e</p>', itens: '<p>it</p>', anotacoes: '<p>a</p>',
      imagens: [{ rel: 'imagens-cenarios/g.png', legenda: 'l' }],
      personagens: ['p1', 'p2'],
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-02T00:00:00.000Z',
    }
    expect(normalizarCenario(completo)).toEqual(completo)
  })
})
