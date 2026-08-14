// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useApp } from '../state/store'
import type { VaultTree } from '../lib/types'

// Sem @testing-library no projeto: monta com react-dom/client + act, como PainelSync.test.tsx.
// Store REAL (useApp): a Task pede assertar `useApp.getState().aberto` após o clique, então
// mockar o store inteiro esconderia justamente a transição que o teste precisa provar.
const h = vi.hoisted(() => ({
  pedirTexto: vi.fn(),
  pedirEscolha: vi.fn(),
  associarNaCriacao: vi.fn(async () => {}),
  editarCampanhas: vi.fn(async () => {}),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), message: vi.fn() }))
vi.mock('../components/dialogos', () => ({ pedirTexto: h.pedirTexto, pedirEscolha: h.pedirEscolha }))
vi.mock('../components/dialogoCampanhas', () => ({
  associarNaCriacao: h.associarNaCriacao,
  editarCampanhas: h.editarCampanhas,
}))
// seções irmãs (Personagens/Cenários/Itens) e Opções não são o alvo deste teste — o mínimo
// necessário pra montar a Sidebar sem arrastar as próprias árvores/dependências delas
vi.mock('../components/PersonagensSoltos', () => ({ PersonagensSoltos: () => null }))
vi.mock('../components/CenariosSoltos', () => ({ CenariosSoltos: () => null }))
vi.mock('../components/ItensSoltos', () => ({ ItensSoltos: () => null }))
vi.mock('../components/Opcoes', () => ({ useOpcoes: { getState: () => ({ abrir: vi.fn() }) } }))

import { Sidebar } from '../components/Sidebar'

let container: HTMLDivElement
let root: Root

function arvoreComCanvasEMapa(): VaultTree {
  return {
    campanhas: [],
    canvasesSoltos: [{ nome: 'Anotações da mesa', caminho: 'canvases-soltos/anotacoes-da-mesa.json', slug: 'anotacoes-da-mesa', id: 'c1' }],
    mapasSoltos: [{ nome: 'Castelo L1', caminho: 'mapas-soltos/castelo-l1.json', slug: 'castelo-l1', id: 'm1' }],
    personagensSoltos: { slug: 'personagens-soltos', nome: 'Personagens soltos', caminho: 'personagens-soltos', subpastas: [], personagens: [] },
    cenarios: { slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', subpastas: [], cenarios: [] },
    itens: { slug: 'itens', nome: 'Itens', caminho: 'itens', subpastas: [], itens: [] },
  }
}

async function montar() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<Sidebar recolhida={false} onToggle={() => {}} />)
  })
}

const clicar = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))

function secaoCanvasEMapa(): HTMLElement {
  const secoes = Array.from(container.querySelectorAll('.sidebar-section'))
  const secao = secoes.find((s) => s.querySelector('.sidebar-section-header span')?.textContent === 'Canvas e Mapa')
  if (!secao) throw new Error('seção "Canvas e Mapa" não encontrada')
  return secao as HTMLElement
}

function itemComTexto(texto: string): HTMLElement {
  const item = Array.from(secaoCanvasEMapa().querySelectorAll('.item-linha'))
    .find((el) => el.textContent?.includes(texto))
  if (!item) throw new Error(`item "${texto}" não encontrado`)
  return item as HTMLElement
}

beforeEach(() => {
  h.pedirTexto.mockReset()
  h.pedirEscolha.mockReset()
  h.associarNaCriacao.mockReset().mockResolvedValue(undefined)
  h.editarCampanhas.mockReset().mockResolvedValue(undefined)
  useApp.setState({
    tree: arvoreComCanvasEMapa(),
    repo: {
      criarCanvasDoc: vi.fn(async (dir: string) => ({
        slug: 'novo', nome: 'Novo', caminho: `${dir}/novo.json`, id: 'novo-id',
      })),
    } as never,
    recarregarArvore: vi.fn(async () => {}),
    carregarPersonagens: vi.fn(async () => {}),
    carregarCenarios: vi.fn(async () => {}),
    carregarItens: vi.fn(async () => {}),
    caminhoItemPorId: {},
    vinculos: [],
    campanhaFiltro: null,
    grafoAberto: false,
    caminhoPorId: {},
    aberto: null,
  })
})

