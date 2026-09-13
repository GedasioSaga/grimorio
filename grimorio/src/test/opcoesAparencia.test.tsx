// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * Portão do controle da aba Aparência (`Opcoes.tsx`, `SeletorPrefixoCenario`).
 *
 * Antes disto o componente não tinha teste nenhum: um `checked={!ocultar}` (caixa invertida)
 * ou um `onChange` ligado na store errada passava `tsc` e `vitest` sem um vermelho. A store
 * e a árvore têm portão; o único lugar onde o usuário encosta na opção, não tinha.
 *
 * Os irmãos de aba são substituídos por componentes vazios de propósito: todos falam com o
 * Tauri no nível do módulo e não têm nada a ver com o que se julga aqui.
 */
vi.mock('../components/OpcoesCofre', () => ({ OpcoesCofre: () => null }))
vi.mock('../components/OpcoesNuvem', () => ({ OpcoesNuvem: () => null }))
vi.mock('../components/OpcoesIA', () => ({ OpcoesIA: () => null }))
vi.mock('../components/OpcoesLixeira', () => ({ OpcoesLixeira: () => null }))
vi.mock('../components/SeletorTema', () => ({ SeletorTema: () => null }))

import { HostOpcoes, useOpcoes } from '../components/Opcoes'
import { usePrefixoCenario } from '../state/prefixoCenario'
import { useMiniaturas } from '../state/miniaturas'

const CHAVE_PREFIXO = 'grimorio.prefixoCenarioRail'
const CHAVE_MINIATURAS = 'grimorio.miniaturasRail'
const ROTULO = 'Encurtar nome de sub-cenário'

let container: HTMLDivElement
let root: Root

async function montar() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<HostOpcoes />)
  })
}

/** Acha a caixa pelo texto que o usuário lê — falha alto se o rótulo sumir ou mudar. */
function caixaDe(texto: string): HTMLInputElement {
  const rotulos = Array.from(container.querySelectorAll<HTMLLabelElement>('.opcoes-alternador'))
  const alvo = rotulos.find((l) => (l.textContent ?? '').includes(texto))
  if (!alvo) throw new Error(`nenhum alternador com o texto "${texto}" na aba Aparência`)
  const caixa = alvo.querySelector<HTMLInputElement>('input[type="checkbox"]')
  if (!caixa) throw new Error(`o alternador "${texto}" não tem caixa de marcar`)
  return caixa
}

beforeEach(() => {
  localStorage.clear()
  usePrefixoCenario.setState({ ocultar: true })
  useMiniaturas.setState({ ligadas: true })
  useOpcoes.setState({ aberto: true, aba: 'aparencia' })
})

afterEach(() => {
  root.unmount()
  container.remove()
  useOpcoes.setState({ aberto: false, aba: 'cofre' })
})

describe('Opções › Aparência › encurtar nome de sub-cenário', () => {
  it('a caixa marcada significa opção ligada', async () => {
    await montar()
    expect(caixaDe(ROTULO).checked).toBe(true)
  })

  it('a caixa desmarcada significa opção desligada', async () => {
    usePrefixoCenario.setState({ ocultar: false })
    await montar()
    expect(caixaDe(ROTULO).checked).toBe(false)
  })

  it('clicar desliga a opção, e o disco acompanha', async () => {
    await montar()
    await act(async () => {
      caixaDe(ROTULO).click()
    })

    expect(usePrefixoCenario.getState().ocultar).toBe(false)
    expect(localStorage.getItem(CHAVE_PREFIXO)).toBe('0')
    expect(caixaDe(ROTULO).checked).toBe(false)
  })

  it('clicar de novo religa', async () => {
    usePrefixoCenario.setState({ ocultar: false })
    await montar()
    await act(async () => {
      caixaDe(ROTULO).click()
    })

    expect(usePrefixoCenario.getState().ocultar).toBe(true)
    expect(localStorage.getItem(CHAVE_PREFIXO)).toBe('1')
    expect(caixaDe(ROTULO).checked).toBe(true)
  })

  /** Duas caixas vizinhas na mesma seção: trocar o fio de uma pela outra é erro silencioso. */
  it('mexer nesta opção não encosta na das miniaturas', async () => {
    await montar()
    await act(async () => {
      caixaDe(ROTULO).click()
    })

    expect(useMiniaturas.getState().ligadas).toBe(true)
    expect(localStorage.getItem(CHAVE_MINIATURAS)).toBeNull()
    expect(caixaDe('Mostrar miniatura da imagem').checked).toBe(true)
  })
})
