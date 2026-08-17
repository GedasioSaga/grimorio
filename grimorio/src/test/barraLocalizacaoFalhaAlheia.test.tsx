// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useApp } from '../state/store'
import { VaultRepo } from '../lib/vaultRepo'
import type { Cenario, PastaCenarioNode, VaultTree } from '../lib/types'

/**
 * Terceira auditoria — defeito MÉDIO: `mover`/`absorver` na Barra de Localização chamam
 * `descarregarFilas()` sem filtrar por id — ela descarrega TODA gravação pendente do cofre,
 * não só a da entidade que está sendo movida. Antes deste conserto, uma falha em QUALQUER
 * outra entidade (um cartão qualquer no canvas com escrita pendente, por exemplo) bloqueava
 * o mover da entidade ATUAL com uma mensagem que dava a entender ser a edição dela.
 *
 * O conserto (`checarFalhasDescarga` em BarraLocalizacao.tsx) separa as falhas por caminho de
 * arquivo: só uma falha na PRÓPRIA entidade bloqueia o mover; falha alheia gera um aviso
 * honesto (dizendo QUAL entidade) e a operação segue, porque a edição da entidade atual já
 * está confirmada em disco.
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

/** c1 (sendo movido, em `cenarios/a`) + c2 (alheio, em `cenarios/b`) + destino `cenarios/subpasta`. */
function arvore(): VaultTree {
  const raiz: PastaCenarioNode = {
    slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios',
    subpastas: [{ slug: 'subpasta', nome: 'subpasta', caminho: 'cenarios/subpasta', subpastas: [], cenarios: [] }],
    cenarios: [
      { id: 'c1', slug: 'a', nome: 'Cidade', caminho: 'cenarios/a', filhos: [] },
      { id: 'c2', slug: 'b', nome: 'Vila Alheia', caminho: 'cenarios/b', filhos: [] },
    ],
  }
  return {
    campanhas: [], canvasesSoltos: [], mapasSoltos: [],
    personagensSoltos: { slug: 'personagens-soltos', nome: 'personagens-soltos', caminho: 'personagens-soltos', subpastas: [], personagens: [] },
    cenarios: raiz,
    itens: { slug: 'itens', nome: 'itens', caminho: 'itens', subpastas: [], itens: [] },
  }
}

/** salvarCenario falha SÓ para o caminho de c2 (a entidade alheia); c1 grava normalmente. */
function repoFalhaSoNaAlheia() {
  const chamadasMover: Array<{ de: string; para: string }> = []
  const salvos: Array<{ caminho: string; nome: string }> = []
  const repo = {
    async salvarCenario(caminho: string, c: Cenario) {
      if (caminho === 'cenarios/b') throw new Error('disco cheio (alheio)')
      salvos.push({ caminho, nome: c.nome })
    },
    async moverCenario(caminhoOrigem: string, dirDestino: string) {
      chamadasMover.push({ de: caminhoOrigem, para: dirDestino })
    },
    async montarArvore() { return arvore() },
    async lerCenario() { return cenario('c1', 'Cidade') },
  }
  return { repo: repo as unknown as VaultRepo, chamadasMover, salvos }
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

describe('BarraLocalizacao — bloqueio proporcional a falha alheia (defeito médio, reauditoria 3)', () => {
  it('falha em OUTRA entidade não bloqueia o mover da atual; avisa dizendo qual entidade falhou', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { repo, chamadasMover, salvos } = repoFalhaSoNaAlheia()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvore(),
      cenarios: { c1: cenario('c1', 'Cidade'), c2: cenario('c2', 'Vila Alheia') },
      caminhoCenarioPorId: { c1: 'cenarios/a', c2: 'cenarios/b' },
    })
    await montar()

    // edita a entidade ATUAL (c1, aberta no modal)
    await digitar(inputNome(), 'Cidade Renomeada')
    // e deixa uma gravação pendente de OUTRA entidade (c2), agendada em nível de módulo —
    // mesmo mecanismo de uma edição inline no card do canvas
    await act(async () => {
      useApp.getState().salvarCenarioParcial('c2', { nome: 'Vila Alheia Editada' })
    })

    await clicar(botaoComTexto('Mover para dentro de…'))
    await clicar(botaoComTexto('Cenários > subpasta'))

    // a entidade ATUAL foi movida — a falha foi em OUTRA entidade, não bloqueia
    expect(chamadasMover).toEqual([{ de: 'cenarios/a', para: 'cenarios/subpasta' }])
    // a edição da entidade atual foi de fato gravada antes de mover
    expect(salvos.find((s) => s.caminho === 'cenarios/a')?.nome).toBe('Cidade Renomeada')
    // o usuário foi avisado — mas com honestidade: a mensagem cita a entidade ALHEIA, não
    // finge que o problema foi com a edição da entidade que ele estava mexendo
    expect(mensagensExibidas.length).toBeGreaterThan(0)
    expect(mensagensExibidas.some((m) => m.includes('Vila Alheia'))).toBe(true)
  }, 10000)

  it('falha na PRÓPRIA entidade continua bloqueando (não regride o defeito 1 original)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const chamadasMover: Array<{ de: string; para: string }> = []
    const repo = {
      async salvarCenario() { throw new Error('disco cheio') },
      async moverCenario(caminhoOrigem: string, dirDestino: string) {
        chamadasMover.push({ de: caminhoOrigem, para: dirDestino })
      },
      async montarArvore() { return arvore() },
      async lerCenario() { return cenario('c1', 'Cidade') },
    }
    useApp.setState({
      repo: repo as unknown as VaultRepo, vaultPath: 'C:/cofre', tree: arvore(),
      cenarios: { c1: cenario('c1', 'Cidade') }, caminhoCenarioPorId: { c1: 'cenarios/a' },
    })
    await montar()

    await digitar(inputNome(), 'Cidade Renomeada')
    await clicar(botaoComTexto('Mover para dentro de…'))
    await clicar(botaoComTexto('Cenários > subpasta'))

    expect(chamadasMover).toEqual([])
    expect(mensagensExibidas.length).toBeGreaterThan(0)
  }, 10000)
})
