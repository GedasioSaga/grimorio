// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ItemNoCenario } from '../lib/types'
import { adicionarAoAcervo } from '../lib/acervoCenario'

// associarNaCriacao fica pendente até o teste resolver — é a janela onde o modal de
// campanhas ficaria aberto esperando o usuário, e onde a race do Fix 1 acontecia.
const h = vi.hoisted(() => ({
  resolverAssociar: null as null | (() => void),
  criarItemEm: vi.fn(),
  recarregarArvore: vi.fn(),
  carregarItens: vi.fn(),
  abrirItem: vi.fn(),
  estado: {} as Record<string, unknown>,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({ message: vi.fn() }))
vi.mock('../components/dialogoCampanhas', () => ({
  associarNaCriacao: vi.fn(() => new Promise<void>((res) => { h.resolverAssociar = res })),
}))
vi.mock('../state/store', () => ({
  useApp: Object.assign(
    (sel: (s: unknown) => unknown) => sel({ ...h.estado, abrirItem: h.abrirItem }),
    { getState: () => ({ ...h.estado, recarregarArvore: h.recarregarArvore, carregarItens: h.carregarItens }) },
  ),
}))

import { AcervoCenario } from '../components/AcervoCenario'

const tick = () => new Promise((r) => setTimeout(r, 0))
let container: HTMLDivElement
let root: Root

async function montar(acervo: ItemNoCenario[], onChange: (m: unknown) => void) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<AcervoCenario acervo={acervo} onChange={onChange as never} />)
  })
  await act(async () => { await tick() })
}

function digitar(input: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const clicar = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
const buscaInput = () => container.querySelector('.cenario-vincular input') as HTMLInputElement
const botaoCriar = () => container.querySelector('.acervo-criar') as HTMLButtonElement

beforeEach(() => {
  h.resolverAssociar = null
  h.criarItemEm.mockReset()
  h.recarregarArvore.mockReset()
  h.carregarItens.mockReset()
  h.abrirItem.mockReset()
  h.estado = {
    itens: { b: { id: 'b', nome: 'Escudo' } },
    repo: { criarItemEm: h.criarItemEm },
  }
})
afterEach(() => { root.unmount(); container.remove() })

describe('AcervoCenario: race em criarEVincular (Fix 1)', () => {
  it('onChange recebe um updater, não o array capturado no início do fluxo assíncrono', async () => {
    const onChange = vi.fn()
    await montar([{ itemId: 'b' }], onChange)

    await act(async () => { digitar(buscaInput(), 'Espada') })
    h.criarItemEm.mockReturnValue(new Promise((res) => { setTimeout(() => res({ id: 'nova' }), 0) }))
    await act(async () => { clicar(botaoCriar()) })
    await act(async () => { await tick() }) // repo.criarItemEm resolve; entra em associarNaCriacao (ainda pendente)

    expect(h.resolverAssociar, 'associarNaCriacao deve estar pendente aqui').toBeTruthy()
    expect(onChange).not.toHaveBeenCalled() // ainda não chegou no onChange

    // resolve o resto do fluxo (recarregarArvore/carregarItens são mocks síncronos)
    await act(async () => { h.resolverAssociar!() })
    await act(async () => { await tick() })

    expect(onChange).toHaveBeenCalledTimes(1)
    const mudanca = onChange.mock.calls[0][0]
    expect(typeof mudanca).toBe('function')

    // simula a edição concorrente que aconteceu durante a espera: o chip 'b' foi removido
    // do acervo fresco enquanto criarEVincular estava pendente
    const acervoConcorrente: ItemNoCenario[] = []
    const resultado = mudanca(acervoConcorrente)
    expect(resultado).toEqual(adicionarAoAcervo(acervoConcorrente, 'nova'))
    expect(resultado.some((a: ItemNoCenario) => a.itemId === 'b')).toBe(false) // 'b' não ressuscita
  })
})
