// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useApp } from '../state/store'
import { VaultRepo } from '../lib/vaultRepo'
import type { Cenario, Item, PastaCenarioNode, PastaItemNode, PastaNode, Personagem, VaultTree } from '../lib/types'

/**
 * Terceira auditoria da Barra de Localização — defeito CRÍTICO: a correção anterior (defeito 1)
 * fez `timer.current = null` ANTES de `await salvar()`. Na PRIMEIRA falha isso não importa (o
 * `false` devolvido barra o mover). Mas depois da falha não sobra NADA agendado: no SEGUNDO
 * clique em "Mover" — sem editar nada, exatamente o que a mensagem de erro convida a fazer —
 * o flusher achava `timer.current === null` e devolvia `true` ("nada pendente") sem tentar
 * gravar de novo. O mover prosseguia com a edição nunca escrita em disco.
 *
 * O conserto separa "há timer agendado" (`timer.current`) de "há edição não confirmada em
 * disco" (`sujo.current`, um ref à parte que só volta a `false` quando `salvar()` CONFIRMA
 * sucesso). Estes testes provam que a SEGUNDA tentativa de mover — sem editar nada de novo —
 * volta a tentar gravar de verdade, nos três modais (cenário, personagem, item).
 */

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  message: vi.fn(async () => {}),
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
vi.mock('../components/BarraVersoesPersonagem', () => ({ BarraVersoesPersonagem: () => null }))
vi.mock('../components/EnquadrarRetrato', () => ({ EnquadrarRetrato: () => null }))

import { CenarioModal } from '../components/CenarioModal'
import { PerfilModal } from '../components/PerfilModal'
import { ItemModal } from '../components/ItemModal'

let container: HTMLDivElement
let root: Root

async function montar(elemento: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(elemento) })
}

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

/** Tenta mover clicando no botão certo + destino certo; devolve nada — quem chama confere o efeito. */
async function tentarMover(botaoMover: string, botaoDestino: string) {
  await clicar(botaoComTexto(botaoMover))
  await clicar(botaoComTexto(botaoDestino))
}

describe('CenarioModal — segunda tentativa de mover após falha grava de verdade (reauditoria 3)', () => {
  function cenario(id: string, nome: string): Cenario {
    return {
      id, nome, personagens: [],
      versoes: [{ id: `${id}-v1`, nome: 'Base', retrato: null, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', acervo: [], anotacoes: '', imagens: [] }],
      versaoAtivaId: `${id}-v1`, criadoEm: 'x', modificadoEm: 'y',
    }
  }
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
  /** Falha nas `falhasAntes` primeiras chamadas de `salvarCenario`; sucede a partir daí. */
  function repoFalhaEDepoisSucede(falhasAntes: number) {
    const chamadasMover: Array<{ de: string; para: string }> = []
    const nomesSalvos: string[] = []
    let salvarChamado = 0
    const repo = {
      async salvarCenario(_caminho: string, c: Cenario) {
        salvarChamado++
        if (salvarChamado <= falhasAntes) throw new Error('disco cheio')
        nomesSalvos.push(c.nome) // só registra o que de fato "chegou ao disco" com sucesso
      },
      async moverCenario(caminhoOrigem: string, dirDestino: string) {
        chamadasMover.push({ de: caminhoOrigem, para: dirDestino })
      },
      async montarArvore() { return arvore() },
      // fixo de propósito: o teste prova a gravação pelo CONTEÚDO passado a `salvarCenario`
      // (`nomesSalvos`), não pelo cache pós-reload — `lerCenario` aqui é só o disco "antigo"
      // que a árvore precisa pra montar, sem refletir a escrita que acabou de acontecer.
      async lerCenario() { return cenario('c1', 'Cidade') },
    }
    return { repo: repo as unknown as VaultRepo, chamadasMover, nomesSalvos, salvarChamado: () => salvarChamado }
  }

  beforeEach(() => {
    useApp.setState({ repo: null, vaultPath: null, cenarios: {}, caminhoCenarioPorId: {}, tree: null, cenarioAbertoId: null })
  })

  it('1ª tentativa falha e bloqueia; 2ª tentativa (sem editar de novo) tenta gravar de novo e move', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { repo, chamadasMover, nomesSalvos, salvarChamado } = repoFalhaEDepoisSucede(1)
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvore(),
      cenarios: { c1: cenario('c1', 'Cidade') }, caminhoCenarioPorId: { c1: 'cenarios/a' },
    })
    await montar(<CenarioModal cenarioId="c1" />)

    await digitar(inputNome(), 'Cidade Renomeada')

    // 1ª tentativa: falha, bloqueia
    await tentarMover('Mover para dentro de…', 'Cenários > subpasta')
    expect(salvarChamado()).toBe(1)
    expect(chamadasMover).toEqual([])

    // 2ª tentativa, SEM editar nada de novo: o defeito fazia isto reportar "nada pendente"
    // e mover sem nunca ter gravado a edição
    await tentarMover('Mover para dentro de…', 'Cenários > subpasta')
    expect(salvarChamado()).toBe(2) // tentou gravar de novo de verdade
    expect(chamadasMover).toEqual([{ de: 'cenarios/a', para: 'cenarios/subpasta' }])
    // a gravação que de fato chegou ao disco levou a edição digitada
    expect(nomesSalvos).toEqual(['Cidade Renomeada'])
  }, 10000)
})

