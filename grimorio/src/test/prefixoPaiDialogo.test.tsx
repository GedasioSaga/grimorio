// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Editor, TLImageShape } from 'tldraw'
import type { EscolhaTransformacao } from '../components/dialogoTransformar'
import { HostDialogos, pedirTexto, pedirTextoComPrefixo, useDialogo } from '../components/dialogos'

// Transformar imagem em cenário DENTRO de um pai: (1) o pai escolhido no diálogo anterior
// chega ao pedido de nome como prefixo "Pai: " pronto, e o nome do arquivo da imagem cai
// fora; (2) o campo abre com o prefixo, cursor no fim e nada selecionado — select() faria
// a primeira tecla apagar o prefixo; (3) o renomear, que abre com o nome inteiro pra ser
// substituído, continua selecionando tudo. dialogos.tsx é o módulo REAL aqui: o fluxo é
// observado pelo store (useDialogo), que é onde o Host lê o que renderiza.

const h = vi.hoisted(() => ({
  escolha: null as EscolhaTransformacao | null,
  /** quando definido, pedirTextoComPrefixo devolve isto CRU, sem passar pelo store/textoConfirmado */
  respostaCrua: undefined as string | null | undefined,
}))

// dialogos é o módulo real por padrão (o Host precisa dele). pedirTextoComPrefixo ganha um
// desvio opcional: devolver a resposta crua, pulando a guarda de textoConfirmado — é assim
// que se prova que transformarImagemEmEntidade barra o prefixo intocado por conta própria,
// e não só porque o diálogo já barrou antes.
vi.mock('../components/dialogos', async (importOriginal) => {
  const real = await importOriginal<typeof import('../components/dialogos')>()
  return {
    ...real,
    pedirTextoComPrefixo: (titulo: string, prefixo: string, confirmar?: string) =>
      h.respostaCrua !== undefined
        ? Promise.resolve(h.respostaCrua)
        : real.pedirTextoComPrefixo(titulo, prefixo, confirmar),
  }
})
vi.mock('../components/dialogoTransformar', () => ({ pedirTransformacao: async () => h.escolha }))
vi.mock('../components/dialogoCampanhas', () => ({ associarEscolhendoCampanhas: vi.fn() }))
// repo com os métodos de criação espiados: o teste do prefixo intocado prova que NENHUM
// deles é chamado — o fluxo tem de parar antes de criar pasta ou cenário
const repo = { criarPasta: vi.fn(), criarCenarioEm: vi.fn(), criarPersonagemEm: vi.fn(), criarItemEm: vi.fn() }
vi.mock('../state/store', () => ({ useApp: { getState: () => ({ repo, vaultPath: 'C:/cofre' }) } }))
// o fluxo só chega ao canvas depois do nome confirmado; aqui o nome é sempre cancelado,
// então tldraw e os cards viram casca — importá-los de verdade arrastaria WebGL/tauri
vi.mock('tldraw', () => ({ createShapeId: () => 'shape:x' }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ message: vi.fn() }))
vi.mock('../components/CharacterCardShape', () => ({ CARD_ALTURA_PADRAO: 1, CARD_LARGURA_PADRAO: 1 }))
vi.mock('../components/ligacoesCanvas', () => ({}))

const { transformarImagemEmEntidade } = await import('../components/transformarImagemEmEntidade')

const asset = { type: 'image', props: { name: 'tldrawFile.png' }, meta: { rel: 'imagens-canvas/tldrawFile.png' } }
// Editor e TLImageShape são classes/tipos fechados do tldraw; o fluxo só toca getAsset e
// props.assetId, e montar um Editor real exigiria store + canvas — daí o duplo mínimo
const editor = { getAsset: () => asset } as unknown as Editor
const shape = { props: { assetId: 'asset:1' } } as unknown as TLImageShape

/** Deixa as promises do fluxo andarem até o pedido de nome ficar aberto no store. */
async function esperarPedido() {
  for (let i = 0; i < 20 && !useDialogo.getState().pedido; i++) await Promise.resolve()
  const pedido = useDialogo.getState().pedido
  if (!pedido) throw new Error('o fluxo não chegou a pedir o nome')
  return pedido
}

