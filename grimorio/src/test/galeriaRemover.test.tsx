// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * Tirar uma imagem da galeria só apaga o ARQUIVO quando ninguém mais o cita. Versão clonada herda os
 * mesmos arquivos da galeria da versão de origem: apagar ao tirar de uma versão quebrava a outra.
 * O repositório é um dublê: aqui se prova a costura (pergunta certa, com a entidade em memória, e
 * só apaga com "sim"); a resposta em si é da checagem única, provada em `citacoes.test.ts`.
 */
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  ask: vi.fn(async () => true),
  message: vi.fn(async () => undefined),
}))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => `asset://${p}`, invoke: vi.fn() }))

import { GaleriaPersonagem } from '../components/GaleriaPersonagem'
import { useApp } from '../state/store'
import type { VaultRepo } from '../lib/vaultRepo'

const REL = 'imagens/personagens/Bruce/01-a3f9.png'
const ARQUIVO = 'personagens-soltos/bruce.json'
const ENTIDADE = { id: 'p1', versoes: [{ id: 'v1', imagens: [{ rel: REL }] }, { id: 'v2', imagens: [{ rel: REL }] }] }

const repo = {
  citacaoUnicaDaImagem: vi.fn(async () => false),
  removerArquivoCofre: vi.fn(async () => undefined),
}

let container: HTMLDivElement
let root: Root
const mudancas: unknown[] = []

async function montar(arquivoEntidade: string | null) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <GaleriaPersonagem
        dono={{ tipo: 'personagem', nome: 'Bruce' }}
        imagens={[{ rel: REL }]}
        onImagensChange={(n) => mudancas.push(n)}
        entidade={ENTIDADE}
        arquivoEntidade={arquivoEntidade}
      />,
    )
  })
}

async function removerAPrimeira() {
  await act(async () => { container.querySelector<HTMLButtonElement>('.galeria-item')?.click() })
  const remover = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Remover')
  if (!remover) throw new Error('botão Remover não apareceu no lightbox')
  await act(async () => { remover.click() })
}

beforeEach(() => {
  vi.clearAllMocks()
  mudancas.length = 0
  useApp.setState({ repo: repo as unknown as VaultRepo, vaultPath: 'C:/Cofre' }) // as: dublê parcial; a galeria só chama estes dois métodos, outro quebraria o teste com "is not a function"
})

afterEach(() => {
  root.unmount()
  container.remove()
})

describe('Galeria — remover', () => {
  it('outra versão ainda cita: tira da lista, mas NÃO apaga o arquivo', async () => {
    repo.citacaoUnicaDaImagem.mockResolvedValue(false)
    await montar(ARQUIVO)
    await removerAPrimeira()
    expect(mudancas).toEqual([[]])
    expect(repo.citacaoUnicaDaImagem).toHaveBeenCalledWith(REL, { valor: ENTIDADE, arquivo: ARQUIVO, permitidas: 1 })
    expect(repo.removerArquivoCofre).not.toHaveBeenCalled()
  })

  it('ninguém mais cita: apaga o arquivo', async () => {
    repo.citacaoUnicaDaImagem.mockResolvedValue(true)
    await montar(ARQUIVO)
    await removerAPrimeira()
    expect(repo.removerArquivoCofre).toHaveBeenCalledWith(REL)
  })

  it('sem o arquivo da entidade não dá para separar memória de disco: não apaga', async () => {
    await montar(null)
    await removerAPrimeira()
    expect(mudancas).toEqual([[]])
    expect(repo.removerArquivoCofre).not.toHaveBeenCalled()
  })
})