describe('PerfilModal — segunda tentativa de mover após falha grava de verdade (reauditoria 3)', () => {
  function personagem(id: string, nome: string): Personagem {
    return {
      id, nome,
      versoes: [{ id: `${id}-v1`, nome, retrato: null, resumo: '', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [] }],
      versaoAtivaId: `${id}-v1`, criadoEm: 'x', modificadoEm: 'y',
    }
  }
  function arvore(): VaultTree {
    const raiz: PastaNode = {
      slug: 'personagens-soltos', nome: 'personagens-soltos', caminho: 'personagens-soltos',
      subpastas: [{ slug: 'viloes', nome: 'viloes', caminho: 'personagens-soltos/viloes', subpastas: [], personagens: [] }],
      personagens: [{ slug: 'bruce', nome: 'Bruce', caminho: 'personagens-soltos/bruce.json', id: 'p1' }],
    }
    return {
      campanhas: [], canvasesSoltos: [], mapasSoltos: [],
      personagensSoltos: raiz,
      cenarios: { slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios', subpastas: [], cenarios: [] },
      itens: { slug: 'itens', nome: 'itens', caminho: 'itens', subpastas: [], itens: [] },
    }
  }
  function repoFalhaEDepoisSucede(falhasAntes: number) {
    const chamadasMover: Array<{ de: string; para: string }> = []
    const nomesSalvos: string[] = []
    let salvarChamado = 0
    const repo = {
      async salvarPersonagem(_caminho: string, p: Personagem) {
        salvarChamado++
        if (salvarChamado <= falhasAntes) throw new Error('disco cheio')
        nomesSalvos.push(p.versoes[0].nome) // só o que de fato "chegou ao disco" com sucesso
      },
      async moverPersonagem(caminhoOrigem: string, dirDestino: string) {
        chamadasMover.push({ de: caminhoOrigem, para: dirDestino })
      },
      async montarArvore() { return arvore() },
      async lerPersonagem() { return personagem('p1', 'Bruce') },
    }
    return { repo: repo as unknown as VaultRepo, chamadasMover, nomesSalvos, salvarChamado: () => salvarChamado }
  }

  beforeEach(() => {
    useApp.setState({ repo: null, vaultPath: null, personagens: {}, caminhoPorId: {}, tree: null, perfilAbertoId: null })
  })

  it('1ª tentativa falha e bloqueia; 2ª tentativa (sem editar de novo) tenta gravar de novo e move', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { repo, chamadasMover, nomesSalvos, salvarChamado } = repoFalhaEDepoisSucede(1)
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvore(),
      personagens: { p1: personagem('p1', 'Bruce') }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' },
    })
    await montar(<PerfilModal personagemId="p1" />)

    await digitar(inputNome(), 'Bruce Wayne')

    await tentarMover('Mover para pasta…', 'Personagens > viloes')
    expect(salvarChamado()).toBe(1)
    expect(chamadasMover).toEqual([])

    await tentarMover('Mover para pasta…', 'Personagens > viloes')
    expect(salvarChamado()).toBe(2)
    expect(chamadasMover).toEqual([{ de: 'personagens-soltos/bruce.json', para: 'personagens-soltos/viloes' }])
    expect(nomesSalvos).toEqual(['Bruce Wayne'])
  }, 10000)
})

