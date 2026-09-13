// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useApp } from '../state/store'
import { usePrefixoCenario } from '../state/prefixoCenario'
import type { CenarioNode, PastaCenarioNode } from '../lib/types'

// Sem @testing-library no projeto: monta com react-dom/client + act, como SidebarMapas.test.tsx.
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), message: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => p }))
vi.mock('../components/dialogos', () => ({ pedirTexto: vi.fn(), pedirEscolha: vi.fn() }))
vi.mock('../components/dialogoCampanhas', () => ({
  associarNaCriacao: vi.fn(async () => {}),
  editarCampanhas: vi.fn(async () => {}),
}))

import { CenariosSoltos } from '../components/CenariosSoltos'

let container: HTMLDivElement
let root: Root

function no(nome: string, filhos: CenarioNode[] = []): CenarioNode {
  const slug = nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return { id: slug, slug, nome, caminho: `cenarios/${slug}`, filhos }
}

/**
 * Cobre as três situações da regra: filho com prefixo do pai ("Castelo"), filho cujo
 * prefixo não é o pai ("Sala 3: a cozinha" debaixo de "Castelo") e cenário no topo de
 * uma pasta cujo nome coincide com o da pasta ("Pasta Goa: Vila") — pasta não é pai.
 */
function arvore(): PastaCenarioNode {
  return {
    slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios',
    subpastas: [{
      slug: 'pasta-goa', nome: 'Pasta Goa', caminho: 'cenarios/pasta-goa',
      subpastas: [], cenarios: [no('Pasta Goa: Vila')],
    }],
    cenarios: [
      no('Reino de Goa', [
        no('Reino de Goa: Castelo', [
          no('Reino de Goa: Castelo: Cozinha'),
          no('Sala 3: a cozinha'),
        ]),
      ]),
    ],
  }
}

async function montar() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<CenariosSoltos raiz={arvore()} aoMudar={async () => {}} />)
  })
}

function linhas(): { titulo: string; title: string }[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.rail-linha')).map((el) => ({
    titulo: el.querySelector('.rail-titulo')?.textContent ?? '',
    title: el.title,
  }))
}

function linhaComTitle(title: string): { titulo: string; title: string } {
  const l = linhas().find((x) => x.title === title)
  if (!l) throw new Error(`linha com title "${title}" não encontrada`)
  return l
}

beforeEach(() => {
  localStorage.clear()
  usePrefixoCenario.setState({ ocultar: true })
  useApp.setState({
    repo: null,
    cenarios: {},
    personagens: {},
    vaultPath: null,
    caminhoCenarioPorId: {},
  })
})

afterEach(() => {
  root.unmount()
  container.remove()
})

describe('CenariosSoltos: prefixo do pai na árvore', () => {
  it('ligado: corta só o prefixo que bate com o cenário-pai real, e o title fica completo', async () => {
    await montar()

    expect(linhaComTitle('Reino de Goa').titulo).toBe('Reino de Goa')
    expect(linhaComTitle('Reino de Goa: Castelo').titulo).toBe('Castelo')
    expect(linhaComTitle('Reino de Goa: Castelo: Cozinha').titulo).toBe('Cozinha')
    // dois-pontos do autor, não da convenção: o pai é "Reino de Goa: Castelo"
    expect(linhaComTitle('Sala 3: a cozinha').titulo).toBe('Sala 3: a cozinha')
    // pasta não é pai, mesmo com o nome coincidindo
    expect(linhaComTitle('Pasta Goa: Vila').titulo).toBe('Pasta Goa: Vila')
  })

  it('desligado: toda linha mostra o nome completo', async () => {
    usePrefixoCenario.setState({ ocultar: false })
    await montar()

    // a linha da pasta leva 📁 no rótulo, então a comparação título === title é só dos cenários
    const cenarios = linhas().filter((l) => !l.titulo.startsWith('📁'))
    expect(cenarios.length).toBe(5)
    for (const l of cenarios) expect(l.titulo).toBe(l.title)
    expect(linhaComTitle('Reino de Goa: Castelo').titulo).toBe('Reino de Goa: Castelo')
  })

  it('alternar pela store repinta a árvore e persiste a escolha', async () => {
    await montar()
    expect(linhaComTitle('Reino de Goa: Castelo').titulo).toBe('Castelo')

    await act(async () => { usePrefixoCenario.getState().alternar(false) })
    expect(linhaComTitle('Reino de Goa: Castelo').titulo).toBe('Reino de Goa: Castelo')
    expect(localStorage.getItem('grimorio.prefixoCenarioRail')).toBe('0')

    await act(async () => { usePrefixoCenario.getState().alternar(true) })
    expect(linhaComTitle('Reino de Goa: Castelo').titulo).toBe('Castelo')
    expect(localStorage.getItem('grimorio.prefixoCenarioRail')).toBe('1')
  })

  it('no modo busca (lista achatada) nada é cortado', async () => {
    await montar()
    const input = container.querySelector<HTMLInputElement>('.busca-input')
    if (!input) throw new Error('campo de busca não encontrado')

    // input controlado do React: o setter nativo + evento "input" é o que o onChange escuta
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (!setter) throw new Error('setter de value indisponível no jsdom')
    await act(async () => {
      setter.call(input, 'Castelo')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const achadas = linhas().filter((l) => l.title.includes('Castelo'))
    expect(achadas.length).toBeGreaterThan(0)
    for (const l of achadas) expect(l.titulo).toBe(l.title)
  })
})
