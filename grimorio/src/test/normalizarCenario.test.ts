import { describe, expect, it } from 'vitest'
import { normalizarCenario } from '../lib/vaultRepo'

describe('normalizarCenario', () => {
  it('objeto vazio ganha uma versão Base ativa', () => {
    const c = normalizarCenario({})
    expect(c.id).toBeTruthy()
    expect(c.nome).toBe('')
    expect(c.personagens).toEqual([])
    expect(c.versoes).toHaveLength(1)
    expect(c.versoes[0].nome).toBe('Base')
    expect(c.versoes[0].retrato).toBeNull()
    expect(c.versoes[0].descricao).toBe('')
    expect(c.versoes[0].eventos).toBe('')
    expect(c.versoes[0].imagens).toEqual([])
    expect(c.versaoAtivaId).toBe(c.versoes[0].id)
    expect(c.criadoEm).toBeTruthy()
  })

  it('JSON antigo (plano) migra conteúdo para a versão Base', () => {
    const c = normalizarCenario({
      id: 'abc', nome: 'Cidade Alta', resumo: 'capital', descricao: '<p>d</p>', eventos: '<p>e</p>',
      retrato: 'imagens-cenarios/r.png', personagens: ['p1'],
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-02T00:00:00.000Z',
    })
    expect(c.id).toBe('abc')
    expect(c.nome).toBe('Cidade Alta')
    expect(c.personagens).toEqual(['p1'])
    expect(c.versoes).toHaveLength(1)
    expect(c.versoes[0].nome).toBe('Base')
    expect(c.versoes[0].id).not.toBe('abc')            // id da versão é novo, não o do cenário
    expect(c.versoes[0].resumo).toBe('capital')
    expect(c.versoes[0].descricao).toBe('<p>d</p>')
    expect(c.versoes[0].eventos).toBe('<p>e</p>')
    expect(c.versoes[0].retrato).toBe('imagens-cenarios/r.png')
    expect(c.versaoAtivaId).toBe(c.versoes[0].id)
    expect(c.criadoEm).toBe('2020-01-01T00:00:00.000Z')
  })

  it('formato novo (com versões) passa intocado', () => {
    const completo = {
      id: 'x', nome: 'N', personagens: ['p1', 'p2'],
      versoes: [
        { id: 'va', nome: 'Base', retrato: 'imagens-cenarios/r.png', resumo: 'r', descricao: '<p>d</p>', informacao: '<p>i</p>', historia: '<p>h</p>', eventos: '<p>e</p>', itens: '<p>it</p>', anotacoes: '<p>a</p>', imagens: [{ rel: 'imagens-cenarios/g.png', legenda: 'l' }] },
        { id: 'vb', nome: 'Noite', retrato: null, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '', imagens: [] },
      ],
      versaoAtivaId: 'vb',
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-02T00:00:00.000Z',
    }
    expect(normalizarCenario(completo)).toEqual(completo)
  })
})
