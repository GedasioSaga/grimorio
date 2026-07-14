import { describe, expect, it } from 'vitest'
import { normalizarPersonagem } from '../lib/vaultRepo'

describe('normalizarPersonagem', () => {
  it('migra `corpo` legado para `descricao`', () => {
    const p = normalizarPersonagem({
      id: '1', nome: 'Baldur', retrato: null, resumo: 'r',
      corpo: '<p>história antiga</p>',
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-02T00:00:00.000Z',
    })
    expect(p.descricao).toBe('<p>história antiga</p>')
    expect('corpo' in p).toBe(false)
  })

  it('preenche campos faltando com vazios', () => {
    const p = normalizarPersonagem({ id: '1', nome: 'X' })
    expect(p.descricao).toBe('')
    expect(p.informacao).toBe('')
    expect(p.historia).toBe('')
    expect(p.extras).toBe('')
    expect(p.anotacoes).toBe('')
    expect(p.imagens).toEqual([])
  })

  it('preserva o formato novo intocado', () => {
    const novo = {
      id: '1', nome: 'X', retrato: null, resumo: 'r',
      descricao: '<p>d</p>', informacao: '<p>i</p>', historia: '<p>h</p>', extras: '<p>e</p>', anotacoes: '<p>a</p>',
      imagens: [{ rel: 'a/x.png', legenda: 'oi' }],
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-02T00:00:00.000Z',
    }
    expect(normalizarPersonagem(novo)).toEqual(novo)
  })

  it('descricao explícita tem prioridade sobre corpo legado', () => {
    const p = normalizarPersonagem({ id: '1', nome: 'X', descricao: '<p>nova</p>', corpo: '<p>velha</p>' })
    expect(p.descricao).toBe('<p>nova</p>')
  })

  it('preserva id e datas base', () => {
    const p = normalizarPersonagem({
      id: 'abc', nome: 'X',
      criadoEm: '2019-05-05T00:00:00.000Z', modificadoEm: '2019-06-06T00:00:00.000Z',
    })
    expect(p.id).toBe('abc')
    expect(p.criadoEm).toBe('2019-05-05T00:00:00.000Z')
    expect(p.modificadoEm).toBe('2019-06-06T00:00:00.000Z')
  })
})
