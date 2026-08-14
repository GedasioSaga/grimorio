// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useApp } from '../state/store'
import type { Cenario, Personagem, VaultTree } from '../lib/types'
import { HostDialogoTransformar, pedirTransformacao, type EscolhaTransformacao } from '../components/dialogoTransformar'

// Store REAL (useApp), como SidebarMapas.test.tsx: o diálogo lê tree/personagens/cenarios
// direto do store, e mockar tudo isso esconderia a lógica de busca/filtro que o teste cobre.

function personagem(id: string, nome: string, retrato: string | null = null): Personagem {
  return {
    id,
    nome,
    versoes: [{ id: `${id}-v1`, nome, retrato, resumo: '', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [] }],
    versaoAtivaId: `${id}-v1`,
    criadoEm: 'x',
    modificadoEm: 'y',
  }
}

function cenario(id: string, nome: string, retrato: string | null = null): Cenario {
  return {
    id,
    nome,
    personagens: [],
    versoes: [{ id: `${id}-v1`, nome: 'Base', retrato, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', acervo: [], anotacoes: '', imagens: [] }],
    versaoAtivaId: `${id}-v1`,
    criadoEm: 'x',
    modificadoEm: 'y',
  }
}

function arvore(): VaultTree {
  return {
    campanhas: [],
    canvasesSoltos: [],
    mapasSoltos: [],
    personagensSoltos: {
      nome: 'Personagens', caminho: 'personagens-soltos',
      subpastas: [{ nome: 'Vilões', caminho: 'personagens-soltos/viloes', subpastas: [] }],
    },
    cenarios: {
      nome: 'Cenários', caminho: 'cenarios',
      subpastas: [{ nome: 'Mundos', caminho: 'cenarios/mundos', subpastas: [] }],
    },
    itens: { nome: 'Itens', caminho: 'itens', subpastas: [] },
  } as unknown as VaultTree
}

let container: HTMLDivElement
let root: Root

async function montar() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<HostDialogoTransformar />)
  })
}

beforeEach(() => {
  useApp.setState({
    tree: arvore(),
    personagens: {
      p1: personagem('p1', 'Bruce Banner'),
      p2: personagem('p2', 'Peter Parker'),
    },
    cenarios: {
      c1: cenario('c1', 'Taverna'),
      c2: cenario('c2', 'Castelo'),
    },
    caminhoCenarioPorId: { c1: 'cenarios/taverna', c2: 'cenarios/castelo' },
    vaultPath: null,
  })
})

afterEach(() => {
  root.unmount()
  container.remove()
})