describe('transformarImagemEmEntidade — nome com prefixo do pai', () => {
  beforeEach(() => {
    if (useDialogo.getState().pedido) useDialogo.getState().responder(null)
    h.respostaCrua = undefined
    for (const fn of Object.values(repo)) fn.mockClear()
  })

  it('com pai escolhido, pede o nome com "Pai: " pronto, cursor no fim, e descarta o nome do arquivo', async () => {
    h.escolha = { modo: 'novo', tipo: 'cenario', dir: 'cenarios/reino-de-goa', paiNome: 'Reino de Goa' }
    const fluxo = transformarImagemEmEntidade(editor, shape)
    const pedido = await esperarPedido()
    expect(pedido.titulo).toBe('Nome do cenário:')
    expect(pedido.valorInicial).toBe('Reino de Goa: ')
    expect(pedido.cursor).toBe('fim')
    expect(pedido.sugestao).toBeUndefined()
    expect(pedido.confirmar).toBe('Criar')
    useDialogo.getState().responder(null)
    await fluxo
  })

  it('confirmar com o prefixo intocado não cria nada: "Reino de Goa: " é o vazio deste pedido', async () => {
    h.escolha = { modo: 'novo', tipo: 'cenario', dir: 'cenarios/reino-de-goa', novaPasta: 'nova', paiNome: 'Reino de Goa' }
    const fluxo = transformarImagemEmEntidade(editor, shape)
    const pedido = await esperarPedido()
    useDialogo.getState().responder(pedido.valorInicial)
    await fluxo
    expect(repo.criarPasta).not.toHaveBeenCalled()
    expect(repo.criarCenarioEm).not.toHaveBeenCalled()
  })

  it('o prefixo sem o espaço final ("Reino de Goa:") também conta como vazio', async () => {
    h.escolha = { modo: 'novo', tipo: 'cenario', dir: 'cenarios/reino-de-goa', paiNome: 'Reino de Goa' }
    const fluxo = transformarImagemEmEntidade(editor, shape)
    await esperarPedido()
    useDialogo.getState().responder('Reino de Goa:')
    await fluxo
    expect(repo.criarCenarioEm).not.toHaveBeenCalled()
  })

  it('mesmo que o diálogo devolvesse o prefixo cru, o fluxo não cria pasta nem cenário', async () => {
    h.escolha = { modo: 'novo', tipo: 'cenario', dir: 'cenarios/reino-de-goa', novaPasta: 'nova', paiNome: 'Reino de Goa' }
    h.respostaCrua = 'Reino de Goa: '
    await transformarImagemEmEntidade(editor, shape)
    expect(repo.criarPasta).not.toHaveBeenCalled()
    expect(repo.criarCenarioEm).not.toHaveBeenCalled()
  })

  it('prefixo cru sem o espaço ("Reino de Goa:") também não cria nada', async () => {
    h.escolha = { modo: 'novo', tipo: 'cenario', dir: 'cenarios/reino-de-goa', paiNome: 'Reino de Goa' }
    h.respostaCrua = 'Reino de Goa:'
    await transformarImagemEmEntidade(editor, shape)
    expect(repo.criarCenarioEm).not.toHaveBeenCalled()
  })

  it('com a parte própria digitada, cria o cenário com o nome completo "Pai: Filho"', async () => {
    h.escolha = { modo: 'novo', tipo: 'cenario', dir: 'cenarios/reino-de-goa', paiNome: 'Reino de Goa' }
    h.respostaCrua = 'Reino de Goa: Cozinha'
    // o repo mínimo não vai além de criarCenarioEm (lerCenario não existe): o fluxo cai
    // no catch e mostra a mensagem de erro — o que interessa é o nome que chegou à criação
    await transformarImagemEmEntidade(editor, shape)
    expect(repo.criarCenarioEm).toHaveBeenCalledWith('cenarios/reino-de-goa', 'Reino de Goa: Cozinha')
  })

  it('sem pai, nada muda: sugere o nome do arquivo com seleção total', async () => {
    h.escolha = { modo: 'novo', tipo: 'cenario', dir: 'cenarios' }
    const fluxo = transformarImagemEmEntidade(editor, shape)
    const pedido = await esperarPedido()
    expect(pedido.titulo).toBe('Nome do cenário:')
    expect(pedido.valorInicial).toBe('tldrawFile')
    expect(pedido.cursor).toBe('selecionar')
    useDialogo.getState().responder(null)
    await fluxo
  })
})

