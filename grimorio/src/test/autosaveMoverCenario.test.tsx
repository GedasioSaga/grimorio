// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useApp } from '../state/store'
import { VaultRepo } from '../lib/vaultRepo'
import type { Cenario, PastaCenarioNode, VaultTree } from '../lib/types'

/**
 * Defeito 1 (crítico) do relatório de auditoria: o autosave LOCAL do modal (800ms) era
 * agendado sobre o caminho capturado no render — se o usuário movesse a entidade antes do
 * timer disparar, a gravação ia para o lugar errado (ou falhava e perdia a edição). A
 * correção é a Barra de Localização flushar esse pendente ANTES de mover (ver
 * `flushModalPendente`/`registrarFlushModal` em state/store.ts).
 *
 * Sem @testing-library no projeto: monta com react-dom/client + act, como
 * dialogoTransformar.test.tsx. Store REAL — mockar esconderia a transição testada.
 */

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), message: vi.fn(), ask: vi.fn(async () => true) }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => 'asset://' + p }))
// subcomponentes pesados da ficha (tiptap, IA, chat…) não são o alvo deste teste — o
// mínimo pra montar o CenarioModal sem arrastar as dependências deles
vi.mock('../components/EditorTexto', () => ({ EditorTexto: () => null }))
vi.mock('../components/GaleriaPersonagem', () => ({ GaleriaPersonagem: () => null }))
vi.mock('../components/AbaVinculos', () => ({ AbaVinculos: () => null }))
vi.mock('../components/AcervoCenario', () => ({ AcervoCenario: () => null }))
vi.mock('../components/AcoesIA', () => ({ AcoesIA: () => null }))
vi.mock('../components/ChatEntidade', () => ({ ChatEntidade: () => null }))
vi.mock('../components/BarraVersoes', () => ({ BarraVersoes: () => null }))
vi.mock('../components/EnquadrarRetrato', () => ({ EnquadrarRetrato: () => null }))

import { CenarioModal } from '../components/CenarioModal'

function cenario(id: string, nome: string): Cenario {
  return {
    id, nome, personagens: [],
    versoes: [{ id: `${id}-v1`, nome: 'Base', retrato: null, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', acervo: [], anotacoes: '', imagens: [] }],
    versaoAtivaId: `${id}-v1`, criadoEm: 'x', modificadoEm: 'y',
  }
}

/** Origem em `cenarios/a`; destino é a pasta organizacional `cenarios/subpasta`. */
function arvore(): VaultTree {
  const raiz: PastaCenarioNode = {
    slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios',
    subpastas: [{ slug: 'subpasta', nome: 'subpasta', caminho: 'cenarios/subpasta', subpastas: [], cenarios: [] }],
    cenarios: [{ id: 'c1', slug: 'a', nome: 'Cidade', caminho: 'cenarios/a', filhos: [] }],
  }
  return {
    campanhas: [], canvasesSoltos: [], mapasSoltos: [],
    personagensSoltos: { slug: 'personagens-soltos', nome: 'personagens-soltos', caminho: 'personagens-soltos', subpastas: [], personagens: [] },
    cenarios: raiz,
    itens: { slug: 'itens', nome: 'itens', caminho: 'itens', subpastas: [], itens: [] },
  }
}

/** Repo de mentira: registra CADA chamada de salvarCenario/moverCenario, em ordem. */
function repoEspiao() {
  const chamadas: Array<{ tipo: 'salvar'; caminho: string; nome: string } | { tipo: 'mover'; de: string; para: string }> = []
  let dirAtual = 'cenarios/a'
  const repo = {
    async salvarCenario(caminho: string, c: Cenario) {
      chamadas.push({ tipo: 'salvar', caminho, nome: c.nome })
    },
    async moverCenario(caminhoOrigem: string, dirDestino: string) {
      chamadas.push({ tipo: 'mover', de: caminhoOrigem, para: dirDestino })
      dirAtual = `${dirDestino}/a`
    },
    async montarArvore() {
      const t = arvore()
      // reflete o novo local depois do "mover" pra carregarCenarios() achar o cenário lá
      t.cenarios.cenarios = []
      t.cenarios.subpastas[0].cenarios = [{ id: 'c1', slug: 'a', nome: 'Cidade', caminho: dirAtual, filhos: [] }]
      return t
    },
    async lerCenario() {
      return { ...cenario('c1', 'Cidade'), versoes: [{ ...cenario('c1', 'Cidade').versoes[0] }] }
    },
  }
  return { repo: repo as unknown as VaultRepo, chamadas, dirAtual: () => dirAtual }
}

let container: HTMLDivElement
let root: Root

async function montar() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<CenarioModal cenarioId="c1" />) })
}

beforeEach(() => {
  useApp.setState({
    repo: null, vaultPath: null, cenarios: {}, caminhoCenarioPorId: {}, tree: null, cenarioAbertoId: null,
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

describe('CenarioModal + BarraLocalizacao — autosave pendente sobrevive a mover (defeito 1)', () => {
  it('flusha a edição pendente no caminho ANTIGO antes de mover, e o timer não dispara de novo depois', async () => {
    const { repo, chamadas } = repoEspiao()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvore(),
      cenarios: { c1: cenario('c1', 'Cidade') }, caminhoCenarioPorId: { c1: 'cenarios/a' },
    })
    await montar()

    // digita ANTES de mover: agenda o timer local de 800ms com o caminho de agora
    await digitar(inputNome(), 'Cidade Renomeada')

    // move sem esperar os 800ms — é exatamente a corrida do repro do defeito
    await clicar(botaoComTexto('Mover para dentro de…'))
    await clicar(botaoComTexto('Cenários > subpasta'))

    // o flush tem que ter gravado no caminho ANTIGO com o nome já digitado, ANTES do mover
    const idxSalvar = chamadas.findIndex((c) => c.tipo === 'salvar')
    const idxMover = chamadas.findIndex((c) => c.tipo === 'mover')
    expect(idxSalvar).toBeGreaterThanOrEqual(0)
    expect(idxMover).toBeGreaterThan(idxSalvar)
    const salvar = chamadas[idxSalvar] as { tipo: 'salvar'; caminho: string; nome: string }
    expect(salvar.caminho).toBe('cenarios/a')
    expect(salvar.nome).toBe('Cidade Renomeada')
    const mover = chamadas[idxMover] as { tipo: 'mover'; de: string; para: string }
    expect(mover.de).toBe('cenarios/a')
    expect(mover.para).toBe('cenarios/subpasta')

    const totalSalvarAntes = chamadas.filter((c) => c.tipo === 'salvar').length
    // espera passar da janela dos 800ms com tempo REAL: se o timer não tivesse sido
    // cancelado pelo flush, ele dispararia aqui e gravaria de novo (no caminho errado)
    await new Promise((r) => setTimeout(r, 900))
    const totalSalvarDepois = chamadas.filter((c) => c.tipo === 'salvar').length
    expect(totalSalvarDepois).toBe(totalSalvarAntes)
  }, 10000)
})
