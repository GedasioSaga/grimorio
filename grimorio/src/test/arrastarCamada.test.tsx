// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PainelCamadas } from '../components/PainelCamadas'
import { criarHandlersDeDrop } from '../components/dropsDeEntidade'
import type { CamadaMapa } from '../lib/types'
import type { LadoSolto } from '../lib/camadasMapa'

/**
 * Fiação do arrasto de camada. A matemática de reordenar é testada pura em
 * `camadasMapa.test.ts`; aqui se prova o que só o componente sabe:
 * - metade de cima da linha solta ANTES dela, metade de baixo solta DEPOIS;
 * - o id que viaja no `dataTransfer` é o da camada arrastada, não o da alvo;
 * - arrasto de fora (imagem, ficha) não é confundido com arrasto de camada.
 *
 * O MIME próprio é o que mantém os dois mundos separados: o `.mapa-wrap` inteiro tem
 * handlers de drop em fase de captura (`dropsDeEntidade.tsx`) e eles decidem pelo MIME.
 */

const MIME_CAMADA = 'application/x-grimorio-camada'

const CAMADAS: CamadaMapa[] = [
  { id: 'fundo', nome: 'Planta', oculta: false, travada: false },
  { id: 'topo', nome: 'Notas', oculta: false, travada: false },
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** `DataTransfer` não existe em jsdom; o painel só usa `types`/`getData`/`setData`. */
function dataTransferFalso(dados: Record<string, string> = {}) {
  return {
    types: Object.keys(dados),
    getData: (tipo: string) => dados[tipo] ?? '',
    setData: (tipo: string, valor: string) => {
      dados[tipo] = valor
    },
    effectAllowed: 'none',
    dropEffect: 'none',
  }
}

function disparar(alvo: Element, nome: string, dataTransfer: unknown, clientY: number) {
  const evento = new Event(nome, { bubbles: true, cancelable: true })
  Object.defineProperty(evento, 'dataTransfer', { value: dataTransfer })
  Object.defineProperty(evento, 'clientY', { value: clientY })
  act(() => {
    alvo.dispatchEvent(evento)
  })
  return evento
}

function montar(aoSoltarCamada: (a: string, b: string, lado: LadoSolto) => void) {
  act(() =>
    root.render(
      <div className="mapa-coluna-esq">
        <PainelCamadas
          camadas={CAMADAS}
          ativaId="topo"
          temSelecao={false}
          camadasDaSelecao={[]}
          contagemPorCamada={{ fundo: 3, topo: 0 }}
          aoSelecionarAtiva={() => {}}
          aoCriar={() => {}}
          aoRenomear={() => {}}
          aoExcluir={() => {}}
          aoAlternarOculta={() => {}}
          aoAlternarTravada={() => {}}
          aoMover={() => {}}
          aoSoltarCamada={aoSoltarCamada}
          aoMoverSelecaoPara={() => {}}
        />
      </div>,
    ),
  )
  // a lista é desenhada INVERTIDA: a primeira linha é a camada da FRENTE ("topo")
  const linhas = [...container.querySelectorAll('li.painel-camadas-item')]
  // jsdom devolve zeros em getBoundingClientRect: sem uma caixa de verdade, não há
  // "metade de cima" para o componente medir.
  for (const li of linhas) {
    li.getBoundingClientRect = () => ({ top: 100, height: 40, bottom: 140, left: 0, right: 0, width: 200, x: 0, y: 100, toJSON: () => ({}) })
  }
  return linhas
}

describe('arrastar camada no painel', () => {
  it('soltar na metade de CIMA da linha alvo entra ANTES dela', () => {
    const aoSoltar = vi.fn()
    const [primeira] = montar(aoSoltar)

    disparar(primeira, 'drop', dataTransferFalso({ [MIME_CAMADA]: 'fundo' }), 110)

    expect(aoSoltar).toHaveBeenCalledWith('fundo', 'topo', 'antes')
  })

  it('soltar na metade de BAIXO da linha alvo entra DEPOIS dela', () => {
    const aoSoltar = vi.fn()
    const [primeira] = montar(aoSoltar)

    disparar(primeira, 'drop', dataTransferFalso({ [MIME_CAMADA]: 'fundo' }), 135)

    expect(aoSoltar).toHaveBeenCalledWith('fundo', 'topo', 'depois')
  })

  it('a linha ALVO é a que recebeu o evento, não a arrastada', () => {
    const aoSoltar = vi.fn()
    const [, segunda] = montar(aoSoltar)

    disparar(segunda, 'drop', dataTransferFalso({ [MIME_CAMADA]: 'topo' }), 110)

    expect(aoSoltar).toHaveBeenCalledWith('topo', 'fundo', 'antes')
  })

  it('arrasto de fora (sem o MIME de camada) é ignorado pelo painel', () => {
    const aoSoltar = vi.fn()
    const [primeira] = montar(aoSoltar)

    const evento = disparar(primeira, 'drop', dataTransferFalso({ 'text/plain': 'qualquer coisa' }), 110)

    expect(aoSoltar).not.toHaveBeenCalled()
    // não engoliu o evento: quem estiver acima na árvore continua podendo tratá-lo
    expect(evento.defaultPrevented).toBe(false)
  })

  it('dragover do NOSSO arrasto marca a linha como alvo de solta', () => {
    const [primeira] = montar(vi.fn())

    disparar(primeira, 'dragover', dataTransferFalso({ [MIME_CAMADA]: 'fundo' }), 110)

    expect(primeira.className).toContain('solta-antes')
  })

  it('dragover de fora não marca nada', () => {
    const [primeira] = montar(vi.fn())

    disparar(primeira, 'dragover', dataTransferFalso({ 'text/uri-list': 'http://x' }), 110)

    expect(primeira.className).not.toContain('solta-')
  })
})

/**
 * O outro lado do contrato: os handlers do mapa precisam DEIXAR PASSAR o arrasto de camada.
 * Eles rodam em fase de captura no `.mapa-wrap`, que é ancestral do painel — se engolissem
 * o evento pelo caminho, o arrasto do painel nunca chegaria ao destino.
 */
describe('o mapa ignora o arrasto de camada', () => {
  function eventoFalso(tipos: string[]) {
    return {
      dataTransfer: { types: tipos, getData: () => '' },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }
  }

  it('aoArrastarSobre não intercepta o MIME de camada', () => {
    const { aoArrastarSobre } = criarHandlersDeDrop({ current: null }, null)
    const e = eventoFalso([MIME_CAMADA])

    aoArrastarSobre(e as unknown as React.DragEvent)

    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(e.stopPropagation).not.toHaveBeenCalled()
  })

  it('aoSoltar não intercepta o MIME de camada', () => {
    const { aoSoltar } = criarHandlersDeDrop({ current: null }, null)
    const e = eventoFalso([MIME_CAMADA])

    aoSoltar(e as unknown as React.DragEvent)

    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})