let container: HTMLDivElement
let root: Root

async function montar() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<HostDialogos />) })
}

/** O foco/seleção do Host vive num requestAnimationFrame depois do re-render — espera passar. */
async function proximoQuadro() {
  await act(async () => { await new Promise<void>((r) => requestAnimationFrame(() => r())) })
}

const campo = () => container.querySelector('.dialogo-input') as HTMLInputElement
const ok = () => container.querySelector('.dialogo-ok') as HTMLButtonElement

describe('HostDialogos — cursor de abertura', () => {
  afterEach(async () => {
    if (useDialogo.getState().pedido) useDialogo.getState().responder(null)
    await act(async () => { root.unmount() })
    container.remove()
  })

  it('pedirTextoComPrefixo abre com o prefixo, cursor no fim e nada selecionado', async () => {
    await montar()
    let resolvido: string | null = null
    await act(async () => {
      void pedirTextoComPrefixo('Nome do cenário:', 'Reino de Goa: ', 'Criar').then((v) => { resolvido = v })
    })
    await proximoQuadro()

    expect(campo().value).toBe('Reino de Goa: ')
    expect(campo().selectionStart).toBe('Reino de Goa: '.length)
    expect(campo().selectionEnd).toBe('Reino de Goa: '.length)
    // prefixo não é sugestão: sem chip pra clicar
    expect(container.querySelector('.dialogo-sugestao')).toBeNull()

    const setar = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setar.call(campo(), 'Reino de Goa: Cozinha')
      campo().dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { ok().click() })
    expect(resolvido).toBe('Reino de Goa: Cozinha')
  })

  it('OK sem digitar nada depois do prefixo resolve null — nenhum nome "Pai: " escapa', async () => {
    await montar()
    let resolvido: string | null | undefined
    await act(async () => {
      void pedirTextoComPrefixo('Nome do cenário:', 'Reino de Goa: ', 'Criar').then((v) => { resolvido = v })
    })
    await proximoQuadro()
    expect(campo().value).toBe('Reino de Goa: ')
    await act(async () => { ok().click() })
    expect(resolvido).toBeNull()
  })

  it('Enter com o prefixo intocado também resolve null', async () => {
    await montar()
    let resolvido: string | null | undefined
    await act(async () => {
      void pedirTextoComPrefixo('Nome do cenário:', 'Reino de Goa: ', 'Criar').then((v) => { resolvido = v })
    })
    await proximoQuadro()
    await act(async () => {
      campo().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(resolvido).toBeNull()
  })

  it('renomear confirmando o mesmo nome continua devolvendo o nome: a guarda é só do prefixo', async () => {
    await montar()
    let resolvido: string | null | undefined
    await act(async () => {
      void pedirTexto('Novo nome:', 'Antigo', 'Renomear').then((v) => { resolvido = v })
    })
    await proximoQuadro()
    await act(async () => { ok().click() })
    expect(resolvido).toBe('Antigo')
  })

  it('pedirTexto com valor inicial (renomear) continua selecionando tudo', async () => {
    await montar()
    await act(async () => { void pedirTexto('Novo nome:', 'Antigo', 'Renomear') })
    await proximoQuadro()

    expect(campo().value).toBe('Antigo')
    expect(campo().selectionStart).toBe(0)
    expect(campo().selectionEnd).toBe('Antigo'.length)
  })
})
