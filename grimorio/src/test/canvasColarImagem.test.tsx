// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AssetRecordType, type TLImageAsset, type TLStore } from 'tldraw'

/**
 * Imagem colada no canvas pelo caminho de verdade: o `upload` do asset store que
 * `useDocumentoTldraw` monta (`canvasDoc.ts`), com o `VaultRepo` sobre o cofre fake.
 *
 * O tldraw embrulha o blob do clipboard num `File` chamado "tldrawFile", sem extensão
 * (`node_modules/tldraw/dist-esm/lib/ui/hooks/clipboard/pasteFiles.mjs`). Esse nome não lembra
 * nada ao usuário: tem de virar número na pasta do documento, não `tldrawFile-5.png`.
 */
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => 'asset://' + p }))

import { useDocumentoTldraw } from '../components/canvasDoc'
import { SHAPE_UTILS_DO_STORE_MAPA } from '../lib/montagemMapa'
import { sha256Bytes } from '../lib/organizarImagens/impressao'
import { sufixoDoConteudo } from '../lib/organizarImagens/nomes'
import { VaultRepo } from '../lib/vaultRepo'
import { useApp } from '../state/store'
import { criarFakeFs } from './fakeFs'
import { RAIZ, gravarImagem, gravarJson, type FakeFs } from './cofreImagens'

/** Sessão sem camadas: o dono das imagens coladas é o canvas (`imagens/canvas/<Nome>/`). */
const CAMINHO = 'campanhas/c/sessoes/s3.json'
const PASTA = 'imagens/canvas/Sessão 3 Reino de Goa'

let fs: FakeFs
let container: HTMLDivElement
let root: Root
let storeVisto: TLStore | null = null

function Sonda() {
  storeVisto = useDocumentoTldraw(CAMINHO, SHAPE_UTILS_DO_STORE_MAPA).store
  return null
}

beforeEach(async () => {
  fs = criarFakeFs({ caixa: 'insensivel' })
  await gravarJson(fs, CAMINHO, { id: 's3', nome: 'Sessão 3 Reino de Goa', documento: null, criadoEm: '', modificadoEm: '' })
  useApp.setState({ repo: new VaultRepo(RAIZ, fs), vaultPath: RAIZ })
  storeVisto = null
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<Sonda />)
  })
})

afterEach(() => {
  root.unmount()
  container.remove()
})

/** O asset que o tldraw cria para a imagem colada; o `upload` do cofre só usa o `File`. */
function assetColado(): TLImageAsset {
  return {
    id: AssetRecordType.createId(),
    typeName: 'asset',
    type: 'image',
    props: { name: 'tldrawFile', src: null, w: 10, h: 10, mimeType: 'image/png', isAnimated: false },
    meta: {},
  }
}

async function colar(store: TLStore, conteudo: string): Promise<string> {
  const { meta } = await store.props.assets.upload(assetColado(), new File([conteudo], 'tldrawFile', { type: 'image/png' }))
  expect(meta).toMatchObject({ nomeOriginal: 'tldrawFile' })
  const rel = meta?.rel
  if (typeof rel !== 'string') throw new Error(`upload sem meta.rel: ${JSON.stringify(meta)}`)
  return rel
}

describe('colar imagem no canvas — o asset store de canvasDoc.ts', () => {
  it('o "tldrawFile" do clipboard vira o próximo número da pasta do canvas, com o sufixo do conteúdo', async () => {
    if (storeVisto === null) throw new Error('o store do canvas não montou')
    await gravarImagem(fs, `${PASTA}/01-a3f9.png`, 'colada antes')
    const sufixo = sufixoDoConteudo(await sha256Bytes(new TextEncoder().encode('pixels novos')))

    const rel = await colar(storeVisto, 'pixels novos')

    expect(rel).toBe(`${PASTA}/02-${sufixo}.png`)
    expect(await fs.exists(`${RAIZ}/${rel}`)).toBe(true)
  })
})
