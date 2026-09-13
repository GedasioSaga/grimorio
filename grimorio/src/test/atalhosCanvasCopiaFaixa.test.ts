// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Editor } from 'tldraw'
import { useApp } from '../state/store'
import { useFaixaItensFoco } from '../state/faixaItensFoco'

vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), message: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => `asset://${p}` }))
vi.mock('../components/transformarImagemEmEntidade', () => ({ transformarImagemEmEntidade: vi.fn() }))
const copiar = vi.hoisted(() => vi.fn(async (_src: string) => {}))
vi.mock('../lib/copiarImagem', () => ({ copiarImagemParaClipboard: copiar }))

import { registrarAtalhos } from '../components/atalhosCanvas'

/**
 * Ctrl+C num card de cenário copia a imagem do cenário — exceto quando um item da faixa de
 * acervo DESTE card está em foco: aí a imagem é a do item. É o atalho que o usuário já usa
 * nos cards, estendido para a faixa.
 */
const CARD = {
  id: 'shape:goa',
  type: 'cenario-card',
  props: { cenarioId: 'goa' },
}

let container: HTMLDivElement
let cancelar: () => void
let selecionado: typeof CARD | null
let falhas: string[]

function apertarCtrlC(): KeyboardEvent {
  const evento = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true })
  container.dispatchEvent(evento)
  return evento
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  selecionado = CARD
  copiar.mockClear()
  useFaixaItensFoco.setState({ foco: null })
  useApp.setState({
    vaultPath: 'C:/Cofre',
    personagens: {},
    cenarios: {
      goa: { versaoAtivaId: 'v1', versoes: [{ id: 'v1', retrato: 'imagens-cenarios/goa.png' }] },
    },
    itens: {
      espada: { id: 'espada', retrato: 'imagens-itens/espada.png' },
      barra: { id: 'barra', retrato: null },
    },
  } as unknown as Partial<ReturnType<typeof useApp.getState>>)
  falhas = []
  const editor = {
    getContainer: () => container,
    getEditingShapeId: () => null,
    getOnlySelectedShape: () => selecionado,
  } as unknown as Editor
  cancelar = registrarAtalhos(editor, {
    aoCopiar() {},
    aoFalharCopia(erro) {
      falhas.push(erro)
    },
  })
})

afterEach(() => {
  cancelar()
  container.remove()
})

describe('Ctrl+C com a faixa de itens', () => {
  it('sem item em foco copia a imagem do cenário', () => {
    apertarCtrlC()
    expect(copiar).toHaveBeenCalledWith('asset://C:/Cofre/imagens-cenarios/goa.png')
  })

  it('com item em foco neste card copia a imagem do item', () => {
    useFaixaItensFoco.getState().focar({ shapeId: CARD.id, itemId: 'espada' })
    apertarCtrlC()
    expect(copiar).toHaveBeenCalledWith('asset://C:/Cofre/imagens-itens/espada.png')
  })

  it('item em foco sem imagem avisa e NÃO deixa o tldraw copiar o card do cenário', () => {
    useFaixaItensFoco.getState().focar({ shapeId: CARD.id, itemId: 'barra' })
    const evento = apertarCtrlC()
    expect(copiar).not.toHaveBeenCalled()
    expect(evento.defaultPrevented).toBe(true)
    expect(falhas).toEqual(['item sem imagem'])
  })

  it('foco de OUTRO card não vale: copia o cenário selecionado', () => {
    useFaixaItensFoco.getState().focar({ shapeId: 'shape:outro', itemId: 'espada' })
    apertarCtrlC()
    expect(copiar).toHaveBeenCalledWith('asset://C:/Cofre/imagens-cenarios/goa.png')
  })
})
