// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// Mesmo padrão de PainelSync.test.tsx: monta com react-dom/client + act, store mockado.
const h = vi.hoisted(() => ({
  tree: null as unknown,
  vaultPath: null as string | null,
  caminhoPorId: {} as Record<string, string>,
  caminhoItemPorId: {} as Record<string, string>,
  vinculos: [] as unknown[],
  campanhaFiltro: null as string | null,
  abrirPerfil: vi.fn(),
  abrirCenario: vi.fn(),
  abrirItem: vi.fn(),
  abrirDocumento: vi.fn(),
  setPaginaAtiva: vi.fn(),
}))
vi.mock('../state/store', () => ({
  useApp: (sel: (s: unknown) => unknown) => sel({
    tree: h.tree,
    vaultPath: h.vaultPath,
    caminhoPorId: h.caminhoPorId,
    caminhoItemPorId: h.caminhoItemPorId,
    vinculos: h.vinculos,
    campanhaFiltro: h.campanhaFiltro,
    abrirPerfil: h.abrirPerfil,
    abrirCenario: h.abrirCenario,
    abrirItem: h.abrirItem,
    abrirDocumento: h.abrirDocumento,
    setPaginaAtiva: h.setPaginaAtiva,
  }),
}))

import { HostBuscaGlobal, useBuscaGlobal } from '../components/BuscaGlobal'

let container: HTMLDivElement
let root: Root

async function montar() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<HostBuscaGlobal />)
  })
}

function pastaVazia(nome: string, caminho: string) {
  return { slug: nome.toLowerCase(), nome, caminho, personagens: [], subpastas: [] }
}

function arvoreComUmPersonagem() {
  return {
    campanhas: [],
    canvasesSoltos: [],
    mapasSoltos: [],
    personagensSoltos: {
      ...pastaVazia('raiz', 'personagens-soltos'),
      personagens: [{ slug: 'joao', nome: 'João Ferreira', caminho: 'personagens-soltos/joao.json', id: 'p1' }],
    },
    cenarios: { slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', cenarios: [], subpastas: [] },
    itens: { slug: 'itens', nome: 'Itens', caminho: 'itens', itens: [], subpastas: [] },
  }
}

const tecla = (alvo: EventTarget, key: string, extra: Partial<KeyboardEventInit> = {}) =>
  act(async () => {
    alvo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }))
  })

const texto = () => container.textContent ?? ''

/** Input controlado: mexer em .value direto não avisa o React — o setter nativo + evento avisa. */
async function digitar(input: HTMLInputElement, valor: string) {
  const setar = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setar.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  h.tree = null
  h.vaultPath = null
  h.caminhoPorId = {}
  h.caminhoItemPorId = {}
  h.vinculos = []
  h.campanhaFiltro = null
  vi.clearAllMocks()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  useBuscaGlobal.setState({ aberto: false })
})

