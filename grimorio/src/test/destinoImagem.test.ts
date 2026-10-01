import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A costura de imagem nova no app (`components/destinoImagem.ts`) com o `VaultRepo` de verdade sobre
 * o cofre fake. Prova os dois achados da revisão no caminho que o modal usa: trocar o retrato de uma
 * versão clonada NÃO sobrescreve o arquivo que a outra versão ainda cita, e o nome novo leva o
 * sufixo do conteúdo. Só o hash do Rust é dublê.
 */
const HASH_DO_ARQUIVO = `b7c1${'0'.repeat(60)}`
vi.mock('../lib/hashBridge', () => ({
  hashArquivo: vi.fn(async () => HASH_DO_ARQUIVO),
  hashTexto: vi.fn(async () => '0'.repeat(16)),
}))

import { destinoImagemNova } from '../components/destinoImagem'
import { hashArquivo } from '../lib/hashBridge'
import { VaultRepo } from '../lib/vaultRepo'
import { useApp } from '../state/store'
import { criarFakeFs } from './fakeFs'
import { RAIZ, gravarImagem, gravarJson, personagem, versaoPersonagem } from './cofreImagens'

const RETRATO = 'imagens/personagens/Bruce/retrato-a3f9.png'
const ARQUIVO = 'personagens-soltos/bruce.json'

beforeEach(async () => {
  const fs = criarFakeFs({ caixa: 'insensivel' })
  await gravarImagem(fs, RETRATO, 'dia')
  // no disco, a ficha de antes do clone (o autosave da versão nova ainda está no debounce)
  await gravarJson(fs, ARQUIVO, personagem('p1', [versaoPersonagem('v1', 'Bruce', RETRATO)], 'v1'))
  useApp.setState({ repo: new VaultRepo(RAIZ, fs), vaultPath: RAIZ })
})

describe('destinoImagemNova — troca de retrato', () => {
  it('versão clonada ainda cita o retrato: nome novo, com o sufixo do conteúdo novo', async () => {
    const emMemoria = personagem('p1', [versaoPersonagem('v1', 'Bruce', RETRATO), versaoPersonagem('v2', 'Hulk', RETRATO)], 'v2')
    const destino = await destinoImagemNova(
      { tipo: 'personagem', nome: 'Bruce' }, { papel: 'retrato' }, 'png',
      { caminho: 'C:/fora/hulk.png' }, { atual: RETRATO, entidade: emMemoria, arquivo: ARQUIVO },
    )
    expect(destino).toBe('imagens/personagens/Bruce/retrato-b7c1.png')
  })

  it('só a versão que está sendo trocada cita: reaproveita o arquivo (sem órfão)', async () => {
    const emMemoria = personagem('p1', [versaoPersonagem('v1', 'Bruce', RETRATO)], 'v1')
    const destino = await destinoImagemNova(
      { tipo: 'personagem', nome: 'Bruce' }, { papel: 'retrato' }, 'png',
      { caminho: 'C:/fora/novo.png' }, { atual: RETRATO, entidade: emMemoria, arquivo: ARQUIVO },
    )
    expect(destino).toBe(RETRATO)
  })

  it('entidade sem arquivo conhecido: na dúvida, nome novo', async () => {
    // outro conteúdo: o nome `retrato-b7c1` já foi reservado nesta sessão pelo primeiro caso
    vi.mocked(hashArquivo).mockResolvedValueOnce(`c3d4${'0'.repeat(60)}`)
    const emMemoria = personagem('p1', [versaoPersonagem('v1', 'Bruce', RETRATO)], 'v1')
    const destino = await destinoImagemNova(
      { tipo: 'personagem', nome: 'Bruce' }, { papel: 'retrato' }, 'png',
      { caminho: 'C:/fora/novo.png' }, { atual: RETRATO, entidade: emMemoria, arquivo: null },
    )
    expect(destino).toBe('imagens/personagens/Bruce/retrato-c3d4.png')
  })
})

describe('destinoImagemNova — sufixo de conteúdo', () => {
  it('hash do Rust falhou (ou veio vazio): sufixo aleatório de 4 hex, e a ação não trava', async () => {
    vi.mocked(hashArquivo).mockRejectedValueOnce(new Error('arquivo preso pelo antivírus'))
    const a = await destinoImagemNova({ tipo: 'item', nome: 'Elmo' }, { papel: 'retrato' }, 'png', { caminho: 'C:/fora/elmo.png' })
    // o dublê de `invoke` de outros testes devolve `undefined`: mesmo tratamento
    vi.mocked(hashArquivo).mockResolvedValueOnce(undefined as unknown as string) // as: simula o retorno inválido da ponte
    const b = await destinoImagemNova({ tipo: 'item', nome: 'Elmo' }, { papel: 'retrato' }, 'png', { caminho: 'C:/fora/elmo2.png' })
    expect(a).toMatch(/^imagens\/itens\/Elmo-[0-9a-f]{4}\.png$/)
    expect(b).toMatch(/^imagens\/itens\/Elmo-[0-9a-f]{4}(-\d+)?\.png$/)
  })

  it('imagem colada (bytes) leva os 4 primeiros hex do SHA-256 dela', async () => {
    // SHA-256("x") = 2d711642…
    const destino = await destinoImagemNova(
      { tipo: 'nota', nome: 'Sessão 1' }, { papel: 'numerada' }, 'png', { bytes: new TextEncoder().encode('x') },
    )
    expect(destino).toBe('imagens/notas/Sessão 1/01-2d71.png')
  })
})
