import { describe, expect, it } from 'vitest'
import { dirNotasDoMapa, escritaDirDaCampanha, caminhoAbsolutoImagem } from '../lib/caminhos'

describe('dirNotasDoMapa', () => {
  it('troca .json por .notas (sessão)', () => {
    expect(dirNotasDoMapa('campanhas/x/sessoes/sessao-01.json'))
      .toBe('campanhas/x/sessoes/sessao-01.notas')
  })
  it('serve canvas solto também', () => {
    expect(dirNotasDoMapa('canvases-soltos/rabisco.json')).toBe('canvases-soltos/rabisco.notas')
  })
})

describe('escritaDirDaCampanha', () => {
  it('monta o caminho do caderno livre da campanha', () => {
    expect(escritaDirDaCampanha('minha-campanha')).toBe('campanhas/minha-campanha/escrita')
  })
})

describe('caminhoAbsolutoImagem', () => {
  it('junta vaultPath e caminho relativo', () => {
    expect(caminhoAbsolutoImagem('C:/Cofre', 'imagens-notas/a.png')).toBe('C:/Cofre/imagens-notas/a.png')
  })
})