const clicar = (el: Element | null) => {
  if (!el) throw new Error('elemento não encontrado')
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}
const botaoComTexto = (texto: string): HTMLButtonElement => {
  const b = Array.from(container.querySelectorAll('button')).find((el) => el.textContent?.trim() === texto)
  if (!b) throw new Error(`botão "${texto}" não encontrado`)
  return b as HTMLButtonElement
}
const inputBusca = (): HTMLInputElement => {
  const i = container.querySelector<HTMLInputElement>('input.dialogo-input')
  if (!i) throw new Error('input de busca não encontrado')
  return i
}
const digitar = async (input: HTMLInputElement, valor: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

// abrir o pedido dispara `set()` no zustand fora do ciclo de eventos do React — sem
// envolver em act() o clique seguinte roda contra o DOM ainda não re-renderizado.
// `p` some dentro de um objeto: se uma função async RETORNASSE a promise pendente
// direto, o runtime a adotaria (thenable) e "await abrir()" travaria até ela resolver
// — exatamente o que ainda não aconteceu neste ponto do teste.
async function abrir(): Promise<{ p: Promise<EscolhaTransformacao | null> }> {
  let p!: Promise<EscolhaTransformacao | null>
  await act(async () => { p = pedirTransformacao() })
  return { p }
}

describe('HostDialogoTransformar', () => {
  it('sem pedido aberto não renderiza nada', async () => {
    await montar()
    expect(container.querySelector('.modal-overlay')).toBeNull()
  })

  it('Item pula o passo "novo ou existente" — vai direto pro seletor de pasta', async () => {
    await montar()
    const { p } = await abrir()
    await act(async () => { clicar(botaoComTexto('Item')) })
    expect(container.textContent).toContain('Onde criar o item?')
    await act(async () => { clicar(botaoComTexto('Cancelar')) })
    expect(await p).toBeNull()
  })

  it('Personagem: "Criar novo" segue o fluxo v1 (pasta) e resolve modo "novo"', async () => {
    await montar()
    const { p } = await abrir()
    await act(async () => { clicar(botaoComTexto('Personagem')) })
    expect(container.textContent).toContain('criar novo ou já existente?')
    await act(async () => { clicar(botaoComTexto('Criar novo')) })
    expect(container.textContent).toContain('Onde criar o personagem?')
    await act(async () => { clicar(botaoComTexto('Criar')) })
    const r = await p as EscolhaTransformacao
    expect(r).toEqual({ modo: 'novo', tipo: 'personagem', dir: 'personagens-soltos', novaPasta: undefined })
  })

  it('Personagem existente: busca filtra por nome e escolher resolve {modo: existente, id}', async () => {
    await montar()
    const { p } = await abrir()
    await act(async () => { clicar(botaoComTexto('Personagem')) })
    await act(async () => { clicar(botaoComTexto('Existente (nova transformação)')) })

    await digitar(inputBusca(), 'bruce')
    const itens = Array.from(container.querySelectorAll('.dialogo-lista-item-clicavel'))
    expect(itens).toHaveLength(1)
    expect(itens[0].textContent).toContain('Bruce Banner')

    await act(async () => { clicar(itens[0]) })
    expect(await p).toEqual({ modo: 'existente', tipo: 'personagem', id: 'p1' })
  })

  it('Personagem existente: termo sem match mostra "Nada encontrado"', async () => {
    await montar()
    await abrir()
    await act(async () => { clicar(botaoComTexto('Personagem')) })
    await act(async () => { clicar(botaoComTexto('Existente (nova transformação)')) })
    await digitar(inputBusca(), 'zzz')
    expect(container.textContent).toContain('Nada encontrado.')
  })

  it('Cenário existente: escolher devolve tipo "cenario"', async () => {
    await montar()
    const { p } = await abrir()
    await act(async () => { clicar(botaoComTexto('Cenário')) })
    await act(async () => { clicar(botaoComTexto('Existente (nova transformação)')) })
    await digitar(inputBusca(), 'taverna')
    const item = container.querySelector('.dialogo-lista-item-clicavel')
    await act(async () => { clicar(item) })
    expect(await p).toEqual({ modo: 'existente', tipo: 'cenario', id: 'c1' })
  })

  it('cancelar no passo "modo" devolve null', async () => {
    await montar()
    const { p } = await abrir()
    await act(async () => { clicar(botaoComTexto('Cenário')) })
    await act(async () => { clicar(botaoComTexto('Cancelar')) })
    expect(await p).toBeNull()
  })

  it('Voltar do passo "existente" retorna ao passo "modo"', async () => {
    await montar()
    await abrir()
    await act(async () => { clicar(botaoComTexto('Personagem')) })
    await act(async () => { clicar(botaoComTexto('Existente (nova transformação)')) })
    await act(async () => { clicar(botaoComTexto('Voltar')) })
    expect(container.textContent).toContain('criar novo ou já existente?')
  })

  it('Novo cenário: escolher "Dentro do cenário" nasce como subcenário — dir vira o do pai', async () => {
    await montar()
    const { p } = await abrir()
    await act(async () => { clicar(botaoComTexto('Cenário')) })
    await act(async () => { clicar(botaoComTexto('Criar novo')) })

    const buscaPai = container.querySelector<HTMLInputElement>('input[placeholder="Buscar cenário…"]')!
    await digitar(buscaPai, 'castelo')
    const radio = Array.from(container.querySelectorAll('.dialogo-lista-item')).find((el) => el.textContent?.includes('Castelo'))
    await act(async () => { clicar(radio!.querySelector('input[type="radio"]')) })

    expect(container.textContent).toContain('Nascerá como subcenário de "Castelo"')
    await act(async () => { clicar(botaoComTexto('Criar')) })
    expect(await p).toEqual({ modo: 'novo', tipo: 'cenario', dir: 'cenarios/castelo', novaPasta: undefined })
  })

  it('Novo cenário sem pai escolhido usa a pasta organizacional normalmente', async () => {
    await montar()
    const { p } = await abrir()
    await act(async () => { clicar(botaoComTexto('Cenário')) })
    await act(async () => { clicar(botaoComTexto('Criar novo')) })
    await act(async () => { clicar(botaoComTexto('Criar')) })
    expect(await p).toEqual({ modo: 'novo', tipo: 'cenario', dir: 'cenarios', novaPasta: undefined })
  })

  it('CRÍTICO: Cenário → Existente → Voltar → Voltar → Item não trava em branco (modo stale resetado)', async () => {
    // Regressão: "Voltar" do passo 'modo' fazia só setTipo(null), deixando `modo` velho
    // ('existente') vivo. tipo='item' + modo='existente' não bate NENHUM bloco JSX (item
    // sempre pula pro passo 'novo' — não existe passo 'existente' pra item) e o modal
    // renderizava em branco (soft-lock: nenhum botão pra sair).
    await montar()
    const { p } = await abrir()
    await act(async () => { clicar(botaoComTexto('Cenário')) })
    await act(async () => { clicar(botaoComTexto('Existente (nova transformação)')) })
    await act(async () => { clicar(botaoComTexto('Voltar')) }) // existente -> modo
    await act(async () => { clicar(botaoComTexto('Voltar')) }) // modo -> tipo
    await act(async () => { clicar(botaoComTexto('Item')) })

    expect(container.textContent).toContain('Onde criar o item?')
    expect(container.querySelector('.dialogo-caixa')?.children.length).toBeGreaterThan(0)

    await act(async () => { clicar(botaoComTexto('Cancelar')) })
    expect(await p).toBeNull()
  })

  it('MÉDIO: dir escolhido em Cenário não vaza pro fluxo de Personagem depois de Voltar duas vezes', async () => {
    // Regressão: "Voltar" não limpava dir/paiId/buscaPai/novaPasta/criandoPasta. dir de
    // Cenário sobrevivia à troca de tipo, e "Criar" ficava habilitado com o caminho de
    // OUTRA seção — a entidade nasceria na pasta errada do cofre.
    await montar()
    const { p } = await abrir()
    await act(async () => { clicar(botaoComTexto('Cenário')) })
    await act(async () => { clicar(botaoComTexto('Criar novo')) })

    // escolhe a pasta organizacional "Mundos" (cenarios/mundos) — não o "Dentro do
    // cenário" (subcenário), que é um campo à parte
    const radioMundos = Array.from(container.querySelectorAll('input[name="pasta-transformar"]'))
      .find((el) => el.closest('.dialogo-lista-item')?.textContent?.includes('Mundos'))
    await act(async () => { clicar(radioMundos ?? null) })
    expect(container.querySelectorAll<HTMLInputElement>('input[name="pasta-transformar"]:checked')[0]?.closest('.dialogo-lista-item')?.textContent)
      .toContain('Mundos')

    await act(async () => { clicar(botaoComTexto('Voltar')) }) // novo -> modo (reseta dir)
    await act(async () => { clicar(botaoComTexto('Voltar')) }) // modo -> tipo
    await act(async () => { clicar(botaoComTexto('Personagem')) })
    await act(async () => { clicar(botaoComTexto('Criar novo')) })

    // "Mundos" (pasta de CENÁRIO) não aparece nem escondido no passo de Personagem
    expect(container.textContent).not.toContain('Mundos')

    // dirAtual cai no default (raiz da seção de Personagem) — v1 já pré-seleciona a raiz
    // quando nada foi escolhido, então "Criar" fica habilitado; o que prova a correção é o
    // DIR resolvido, que tem que ser o default de Personagem, nunca o de Cenário
    await act(async () => { clicar(botaoComTexto('Criar')) })
    expect(await p).toEqual({ modo: 'novo', tipo: 'personagem', dir: 'personagens-soltos', novaPasta: undefined })
  })

  it('Escape fecha o diálogo com null', async () => {
    await montar()
    const { p } = await abrir()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(await p).toBeNull()
  })
})
