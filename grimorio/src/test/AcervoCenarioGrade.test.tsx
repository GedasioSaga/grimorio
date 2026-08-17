// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Item, ItemNoCenario } from '../lib/types'

const h = vi.hoisted(() => ({
  abrirItem: vi.fn(),
  estado: {} as Record<string, unknown>,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({ message: vi.fn() }))
vi.mock('../state/store', () => ({
  useApp: Object.assign(
    (sel: (s: unknown) => unknown) => sel({ ...h.estado, abrirItem: h.abrirItem }),
    { getState: () => ({ ...h.estado }) },
  ),
}))

import { AcervoCenario } from '../components/AcervoCenario'

let container: HTMLDivElement
let root: Root

async function montar(acervo: ItemNoCenario[], onChange: (m: unknown) => void = vi.fn()) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<AcervoCenario acervo={acervo} onChange={onChange as never} />)
  })
  return onChange
}

const clicar = (el: Element | null) => {
  if (!el) throw new Error('elemento não encontrado')
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}
const slots = () => container.querySelectorAll('.inventario-slot')

function item(id: string, nome: string, over: Partial<Item> = {}): Item {
  return {
    id, nome, resumo: '', retrato: null, descricao: '', informacao: '', efeito: '',
    criadoEm: '', modificadoEm: '', ...over,
  }
}

beforeEach(() => {
  h.abrirItem.mockReset()
  h.estado = { itens: {}, vaultPath: null, repo: null }
})
afterEach(() => { root.unmount(); container.remove() })

describe('AcervoCenario: grade de slots', () => {
  it('acervo vazio mostra o aviso, sem grade', async () => {
    await montar([])
    expect(slots()).toHaveLength(0)
    expect(container.querySelector('.galeria-vazia')?.textContent).toMatch(/nenhum item/i)
  })

  it('um slot por item vivo, com o nome visível', async () => {
    h.estado.itens = { a: item('a', 'Poção de Cura'), b: item('b', 'Espada Longa') }
    await montar([{ itemId: 'a' }, { itemId: 'b' }])
    expect(slots()).toHaveLength(2)
    expect(container.textContent).toContain('Poção de Cura')
    expect(container.textContent).toContain('Espada Longa')
  })

  it('item excluído do cache (acervoVivo) não vira slot órfão', async () => {
    h.estado.itens = { a: item('a', 'Sobrevivente') }
    await montar([{ itemId: 'a' }, { itemId: 'fantasma' }])
    expect(slots()).toHaveLength(1)
  })

  it('aguenta 30 itens na grade', async () => {
    const itens: Record<string, Item> = {}
    const acervo: ItemNoCenario[] = []
    for (let i = 0; i < 30; i++) {
      itens[`i${i}`] = item(`i${i}`, `Item ${i}`)
      acervo.push({ itemId: `i${i}` })
    }
    h.estado.itens = itens
    await montar(acervo)
    expect(slots()).toHaveLength(30)
  })

  it('qtd >= 2 mostra contador; item único (sem qtd) não mostra', async () => {
    h.estado.itens = { a: item('a', 'Flecha'), b: item('b', 'Escudo Único') }
    await montar([{ itemId: 'a', qtd: 12 }, { itemId: 'b' }])
    const [slotA, slotB] = Array.from(slots())
    expect(slotA.querySelector('.inventario-slot-qtd')?.textContent).toBe('12')
    expect(slotB.querySelector('.inventario-slot-qtd')).toBeNull()
  })

  it('sem retrato: cai no desenho vetorial (svg), nunca fica em branco', async () => {
    h.estado.itens = { a: item('a', 'Poção Misteriosa') }
    await montar([{ itemId: 'a' }])
    expect(slots()[0].querySelector('svg')).toBeTruthy()
    expect(slots()[0].querySelector('img')).toBeNull()
  })

  it('clicar na arte abre a ficha do item certo', async () => {
    h.estado.itens = { a: item('a', 'Chave Enferrujada') }
    await montar([{ itemId: 'a' }])
    clicar(slots()[0].querySelector('.inventario-slot-arte'))
    expect(h.abrirItem).toHaveBeenCalledWith('a')
  })

  it('botão "×" remove do acervo (não exclui o item)', async () => {
    h.estado.itens = { a: item('a', 'Tocha'), b: item('b', 'Livro') }
    const onChange = await montar([{ itemId: 'a' }, { itemId: 'b' }])
    clicar(slots()[0].querySelector('.inventario-slot-remover'))
    expect(onChange).toHaveBeenCalledWith([{ itemId: 'b' }])
  })

  it('botão "+" aumenta a quantidade a partir de item único', async () => {
    h.estado.itens = { a: item('a', 'Munição') }
    const onChange = await montar([{ itemId: 'a' }])
    const btns = slots()[0].querySelectorAll('.inventario-slot-btn')
    clicar(btns[1]) // ordem: [−, +, ×]
    expect(onChange).toHaveBeenCalledWith([{ itemId: 'a', qtd: 2 }])
  })

  it('botão "−" até 1 devolve item único (sem campo qtd)', async () => {
    h.estado.itens = { a: item('a', 'Ração') }
    const onChange = await montar([{ itemId: 'a', qtd: 2 }])
    const btns = slots()[0].querySelectorAll('.inventario-slot-btn')
    clicar(btns[0]) // −
    expect(onChange).toHaveBeenCalledWith([{ itemId: 'a' }])
  })

  it('nome comprido não quebra o slot (fica num único bloco truncável)', async () => {
    const nomeComprido = 'Um Item Com Nome Extraordinariamente Comprido Para Testar o Layout da Grade'
    h.estado.itens = { a: item('a', nomeComprido) }
    await montar([{ itemId: 'a' }])
    const nomeEl = slots()[0].querySelector('.inventario-slot-nome')
    expect(nomeEl?.textContent).toBe(nomeComprido)
    expect(nomeEl?.getAttribute('title')).toBe(nomeComprido)
  })
})