afterEach(() => {
  root.unmount()
  container.remove()
})

describe('Sidebar: seção "Canvas e Mapa"', () => {
  it('lista canvas e mapa juntos, cada um com o ícone certo', async () => {
    await montar()

    const secao = secaoCanvasEMapa()
    expect(itemComTexto('Anotações da mesa').textContent).toContain('▦')
    expect(itemComTexto('Castelo L1').textContent).toContain('🗺')
    // não sobrou seção "Mapas" separada
    expect(Array.from(secao.parentElement!.querySelectorAll('.sidebar-section-header span')).map((s) => s.textContent))
      .not.toContain('Mapas')
  })

  it('clicar no mapa abre o documento como mapa', async () => {
    await montar()

    await act(async () => { clicar(itemComTexto('Castelo L1')) })

    expect(useApp.getState().aberto).toEqual({
      tipo: 'mapa',
      caminho: 'mapas-soltos/castelo-l1.json',
      nome: 'Castelo L1',
    })
  })

  it('clicar no canvas abre o documento como canvas', async () => {
    await montar()

    await act(async () => { clicar(itemComTexto('Anotações da mesa')) })

    expect(useApp.getState().aberto).toEqual({
      tipo: 'canvas',
      caminho: 'canvases-soltos/anotacoes-da-mesa.json',
      nome: 'Anotações da mesa',
    })
  })

  it('botão "+" pergunta o tipo; escolhendo Mapa cria em mapas-soltos', async () => {
    h.pedirEscolha.mockResolvedValue('mapa')
    h.pedirTexto.mockResolvedValue('Novo Mapa')
    await montar()

    const botaoNovo = secaoCanvasEMapa().querySelector<HTMLButtonElement>('button.btn-icon')
    if (!botaoNovo) throw new Error('botão "+" não encontrado')

    await act(async () => { clicar(botaoNovo) })

    const repo = useApp.getState().repo as unknown as { criarCanvasDoc: ReturnType<typeof vi.fn> }
    expect(repo.criarCanvasDoc).toHaveBeenCalledWith('mapas-soltos', 'Novo Mapa')
  })

  it('botão "+" pergunta o tipo; escolhendo Canvas cria em canvases-soltos', async () => {
    h.pedirEscolha.mockResolvedValue('canvas')
    h.pedirTexto.mockResolvedValue('Novo Canvas')
    await montar()

    const botaoNovo = secaoCanvasEMapa().querySelector<HTMLButtonElement>('button.btn-icon')
    if (!botaoNovo) throw new Error('botão "+" não encontrado')

    await act(async () => { clicar(botaoNovo) })

    const repo = useApp.getState().repo as unknown as { criarCanvasDoc: ReturnType<typeof vi.fn> }
    expect(repo.criarCanvasDoc).toHaveBeenCalledWith('canvases-soltos', 'Novo Canvas')
  })

  it('cancelar a escolha de tipo não cria nada', async () => {
    h.pedirEscolha.mockResolvedValue(null)
    await montar()

    const botaoNovo = secaoCanvasEMapa().querySelector<HTMLButtonElement>('button.btn-icon')
    if (!botaoNovo) throw new Error('botão "+" não encontrado')

    await act(async () => { clicar(botaoNovo) })

    expect(h.pedirTexto).not.toHaveBeenCalled()
    const repo = useApp.getState().repo as unknown as { criarCanvasDoc: ReturnType<typeof vi.fn> }
    expect(repo.criarCanvasDoc).not.toHaveBeenCalled()
  })
})
