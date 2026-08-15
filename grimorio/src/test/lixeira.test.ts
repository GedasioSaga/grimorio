import { describe, expect, it } from 'vitest'
import {
  caminhoArquivoEntrada, dirDaEntrada, nomeFinalRestauro, nomeLivreEm,
  normalizarEntradaLixeira, novaEntradaLixeira, type EntradaLixeira,
} from '../lib/lixeira'

describe('nomeLivreEm', () => {
  it('devolve o próprio nome quando não há colisão', () => {
    expect(nomeLivreEm('Gandalf.json', ['Bruce Banner.json'])).toBe('Gandalf.json')
  })

  it('nome repetido ganha " (2)" antes da extensão', () => {
    expect(nomeLivreEm('Gandalf.json', ['Gandalf.json'])).toBe('Gandalf (2).json')
  })

  it('incrementa até achar um número livre', () => {
    expect(nomeLivreEm('Gandalf.json', ['Gandalf.json', 'Gandalf (2).json', 'Gandalf (3).json']))
      .toBe('Gandalf (4).json')
  })

  it('pasta (sem extensão) também ganha sufixo', () => {
    expect(nomeLivreEm('taverna', ['taverna'])).toBe('taverna (2)')
  })

  it('preserva acento e espaço no nome, sem slugificar', () => {
    expect(nomeLivreEm('Torre do Mágo (Ruínas).json', ['Torre do Mágo (Ruínas).json']))
      .toBe('Torre do Mágo (Ruínas) (2).json')
  })
})

describe('nomeFinalRestauro', () => {
  const base: EntradaLixeira = {
    id: 'e1', tipo: 'personagem', nome: 'Gandalf', excluidoEm: '2026-01-01T00:00:00.000Z',
    origemDir: 'personagens-soltos', nomeArquivo: 'gandalf.json', ehPasta: false,
  }

  it('sem colisão, mantém o nome original', () => {
    expect(nomeFinalRestauro(base, [])).toBe('gandalf.json')
  })

  it('nome já ocupado no destino ganha sufixo — nunca sobrescreve', () => {
    expect(nomeFinalRestauro(base, ['gandalf.json'])).toBe('gandalf (2).json')
  })

  it('cenário é pasta: mesmo algoritmo, sem extensão', () => {
    const cenario: EntradaLixeira = {
      id: 'e2', tipo: 'cenario', nome: 'Taverna', excluidoEm: '2026-01-01T00:00:00.000Z',
      origemDir: 'cenarios', nomeArquivo: 'taverna', ehPasta: true,
    }
    expect(nomeFinalRestauro(cenario, ['taverna', 'taverna (2)'])).toBe('taverna (3)')
  })
})

describe('dirDaEntrada / caminhoArquivoEntrada', () => {
  it('cada entrada mora numa pasta própria pelo id — nunca colide entre si', () => {
    expect(dirDaEntrada('abc-123')).toBe('.lixeira/abc-123')
  })

  it('o registro fica DENTRO da pasta da própria entrada, não num arquivo compartilhado', () => {
    expect(caminhoArquivoEntrada('abc-123')).toBe('.lixeira/abc-123/entrada.json')
  })
})

describe('normalizarEntradaLixeira', () => {
  it('repara entrada válida, com o id da PASTA sobrepondo o que estiver no arquivo', () => {
    const raw = {
      id: 'id-antigo-ou-ausente', tipo: 'item', nome: 'Espada Élfica',
      excluidoEm: '2026-01-01T00:00:00.000Z', origemDir: 'itens/armas',
      nomeArquivo: 'espada-élfica.json', ehPasta: false, entidadeId: 'item-1',
    }
    const e = normalizarEntradaLixeira(raw, 'id-da-pasta')
    expect(e?.id).toBe('id-da-pasta')
    expect(e).toMatchObject({ tipo: 'item', nome: 'Espada Élfica', entidadeId: 'item-1' })
  })

  it('nome ausente cai para o nome do arquivo', () => {
    const raw = { tipo: 'item', origemDir: 'itens', nomeArquivo: 'espada.json' }
    expect(normalizarEntradaLixeira(raw, 'p1')?.nome).toBe('espada.json')
  })

  it('tipo fora do domínio é rejeitado', () => {
    expect(normalizarEntradaLixeira({ tipo: 'sessao', origemDir: '', nomeArquivo: 'x.json' }, 'p1')).toBeNull()
  })

  it('sem nomeArquivo é rejeitado', () => {
    expect(normalizarEntradaLixeira({ tipo: 'item', origemDir: '' }, 'p1')).toBeNull()
  })

  it('não-objeto é rejeitado', () => {
    expect(normalizarEntradaLixeira(null, 'p1')).toBeNull()
    expect(normalizarEntradaLixeira('lixo', 'p1')).toBeNull()
  })
})

describe('novaEntradaLixeira', () => {
  it('monta entrada de cenário (pasta) com entidadeId para limpar vínculos no esvaziar', () => {
    const e = novaEntradaLixeira({
      id: 'lix-1', tipo: 'cenario', nome: 'Taverna do Javali', origemDir: 'cenarios',
      nomeArquivo: 'taverna-do-javali', ehPasta: true, entidadeId: 'cen-1', agora: '2026-08-15T10:00:00.000Z',
    })
    expect(e).toEqual({
      id: 'lix-1', tipo: 'cenario', nome: 'Taverna do Javali', excluidoEm: '2026-08-15T10:00:00.000Z',
      origemDir: 'cenarios', nomeArquivo: 'taverna-do-javali', ehPasta: true,
      temNotas: undefined, entidadeId: 'cen-1', paginaDocCaminho: undefined,
    })
  })
})
