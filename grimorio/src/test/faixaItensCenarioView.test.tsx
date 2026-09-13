// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { TLShapeId } from 'tldraw'
import { useApp } from '../state/store'
import { useFaixaItensFoco } from '../state/faixaItensFoco'
import type { Item, ItemNoCenario } from '../lib/types'

// Sem @testing-library no projeto: monta com react-dom/client + act, como prefixoCenarioRail.test.tsx.
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), message: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => `asset://${p}` }))
const copiar = vi.hoisted(() => vi.fn(async (_src: string) => {}))
vi.mock('../lib/copiarImagem', () => ({ copiarImagemParaClipboard: copiar }))

/** Editor falso: a faixa só usa `select` e a seleção atual, lida por `useValue`. */
const editor = vi.hoisted(() => ({ selecionados: [] as string[], select: vi.fn() }))
vi.mock('tldraw', () => ({
  useEditor: () => ({ select: editor.select, getSelectedShapeIds: () => editor.selecionados }),
  useValue: (_nome: string, fn: () => unknown) => fn(),
}))

import { FaixaItensCenario, rotuloDoItemNaFaixa } from '../components/FaixaItensCenario'

const SHAPE = 'shape:card-goa' as TLShapeId

function item(id: string, extra: Partial<Item> = {}): Item {
  return {
    id, nome: id, resumo: '', retrato: null, descricao: '', informacao: '', efeito: '',
    criadoEm: '2026-09-13T00:00:00Z', modificadoEm: '2026-09-13T00:00:00Z', ...extra,
  }
}

let container: HTMLDivElement
let root: Root
let abrirItem: ReturnType<typeof vi.fn>

function montar(acervo: ItemNoCenario[]) {
  act(() => root.render(<FaixaItensCenario shapeId={SHAPE} acervo={acervo} lado="baixo" />))
}

const slots = () => [...container.querySelectorAll<HTMLDivElement>('.faixa-item')]
const arte = (i: number) => slots()[i]!.querySelector<HTMLButtonElement>('.faixa-item-arte')!
const botaoCopiar = (i: number) => slots()[i]!.querySelector<HTMLButtonElement>('.faixa-item-copiar')!

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  abrirItem = vi.fn()
  editor.selecionados = []
  editor.select.mockClear()
  copiar.mockClear()
  useFaixaItensFoco.setState({ foco: null })
  useApp.setState({
    vaultPath: 'C:/Cofre',
    abrirItem,
    itens: {
      espada: item('espada', { nome: 'Espada', resumo: 'Lâmina curta', retrato: 'imagens-itens/espada.png' }),
      barra: item('barra', { nome: 'Barra de ferro' }),
    },
  } as Partial<ReturnType<typeof useApp.getState>>)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('FaixaItensCenario', () => {
  it('mostra só itens que ainda existem, na ordem do acervo', () => {
    montar([{ itemId: 'barra' }, { itemId: 'apagado' }, { itemId: 'espada', qtd: 3 }])
    expect(slots().map((s) => s.title)).toEqual(['Barra de ferro', 'Espada · 3× · Lâmina curta'])
  })

  it('acervo vazio mostra o aviso em vez de slots', () => {
    montar([])
    expect(slots()).toHaveLength(0)
    expect(container.textContent).toContain('Sem itens no acervo')
  })

  it('contador só aparece com quantidade 2 ou mais', () => {
    montar([{ itemId: 'espada', qtd: 3 }, { itemId: 'barra' }])
    expect(slots()[0]!.querySelector('.faixa-item-qtd')?.textContent).toBe('3')
    expect(slots()[1]!.querySelector('.faixa-item-qtd')).toBeNull()
  })

  it('duplo clique abre a ficha do item', () => {
    montar([{ itemId: 'espada' }])
    act(() => arte(0).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(abrirItem).toHaveBeenCalledWith('espada')
  })

  it('clique seleciona o card e põe o item em foco', () => {
    montar([{ itemId: 'espada' }, { itemId: 'barra' }])
    editor.selecionados = [SHAPE]
    act(() => arte(1).click())
    expect(editor.select).toHaveBeenCalledWith(SHAPE)
    expect(useFaixaItensFoco.getState().foco).toEqual({ shapeId: SHAPE, itemId: 'barra' })
    expect(slots()[1]!.className).toContain('faixa-item-foco')
  })

  it('o foco some quando o card deixa de estar selecionado', () => {
    montar([{ itemId: 'espada' }])
    editor.selecionados = [SHAPE]
    act(() => arte(0).click())
    editor.selecionados = []
    montar([{ itemId: 'espada' }])
    expect(useFaixaItensFoco.getState().foco).toBeNull()
  })

  it('o foco some quando o item sai da faixa com o card ainda selecionado (troca de versão, tirado do acervo)', () => {
    montar([{ itemId: 'espada' }, { itemId: 'barra' }])
    editor.selecionados = [SHAPE]
    act(() => arte(0).click())
    montar([{ itemId: 'barra' }])
    expect(useFaixaItensFoco.getState().foco).toBeNull()
  })

  it('esconder a faixa (desmontar) limpa o foco dela', () => {
    montar([{ itemId: 'espada' }])
    editor.selecionados = [SHAPE]
    act(() => arte(0).click())
    act(() => root.render(<></>))
    expect(useFaixaItensFoco.getState().foco).toBeNull()
  })

  it('📋 copia a imagem do item e avisa no próprio slot', async () => {
    montar([{ itemId: 'espada' }])
    await act(async () => botaoCopiar(0).click())
    expect(copiar).toHaveBeenCalledTimes(1)
    expect(copiar.mock.calls[0]![0]).toContain('asset://C:/Cofre/imagens-itens/espada.png')
    expect(slots()[0]!.querySelector('[role="status"]')?.textContent).toBe('Copiado')
  })

  it('📋 fica desabilitado em item sem imagem', () => {
    montar([{ itemId: 'barra' }])
    expect(botaoCopiar(0).disabled).toBe(true)
    expect(botaoCopiar(0).title).toBe('Item sem imagem')
  })

  it('falha ao copiar aparece no slot, não some em silêncio', async () => {
    copiar.mockRejectedValueOnce(new Error('clipboard negado'))
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    montar([{ itemId: 'espada' }])
    await act(async () => botaoCopiar(0).click())
    expect(slots()[0]!.querySelector('[role="status"]')?.textContent).toBe('Falhou')
    erro.mockRestore()
  })
})

describe('rotuloDoItemNaFaixa', () => {
  it('junta nome, quantidade e resumo, pulando o que está vazio', () => {
    expect(rotuloDoItemNaFaixa({ nome: 'Espada', resumo: '  ' }, 1)).toBe('Espada')
    expect(rotuloDoItemNaFaixa({ nome: 'Espada', resumo: 'Curta' }, undefined)).toBe('Espada · Curta')
    expect(rotuloDoItemNaFaixa({ nome: 'Flecha', resumo: '' }, 20)).toBe('Flecha · 20×')
  })
})
