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
  associarNaCriacao: vi.fn(async () => {}),
  editarCampanhas: vi.fn(async () => {}),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), message: vi.fn() }))
vi.mock('../components/dialogos', () => ({ pedirTexto: h.pedirTexto }))
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

function arvoreComMapa(): VaultTree {
  return {
    campanhas: [],
    canvasesSoltos: [],
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

function secaoMapas(): HTMLElement {
  const secoes = Array.from(container.querySelectorAll('.sidebar-section'))
  const secao = secoes.find((s) => s.querySelector('.sidebar-section-header span')?.textContent === 'Mapas')
  if (!secao) throw new Error('seção Mapas não encontrada')
  return secao as HTMLElement
}

beforeEach(() => {
  h.pedirTexto.mockReset()
  h.associarNaCriacao.mockReset().mockResolvedValue(undefined)
  h.editarCampanhas.mockReset().mockResolvedValue(undefined)
  useApp.setState({
    tree: arvoreComMapa(),
    repo: { criarCanvasDoc: vi.fn(async () => ({ slug: 'novo-mapa', nome: 'Novo Mapa', caminho: 'mapas-soltos/novo-mapa.json', id: 'novo-id' })) } as never,
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

describe('Sidebar: seção Mapas', () => {
  it('lista o mapa da árvore com o ícone 🗺', async () => {
    await montar()

    const secao = secaoMapas()
    expect(secao.textContent).toContain('🗺')
    expect(secao.textContent).toContain('Castelo L1')
  })

  it('clicar no item abre o documento como mapa', async () => {
    await montar()

    const item = Array.from(secaoMapas().querySelectorAll('.item-linha'))
      .find((el) => el.textContent?.includes('Castelo L1'))
    if (!item) throw new Error('item "Castelo L1" não encontrado')

    await act(async () => { clicar(item) })

    expect(useApp.getState().aberto).toEqual({
      tipo: 'mapa',
      caminho: 'mapas-soltos/castelo-l1.json',
      nome: 'Castelo L1',
    })
  })

  it('botão "+" cria um mapa em mapas-soltos com o nome pedido', async () => {
    h.pedirTexto.mockResolvedValue('Novo Mapa')
    await montar()

    const botaoNovo = secaoMapas().querySelector<HTMLButtonElement>('button[title="Novo mapa"]')
    if (!botaoNovo) throw new Error('botão "Novo mapa" não encontrado')

    await act(async () => { clicar(botaoNovo) })

    const repo = useApp.getState().repo as unknown as { criarCanvasDoc: ReturnType<typeof vi.fn> }
    expect(repo.criarCanvasDoc).toHaveBeenCalledWith('mapas-soltos', 'Novo Mapa')
  })
})
