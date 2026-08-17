// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useApp } from '../state/store'
import { VaultRepo } from '../lib/vaultRepo'
import type { Cenario, PastaCenarioNode, VaultTree } from '../lib/types'

/**
 * Reauditoria da correção do defeito 1: o flush ANTES de mover foi adicionado, mas a falha
 * dele era engolida — `flushModalPendente`/`descarregarFilas` eram chamados e o retorno
 * (boolean / FalhaDescarga[]) era ignorado, então `mover()` seguia direto pro
 * `repo.moverCenario` mesmo com a gravação de segurança tendo falhado. Resultado: com disco
 * cheio, a edição não chegava a lugar nenhum (nem no arquivo antigo, nem no novo) e o
 * usuário não era avisado — pior que o defeito original, que ao menos gravava (no lugar
 * errado).
 *
 * Este teste PROVA que agora: (1) uma falha na gravação de segurança barra o `moverCenario`
 * — a reorganização não acontece; (2) o usuário é avisado (diálogo de erro); (3) a edição
 * digitada continua viva no cache (não é descartada).
 */

const mensagensExibidas: string[] = []
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  message: vi.fn(async (msg: string) => { mensagensExibidas.push(msg) }),
  ask: vi.fn(async () => true),
}))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => 'asset://' + p }))
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

/** Repo de mentira: `salvarCenario` SEMPRE falha ("disco cheio"); `moverCenario` denuncia se for chamado. */
function repoEspiaoDiscoCheio() {
  const chamadasMover: Array<{ de: string; para: string }> = []
  let salvarChamado = 0
  const repo = {
    async salvarCenario() {
      salvarChamado++
      throw new Error('disco cheio')
    },
    async moverCenario(caminhoOrigem: string, dirDestino: string) {
      chamadasMover.push({ de: caminhoOrigem, para: dirDestino })
    },
    async montarArvore() {
      return arvore()
    },
    async lerCenario() {
      return cenario('c1', 'Cidade')
    },
  }
  return { repo: repo as unknown as VaultRepo, chamadasMover, salvarChamado: () => salvarChamado }
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
  mensagensExibidas.length = 0
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

describe('BarraLocalizacao — falha na gravação de segurança barra o mover (reauditoria do defeito 1)', () => {
  it('NÃO move quando o flush pré-mover falha, avisa o usuário, e mantém a edição no cache', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { repo, chamadasMover, salvarChamado } = repoEspiaoDiscoCheio()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvore(),
      cenarios: { c1: cenario('c1', 'Cidade') }, caminhoCenarioPorId: { c1: 'cenarios/a' },
    })
    await montar()

    // digita ANTES de mover: agenda o timer local de 800ms com o caminho de agora
    await digitar(inputNome(), 'Cidade Renomeada')

    // move sem esperar os 800ms — o clique dispara o flush, que tenta salvar e falha
    await clicar(botaoComTexto('Mover para dentro de…'))
    await clicar(botaoComTexto('Cenários > subpasta'))

    // a gravação de segurança foi tentada (e falhou)
    expect(salvarChamado()).toBeGreaterThan(0)
    // ponto central da regressão: `moverCenario` NUNCA pode ser chamado depois de uma falha
    expect(chamadasMover).toEqual([])
    // usuário avisado — não é uma falha silenciosa
    expect(mensagensExibidas.length).toBeGreaterThan(0)
    // a edição digitada continua viva no cache (nada foi descartado)
    expect(useApp.getState().cenarios.c1.nome).toBe('Cidade Renomeada')
  }, 10000)
})