describe('HostBuscaGlobal', () => {
  it('Ctrl+K abre a paleta de qualquer lugar da tela', async () => {
    await montar()
    expect(container.querySelector('.busca-global-caixa')).toBeNull()
    await tecla(window, 'k', { ctrlKey: true })
    expect(container.querySelector('.busca-global-caixa')).not.toBeNull()
  })

  it('Ctrl+K com o foco num campo de texto NÃO abre — não pode roubar o que está sendo digitado', async () => {
    await montar()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    await tecla(input, 'k', { ctrlKey: true })
    expect(container.querySelector('.busca-global-caixa')).toBeNull()
    input.remove()
  })

  it('Ctrl+K com o foco num editor TipTap (contentEditable) também não abre', async () => {
    await montar()
    const div = document.createElement('div')
    // jsdom não reflete a PROPRIEDADE contentEditable no atributo (nem isContentEditable
    // funciona lá) — setAttribute direto é o que replica o real e o que o componente lê
    div.setAttribute('contenteditable', 'true')
    document.body.appendChild(div)
    div.focus()
    await tecla(div, 'k', { ctrlKey: true })
    expect(container.querySelector('.busca-global-caixa')).toBeNull()
    div.remove()
  })

  it('cofre sem tree mostra mensagem, não lista vazia muda', async () => {
    h.tree = null
    await montar()
    await tecla(window, 'k', { ctrlKey: true })
    expect(texto()).toContain('Nenhum cofre aberto ainda.')
  })

  it('Escape fecha a paleta', async () => {
    h.tree = arvoreComUmPersonagem()
    await montar()
    await tecla(window, 'k', { ctrlKey: true })
    const inputBusca = container.querySelector<HTMLInputElement>('.busca-global-input')!
    await tecla(inputBusca, 'Escape')
    expect(container.querySelector('.busca-global-caixa')).toBeNull()
  })

  it('busca sem resultado mostra mensagem em português', async () => {
    h.tree = arvoreComUmPersonagem()
    await montar()
    await tecla(window, 'k', { ctrlKey: true })
    const inputBusca = container.querySelector<HTMLInputElement>('.busca-global-input')!
    await digitar(inputBusca, 'zzzznada')
    expect(texto()).toContain('Nada com')
  })

  it('digitar acha por pedaço do nome, e Enter abre o selecionado (mesma ação da sidebar)', async () => {
    h.tree = arvoreComUmPersonagem()
    await montar()
    await tecla(window, 'k', { ctrlKey: true })
    const inputBusca = container.querySelector<HTMLInputElement>('.busca-global-input')!
    // sem acento, minúsculo — "João Ferreira" precisa casar mesmo assim
    await digitar(inputBusca, 'joao')
    expect(texto()).toContain('João Ferreira')
    await tecla(inputBusca, 'Enter')
    expect(h.abrirPerfil).toHaveBeenCalledWith('p1')
    // abrir fecha a paleta, igual clicar um resultado fecharia qualquer modal de escolha
    expect(container.querySelector('.busca-global-caixa')).toBeNull()
  })

  it('ArrowDown move a seleção antes de confirmar com Enter', async () => {
    h.tree = {
      ...arvoreComUmPersonagem(),
      itens: {
        slug: 'itens', nome: 'Itens', caminho: 'itens', subpastas: [],
        itens: [{ slug: 'joao-espada', nome: 'Espada de João', caminho: 'itens/joao-espada.json', id: 'i1' }],
      },
    }
    await montar()
    await tecla(window, 'k', { ctrlKey: true })
    const inputBusca = container.querySelector<HTMLInputElement>('.busca-global-input')!
    await digitar(inputBusca, 'joao')
    await tecla(inputBusca, 'ArrowDown')
    await tecla(inputBusca, 'Enter')
    // "João Ferreira" (personagem) casa como prefixo e vem primeiro; ArrowDown desce pro item
    expect(h.abrirItem).toHaveBeenCalledWith('i1')
    expect(h.abrirPerfil).not.toHaveBeenCalled()
  })

  it('Ctrl+K de novo com a paleta já aberta (foco no próprio campo) fecha, e nunca vaza pro webview', async () => {
    h.tree = arvoreComUmPersonagem()
    await montar()
    await tecla(window, 'k', { ctrlKey: true })
    const inputBusca = container.querySelector<HTMLInputElement>('.busca-global-input')!
    const evento = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    let evitado = false
    await act(async () => {
      evitado = !inputBusca.dispatchEvent(evento) // dispatchEvent devolve false quando preventDefault foi chamado
    })
    expect(evitado).toBe(true)
    expect(container.querySelector('.busca-global-caixa')).toBeNull()
  })

  it('arquivo corrompido (.erro) aparece marcado, e Enter não abre nada nem fecha a paleta', async () => {
    h.tree = {
      ...arvoreComUmPersonagem(),
      cenarios: {
        slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', subpastas: [],
        cenarios: [{ id: '', slug: 'quebrado', nome: 'quebrado', caminho: 'cenarios/quebrado', filhos: [], erro: true }],
      },
    }
    await montar()
    await tecla(window, 'k', { ctrlKey: true })
    const inputBusca = container.querySelector<HTMLInputElement>('.busca-global-input')!
    await digitar(inputBusca, 'quebrado')
    // mesmo aviso visual da sidebar: classe de erro + ⚠ no nome
    const item = container.querySelector('.busca-global-item')!
    expect(item.className).toContain('quebrado')
    expect(item.textContent).toContain('⚠')
    await tecla(inputBusca, 'Enter')
    expect(h.abrirCenario).not.toHaveBeenCalled()
    // não fecha: fechar em silêncio, sem abrir nada, faria o usuário achar que sumiu do cofre
    expect(container.querySelector('.busca-global-caixa')).not.toBeNull()
  })

  it('com filtro de campanha ativo, resultado de OUTRA campanha some da lista e entra na contagem do rodapé', async () => {
    h.tree = {
      campanhas: [
        {
          id: 'c1', slug: 'c1', nome: 'Campanha 1', canvases: [], escritas: [], sessoes: [],
          personagens: [{ slug: 'castelao-1', nome: 'Castelão da Torre', caminho: 'campanhas/c1/personagens/castelao-1.json', id: 'p1' }],
        },
        {
          id: 'c2', slug: 'c2', nome: 'Campanha 2', canvases: [], escritas: [], sessoes: [],
          personagens: [{ slug: 'castelao-2', nome: 'Castelão do Fosso', caminho: 'campanhas/c2/personagens/castelao-2.json', id: 'p2' }],
        },
      ],
      canvasesSoltos: [], mapasSoltos: [],
      personagensSoltos: pastaVazia('raiz', 'personagens-soltos') as unknown as ReturnType<typeof arvoreComUmPersonagem>['personagensSoltos'],
      cenarios: { slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', cenarios: [], subpastas: [] },
      itens: { slug: 'itens', nome: 'Itens', caminho: 'itens', itens: [], subpastas: [] },
    }
    h.campanhaFiltro = 'c1'
    await montar()
    await tecla(window, 'k', { ctrlKey: true })
    const inputBusca = container.querySelector<HTMLInputElement>('.busca-global-input')!
    await digitar(inputBusca, 'castelao')
    expect(texto()).toContain('Castelão da Torre')
    expect(texto()).not.toContain('Castelão do Fosso')
    expect(texto()).toContain('1 resultado fora do filtro de campanha atual')
  })

  it('sem filtro de campanha, os dois resultados aparecem e não há rodapé', async () => {
    h.tree = {
      campanhas: [
        {
          id: 'c1', slug: 'c1', nome: 'Campanha 1', canvases: [], escritas: [], sessoes: [],
          personagens: [{ slug: 'castelao-1', nome: 'Castelão da Torre', caminho: 'campanhas/c1/personagens/castelao-1.json', id: 'p1' }],
        },
        {
          id: 'c2', slug: 'c2', nome: 'Campanha 2', canvases: [], escritas: [], sessoes: [],
          personagens: [{ slug: 'castelao-2', nome: 'Castelão do Fosso', caminho: 'campanhas/c2/personagens/castelao-2.json', id: 'p2' }],
        },
      ],
      canvasesSoltos: [], mapasSoltos: [],
      personagensSoltos: pastaVazia('raiz', 'personagens-soltos') as unknown as ReturnType<typeof arvoreComUmPersonagem>['personagensSoltos'],
      cenarios: { slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', cenarios: [], subpastas: [] },
      itens: { slug: 'itens', nome: 'Itens', caminho: 'itens', itens: [], subpastas: [] },
    }
    h.campanhaFiltro = null
    await montar()
    await tecla(window, 'k', { ctrlKey: true })
    const inputBusca = container.querySelector<HTMLInputElement>('.busca-global-input')!
    await digitar(inputBusca, 'castelao')
    expect(texto()).toContain('Castelão da Torre')
    expect(texto()).toContain('Castelão do Fosso')
    expect(container.querySelector('.busca-global-rodape')).toBeNull()
  })
})
