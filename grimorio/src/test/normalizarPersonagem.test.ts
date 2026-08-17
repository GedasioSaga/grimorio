import { describe, expect, it } from 'vitest'
import { normalizarPersonagem } from '../lib/vaultRepo'

describe('normalizarPersonagem', () => {
  it('objeto vazio ganha 1 versão ativa; nome espelho vazio', () => {
    const p = normalizarPersonagem({})
    expect(p.id).toBeTruthy()
    expect(p.versoes).toHaveLength(1)
    expect(p.versaoAtivaId).toBe(p.versoes[0].id)
    expect(p.nome).toBe(p.versoes[0].nome)
    expect(p.versoes[0].nome).toBe('')
    expect(p.versoes[0].extras).toBe('')
    expect(p.criadoEm).toBeTruthy()
  })

  it('legado plano migra pra 1 versão que HERDA o nome do personagem (corpo->descricao)', () => {
    const p = normalizarPersonagem({
      id: 'abc', nome: 'Bruce Banner', resumo: 'cientista', corpo: '<p>d</p>', extras: '<p>e</p>',
      retrato: 'x/retrato.png',
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-02T00:00:00.000Z',
    })
    expect(p.id).toBe('abc')
    expect(p.versoes).toHaveLength(1)
    expect(p.versoes[0].nome).toBe('Bruce Banner')
    expect(p.versoes[0].id).not.toBe('abc')
    expect(p.versoes[0].descricao).toBe('<p>d</p>')
    expect(p.versoes[0].resumo).toBe('cientista')
    expect(p.versoes[0].extras).toBe('<p>e</p>')
    expect(p.versoes[0].retrato).toBe('x/retrato.png')
    expect(p.nome).toBe('Bruce Banner')
    expect(p.versaoAtivaId).toBe(p.versoes[0].id)
    expect(p.criadoEm).toBe('2020-01-01T00:00:00.000Z')
  })

  it('formato novo (com versões) passa intocado; nome = versão ativa', () => {
    const completo = {
      id: 'x', nome: 'Hulk',
      versoes: [
        { id: 'va', nome: 'Bruce Banner', retrato: 'a.png', resumo: 'r', descricao: '<p>d</p>', informacao: '<p>i</p>', historia: '<p>h</p>', extras: '<p>e</p>', anotacoes: '<p>a</p>', imagens: [{ rel: 'g.png', legenda: 'l' }], acervo: [] },
        { id: 'vb', nome: 'Hulk', retrato: null, resumo: '', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [], acervo: [] },
      ],
      versaoAtivaId: 'vb',
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-02T00:00:00.000Z',
    }
    expect(normalizarPersonagem(completo)).toEqual(completo)
  })

  it('ficha antiga sem `acervo` (campo retrofitado) abre com acervo vazio, não quebra', () => {
    const p = normalizarPersonagem({
      id: 'abc', nome: 'Bruce Banner', resumo: 'cientista', corpo: '<p>d</p>',
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-02T00:00:00.000Z',
    })
    expect(p.versoes[0].acervo).toEqual([])
  })

  it('acervo é normalizado: entradas sem itemId de string são descartadas', () => {
    const p = normalizarPersonagem({
      id: 'x', nome: 'Hulk',
      versoes: [{
        id: 'va', nome: 'Hulk', retrato: null, resumo: '', descricao: '', informacao: '',
        historia: '', extras: '', anotacoes: '', imagens: [],
        acervo: [{ itemId: 'ok' }, { itemId: 42 }, {}, { itemId: 'com-qtd', qtd: 3 }],
      }],
      versaoAtivaId: 'va',
    })
    expect(p.versoes[0].acervo).toEqual([{ itemId: 'ok' }, { itemId: 'com-qtd', qtd: 3 }])
  })
})
