// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useApp } from '../state/store'
import { VaultRepo } from '../lib/vaultRepo'
import type { PastaNode, Personagem, VaultTree } from '../lib/types'

/**
 * Defeito 1 (crítico), variante personagem/item: `moverPersonagem`/`moverItem` só removem
 * o ARQUIVO (a pasta continua existindo — ver vaultRepo.ts). Sem o flush antes de mover,
 * o timer local do modal dispararia DEPOIS, escrevendo de volta no diretório antigo e
 * ressuscitando um `.json` fantasma com o mesmo id — entidade duplicada em duas pastas.
 */

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), message: vi.fn(), ask: vi.fn(async () => true) }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => 'asset://' + p }))
vi.mock('../components/EditorTexto', () => ({ EditorTexto: () => null }))
vi.mock('../components/GaleriaPersonagem', () => ({ GaleriaPersonagem: () => null }))
vi.mock('../components/AbaVinculos', () => ({ AbaVinculos: () => null }))
vi.mock('../components/AcervoCenario', () => ({ AcervoCenario: () => null }))
vi.mock('../components/AcoesIA', () => ({ AcoesIA: () => null }))
vi.mock('../components/ChatEntidade', () => ({ ChatEntidade: () => null }))
vi.mock('../components/BarraVersoesPersonagem', () => ({ BarraVersoesPersonagem: () => null }))
vi.mock('../components/EnquadrarRetrato', () => ({ EnquadrarRetrato: () => null }))

import { PerfilModal } from '../components/PerfilModal'

function personagem(id: string, nome: string): Personagem {
  return {
    id, nome,
    versoes: [{ id: `${id}-v1`, nome, retrato: null, resumo: '', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [] }],
    versaoAtivaId: `${id}-v1`, criadoEm: 'x', modificadoEm: 'y',
  }
}

/** Origem em `personagens-soltos/bruce.json`; destino é `personagens-soltos/viloes`. */
function arvore(caminhoAtual: string): VaultTree {
  const raiz: PastaNode = {
    slug: 'personagens-soltos', nome: 'personagens-soltos', caminho: 'personagens-soltos',
    subpastas: [{ slug: 'viloes', nome: 'viloes', caminho: 'personagens-soltos/viloes', subpastas: [], personagens: [] }],
    personagens: [{ slug: 'bruce', nome: 'Bruce', caminho: caminhoAtual, id: 'p1' }],
  }
  return {
    campanhas: [], canvasesSoltos: [], mapasSoltos: [],
    personagensSoltos: raiz,
    cenarios: { slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios', subpastas: [], cenarios: [] },
    itens: { slug: 'itens', nome: 'itens', caminho: 'itens', subpastas: [], itens: [] },
  }
}

/** Repo de mentira: registra CADA chamada de salvarPersonagem/moverPersonagem, em ordem. */
function repoEspiao() {
  const chamadas: Array<{ tipo: 'salvar'; caminho: string; nome: string } | { tipo: 'mover'; de: string; para: string }> = []
  let caminhoAtual = 'personagens-soltos/bruce.json'
  const repo = {
    async salvarPersonagem(caminho: string, p: Personagem) {
      chamadas.push({ tipo: 'salvar', caminho, nome: p.versoes[0].nome })
    },
    async moverPersonagem(caminhoOrigem: string, dirDestino: string) {
      chamadas.push({ tipo: 'mover', de: caminhoOrigem, para: dirDestino })
      caminhoAtual = `${dirDestino}/bruce.json`
    },
    async montarArvore() {
      return arvore(caminhoAtual)
    },
    async lerPersonagem() {
      return personagem('p1', 'Bruce')
    },
  }
  return { repo: repo as unknown as VaultRepo, chamadas }
}

let container: HTMLDivElement
let root: Root

async function montar() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<PerfilModal personagemId="p1" />) })
}

beforeEach(() => {
  useApp.setState({
    repo: null, vaultPath: null, personagens: {}, caminhoPorId: {}, tree: null, perfilAbertoId: null,
  })
})

afterEach(() => {
  root.unmount()
  container.remove()
  vi.restoreAllMocks()
})

function inputNome(): HTMLInputElement {
  const i = container.querySelector<HTMLInputElement>('input.perfil-nome')
  if (!i) throw new Error('input de nome não encontrado')
  return i
}
async function digitar(input: HTMLInputElement, valor: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function botaoComTexto(texto: string): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find((el) => el.textContent?.trim() === texto)
  if (!b) throw new Error(`botão "${texto}" não encontrado`)
  return b as HTMLButtonElement
}
const clicar = (el: Element) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

describe('PerfilModal + BarraLocalizacao — mover não ressuscita fantasma na pasta antiga (defeito 1)', () => {
  it('flusha a edição pendente no caminho ANTIGO antes de mover, e nada é regravado lá depois', async () => {
    const { repo, chamadas } = repoEspiao()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvore('personagens-soltos/bruce.json'),
      personagens: { p1: personagem('p1', 'Bruce') }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' },
    })
    await montar()

    await digitar(inputNome(), 'Bruce Wayne')
    await clicar(botaoComTexto('Mover para pasta…'))
    await clicar(botaoComTexto('Personagens > viloes'))

    const idxSalvar = chamadas.findIndex((c) => c.tipo === 'salvar')
    const idxMover = chamadas.findIndex((c) => c.tipo === 'mover')
    expect(idxSalvar).toBeGreaterThanOrEqual(0)
    expect(idxMover).toBeGreaterThan(idxSalvar)
    expect((chamadas[idxSalvar] as { caminho: string }).caminho).toBe('personagens-soltos/bruce.json')

    const totalAntes = chamadas.filter((c) => c.tipo === 'salvar').length
    // sem o flush, o timer de 800ms dispararia aqui e RECRIARIA o arquivo na pasta antiga
    // (moverPersonagem só apaga o ARQUIVO, não a pasta) — o fantasma duplicado do defeito 1
    await new Promise((r) => setTimeout(r, 900))
    const totalDepois = chamadas.filter((c) => c.tipo === 'salvar').length
    expect(totalDepois).toBe(totalAntes)
  }, 10000)
})
