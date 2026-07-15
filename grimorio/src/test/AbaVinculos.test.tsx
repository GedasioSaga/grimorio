// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Vinculo } from '../lib/types'

// Mock do store: entidades e vínculos controlados pelo teste, ações capturadas (sem Tauri).
const h = vi.hoisted(() => ({
  adicionarVinculo: vi.fn(),
  removerVinculo: vi.fn(),
  alternarParticipacao: vi.fn(),
  estado: {} as Record<string, unknown>,
}))
vi.mock('../state/store', () => ({
  useApp: (sel: (s: unknown) => unknown) => sel({
    ...h.estado,
    adicionarVinculo: h.adicionarVinculo,
    removerVinculo: h.removerVinculo,
    alternarParticipacao: h.alternarParticipacao,
  }),
}))

import { AbaVinculos } from '../components/AbaVinculos'

function v(parcial: Partial<Vinculo>): Vinculo {
  return {
    id: parcial.id ?? 'v1',
    deTipo: parcial.deTipo ?? 'personagem',
    deId: parcial.deId ?? 'a',
    paraTipo: parcial.paraTipo ?? 'personagem',
    paraId: parcial.paraId ?? 'b',
    tipo: parcial.tipo ?? 'conhece',
    notas: parcial.notas ?? '',
    criadoEm: parcial.criadoEm ?? '2026-07-15T00:00:00Z',
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))
let container: HTMLDivElement
let root: Root

async function montar() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<AbaVinculos entidadeTipo="personagem" entidadeId="a" />) })
  await act(async () => { await tick() })
}

// controlado pelo React: seta via native setter + evento input (mesmo truque do imagemViewRepro)
function digitar(input: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const clicar = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
const buscaInput = () => container.querySelector('.vinculo-form > input') as HTMLInputElement
const botaoAdicionar = () => container.querySelector('.vinculo-form-linha button') as HTMLButtonElement

async function selecionarAlvo(nome: string) {
  await act(async () => { digitar(buscaInput(), nome.slice(0, 3)) })
  const item = Array.from(container.querySelectorAll('.vinculo-busca-item'))
    .find((b) => b.textContent?.includes(nome))!
  expect(item, `candidato "${nome}" deve aparecer na busca`).toBeTruthy()
  await act(async () => { clicar(item) })
}

beforeEach(() => {
  h.adicionarVinculo.mockReset()
  h.removerVinculo.mockReset()
  h.alternarParticipacao.mockReset()
  h.estado = {
    vinculos: [],
    personagens: { a: { id: 'a', nome: 'Alice' }, b: { id: 'b', nome: 'Bruno' } },
    cenarios: { t: { id: 't', nome: 'Taverna' } },
    tree: { campanhas: [{ id: 'camp1', nome: 'Campanha 1' }] },
  }
})
afterEach(() => { root.unmount(); container.remove() })

describe('AbaVinculos', () => {
  it('renderiza relação nas duas direções', async () => {
    h.estado.vinculos = [
      v({ id: 'v1', deId: 'a', paraId: 'b', tipo: 'conhece' }), // a é o "de": tipo → nome
      v({ id: 'v2', deId: 'b', paraId: 'a', tipo: 'teme' }),    // a é o "para": nome → tipo
    ]
    await montar()
    const linhas = Array.from(container.querySelectorAll('.vinculo-texto')).map((el) => el.textContent)
    expect(linhas).toEqual(['conhece → Bruno', 'Bruno → teme'])
  })

  it('adicionar com sucesso limpa o form; duplicata mantém o form e avisa', async () => {
    await montar()

    h.adicionarVinculo.mockReturnValue(true)
    await selecionarAlvo('Bruno')
    await act(async () => { clicar(botaoAdicionar()) })
    expect(h.adicionarVinculo).toHaveBeenCalledWith({
      deTipo: 'personagem', deId: 'a',
      paraTipo: 'personagem', paraId: 'b',
      tipo: 'conhece', notas: '',
    })
    expect(buscaInput().value).toBe('')
    expect(container.querySelector('.vinculos-aviso')).toBeNull()

    h.adicionarVinculo.mockReturnValue(false)
    await selecionarAlvo('Bruno')
    await act(async () => { clicar(botaoAdicionar()) })
    expect(buscaInput().value).toBe('Bruno') // form não foi limpo
    expect(container.querySelector('.vinculos-aviso')?.textContent).toBe('Esse vínculo já existe.')
  })

  it('clicar num chip de campanha chama alternarParticipacao', async () => {
    await montar()
    const chip = container.querySelector('.campanha-chip') as HTMLButtonElement
    expect(chip.textContent).toBe('Campanha 1')
    await act(async () => { clicar(chip) })
    expect(h.alternarParticipacao).toHaveBeenCalledWith('personagem', 'a', 'camp1')
  })
})
