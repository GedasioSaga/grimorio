// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { NotebookRepo } from '../lib/notebookRepo'
import type { PaginaNode } from '../lib/types'

// Mock do store: captura setPaginaAtiva e controla a página ativa, sem tocar Tauri.
const h = vi.hoisted(() => ({
  setPaginaAtiva: vi.fn(),
  ativa: {} as Record<string, string | null>,
}))
vi.mock('../state/store', () => ({
  useApp: (sel: (s: unknown) => unknown) =>
    sel({ paginaAtivaPorCaderno: h.ativa, setPaginaAtiva: h.setPaginaAtiva }),
}))

import { PaginasChips } from '../components/PaginasChips'

function no(slug: string, titulo: string, filhos: PaginaNode[] = [], erro?: boolean): PaginaNode {
  return { slug, id: slug, titulo, paiId: null, ordem: 0, erro, filhos }
}
function repoFake(arvore: PaginaNode[]): NotebookRepo {
  return { inicializar: async () => {}, montarArvore: async () => arvore } as unknown as NotebookRepo
}

const DIR = 'campanhas/x/notas'
const tick = () => new Promise((r) => setTimeout(r, 0))
let container: HTMLDivElement
let root: Root

async function montar(arvore: PaginaNode[]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<PaginasChips repo={repoFake(arvore)} cadernoDirRel={DIR} />) })
  await act(async () => { await tick() })
}
const chips = () => Array.from(container.querySelectorAll('.rail-chip')) as HTMLButtonElement[]

beforeEach(() => { h.setPaginaAtiva.mockClear(); h.ativa = {} })
afterEach(() => { root.unmount(); container.remove() })

describe('PaginasChips', () => {
  it('renderiza um chip por página, em lista plana (pré-ordem)', async () => {
    await montar([no('a', 'A', [no('a1', 'A1')]), no('b', 'B')])
    expect(chips().map((c) => c.textContent)).toEqual(['A', 'A1', 'B'])
  })

  it('clicar num chip chama setPaginaAtiva(cadernoDirRel, slug)', async () => {
    await montar([no('a', 'A'), no('b', 'B')])
    const chipB = chips().find((c) => c.textContent === 'B')!
    await act(async () => { chipB.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(h.setPaginaAtiva).toHaveBeenCalledWith(DIR, 'b')
  })

  it('chip da página ativa recebe classe .ativa', async () => {
    h.ativa = { [DIR]: 'b' }
    await montar([no('a', 'A'), no('b', 'B')])
    const chipB = chips().find((c) => c.textContent === 'B')!
    expect(chipB.classList.contains('ativa')).toBe(true)
  })

  it('página com erro fica desabilitada e não navega', async () => {
    await montar([no('x', 'X', [], true)])
    const chip = chips()[0]
    expect(chip.disabled).toBe(true)
    await act(async () => { chip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(h.setPaginaAtiva).not.toHaveBeenCalled()
  })

  it('sem páginas não renderiza a faixa de chips', async () => {
    await montar([])
    expect(container.querySelector('.rail-chips')).toBeNull()
  })
})
