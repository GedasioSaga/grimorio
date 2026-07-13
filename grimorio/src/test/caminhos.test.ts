import { describe, expect, it } from 'vitest'
import { dirNotasDaSessao, escritaDirDaCampanha, caminhoAbsolutoImagem } from '../lib/caminhos'

describe('dirNotasDaSessao', () => {
  it('troca .json por .notas', () => {
    expect(dirNotasDaSessao('campanhas/x/sessoes/sessao-01.json'))
      .toBe('campanhas/x/sessoes/sessao-01.notas')
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