describe('ItemModal — segunda tentativa de mover após falha grava de verdade (reauditoria 3)', () => {
  function item(id: string, nome: string): Item {
    return {
      id, nome, resumo: '', descricao: '', informacao: '', efeito: '', retrato: null, foco: undefined,
      criadoEm: 'x', modificadoEm: 'y',
    } as Item
  }
  function arvore(): VaultTree {
    const raiz: PastaItemNode = {
      slug: 'itens', nome: 'itens', caminho: 'itens',
      subpastas: [{ slug: 'armas', nome: 'armas', caminho: 'itens/armas', subpastas: [], itens: [] }],
      itens: [{ slug: 'espada', nome: 'Espada', caminho: 'itens/espada.json', id: 'i1' }],
    }
    return {
      campanhas: [], canvasesSoltos: [], mapasSoltos: [],
      personagensSoltos: { slug: 'personagens-soltos', nome: 'personagens-soltos', caminho: 'personagens-soltos', subpastas: [], personagens: [] },
      cenarios: { slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios', subpastas: [], cenarios: [] },
      itens: raiz,
    }
  }
  function repoFalhaEDepoisSucede(falhasAntes: number) {
    const chamadasMover: Array<{ de: string; para: string }> = []
    const nomesSalvos: string[] = []
    let salvarChamado = 0
    const repo = {
      async salvarItem(_caminho: string, i: Item) {
        salvarChamado++
        if (salvarChamado <= falhasAntes) throw new Error('disco cheio')
        nomesSalvos.push(i.nome) // só o que de fato "chegou ao disco" com sucesso
      },
      async moverItem(caminhoOrigem: string, dirDestino: string) {
        chamadasMover.push({ de: caminhoOrigem, para: dirDestino })
      },
      async montarArvore() { return arvore() },
      async lerItem() { return item('i1', 'Espada') },
    }
    return { repo: repo as unknown as VaultRepo, chamadasMover, nomesSalvos, salvarChamado: () => salvarChamado }
  }

  beforeEach(() => {
    useApp.setState({ repo: null, vaultPath: null, itens: {}, caminhoItemPorId: {}, tree: null, itemAbertoId: null })
  })

  it('1ª tentativa falha e bloqueia; 2ª tentativa (sem editar de novo) tenta gravar de novo e move', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { repo, chamadasMover, nomesSalvos, salvarChamado } = repoFalhaEDepoisSucede(1)
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvore(),
      itens: { i1: item('i1', 'Espada') }, caminhoItemPorId: { i1: 'itens/espada.json' },
    })
    await montar(<ItemModal itemId="i1" />)

    await digitar(inputNome(), 'Espada Flamejante')

    await tentarMover('Mover para pasta…', 'Itens > armas')
    expect(salvarChamado()).toBe(1)
    expect(chamadasMover).toEqual([])

    await tentarMover('Mover para pasta…', 'Itens > armas')
    expect(salvarChamado()).toBe(2)
    expect(chamadasMover).toEqual([{ de: 'itens/espada.json', para: 'itens/armas' }])
    expect(nomesSalvos).toEqual(['Espada Flamejante'])
  }, 10000)
})
