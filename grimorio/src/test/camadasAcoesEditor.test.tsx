// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createShapeId, type Editor, type TLShapeId } from 'tldraw'
import { criarEditorDeTeste } from './ajudaEditorMapa'
import { contagemPorCamada, useCamadasMapa, type CamadasMapa } from '../lib/camadasMapaEditor'
import type { CamadaMapa } from '../lib/types'
import { VERSAO_CAMADAS } from '../lib/camadasMapa'

/**
 * As AÇÕES de camada, exercitadas contra um editor de verdade.
 *
 * O que se prova aqui é o que a suíte não media antes e que derrubou a primeira versão desta
 * leva: o caminho com peça TRAVADA. O cadeado do próprio `PainelCamadas` trava todos os
 * shapes da camada, e `editor.updateShapes` descarta em silêncio qualquer update sobre shape
 * travado — então era o próprio subsistema de camadas que se desligava.
 *
 * `useCamadasMapa` é hook, então precisa de React montado; mas não precisa do `<Tldraw>`
 * (que não sobe em jsdom): o hook só toca no editor através do `editorRef`.
 */

const CAMADAS: CamadaMapa[] = [
  { id: 'base', nome: 'Planta', oculta: false, travada: false },
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

/** Monta o hook e devolve o objeto vivo, sempre com o último valor renderizado. */
function montarCamadas(editor: Editor, camadas: CamadaMapa[] = CAMADAS) {
  const caixa: { atual: CamadasMapa } = { atual: null as unknown as CamadasMapa }
  function Sonda() {
    caixa.atual = useCamadasMapa({ current: editor })
    return null
  }
  act(() => root.render(<Sonda />))
  act(() => caixa.atual.carregarCamadas(camadas, VERSAO_CAMADAS))
  return caixa
}

function criarPeca(editor: Editor, tipo: string, camada: string, apelido: string): TLShapeId {
  const id = createShapeId()
  editor.createShape({ id, type: tipo, x: 0, y: 0, meta: { camada, apelido } } as Parameters<
    typeof editor.createShape
  >[0])
  return id
}

describe('mover a seleção de camada', () => {
  it('carimba a camada nova e reposiciona a peça na pilha', () => {
    const editor = criarEditorDeTeste()
    const camadas = montarCamadas(editor)
    const sala = criarPeca(editor, 'sala-mapa', 'base', 'sala')
    const porta = criarPeca(editor, 'porta-mapa', 'base', 'porta')

    editor.setSelectedShapes([sala])
    act(() => camadas.atual.acoesDoPainel.aoMoverSelecaoPara('topo'))

    expect(editor.getShape(sala)!.meta.camada).toBe('topo')
    // camada manda: a sala do topo passa a ser desenhada ACIMA da porta da base
    const ordem = editor.getCurrentPageShapes().sort((a, b) => (a.index < b.index ? -1 : 1))
    expect(ordem.indexOf(editor.getShape(sala)!)).toBeGreaterThan(ordem.indexOf(editor.getShape(porta)!))
  })

  /**
   * A troca de camada É edição do usuário, então entra no histórico — mas a reordenação que
   * vem junto ficava fora dele. Um Ctrl+Z devolvia a camada antiga e deixava o `index` da
   * camada nova: a peça ficava desenhada na altura errada, e só voltava ao lugar na próxima
   * ação de painel. Undo tem que desfazer as duas metades ou nenhuma.
   */
  it('um desfazer devolve camada E altura juntas', () => {
    const editor = criarEditorDeTeste()
    const camadas = montarCamadas(editor)
    const sala = criarPeca(editor, 'sala-mapa', 'base', 'sala')
    const porta = criarPeca(editor, 'porta-mapa', 'base', 'porta')
    const alturaDe = (id: TLShapeId) =>
      editor
        .getCurrentPageShapes()
        .sort((a, b) => (a.index < b.index ? -1 : 1))
        .findIndex((s) => s.id === id)
    const alturaAntes = alturaDe(sala)
    // separa o desenho das peças do gesto que vamos desfazer, como numa sessão de verdade
    editor.markHistoryStoppingPoint('peças desenhadas')

    editor.setSelectedShapes([sala])
    act(() => camadas.atual.acoesDoPainel.aoMoverSelecaoPara('topo'))
    expect(alturaDe(sala)).toBeGreaterThan(alturaDe(porta))

    editor.undo()

    expect(editor.getShape(sala)!.meta.camada).toBe('base')
    expect(alturaDe(sala)).toBe(alturaAntes)
  })

  it('grupo selecionado leva os FILHOS junto, não só o grupo', () => {
    const editor = criarEditorDeTeste()
    const camadas = montarCamadas(editor)
    const a = criarPeca(editor, 'sala-mapa', 'base', 'a')
    const b = criarPeca(editor, 'sala-mapa', 'base', 'b')
    editor.setSelectedShapes([a, b])
    editor.groupShapes([a, b])

    act(() => camadas.atual.acoesDoPainel.aoMoverSelecaoPara('topo'))

    expect(editor.getShape(a)!.meta.camada).toBe('topo')
    expect(editor.getShape(b)!.meta.camada).toBe('topo')
  })

  /**
   * `getShapeVisibility` roda por shape e lê a `meta` do FILHO. Se só o grupo trocasse de
   * camada, esconder a camada de destino não esconderia nada e esconder a de origem apagaria
   * o conteúdo de um grupo que "está" na outra.
   */
  it('esconder a camada de destino esconde o conteúdo do grupo movido', () => {
    const editor = criarEditorDeTeste()
    const camadas = montarCamadas(editor)
    const a = criarPeca(editor, 'sala-mapa', 'base', 'a')
    const b = criarPeca(editor, 'sala-mapa', 'base', 'b')
    editor.setSelectedShapes([a, b])
    editor.groupShapes([a, b])
    act(() => camadas.atual.acoesDoPainel.aoMoverSelecaoPara('topo'))

    act(() => camadas.atual.acoesDoPainel.aoAlternarOculta('topo'))

    const visibilidade = camadas.atual.getShapeVisibility!
    expect(visibilidade(editor.getShape(a)!, editor)).toBe('hidden')
    expect(visibilidade(editor.getShape(b)!, editor)).toBe('hidden')
  })

  it('peça travada PELA CAMADA de origem consegue sair dela e é destravada no destino livre', () => {
    const editor = criarEditorDeTeste()
    const camadas = montarCamadas(editor)
    const sala = criarPeca(editor, 'sala-mapa', 'base', 'sala')
    act(() => camadas.atual.acoesDoPainel.aoAlternarTravada('base'))
    expect(editor.getShape(sala)!.isLocked).toBe(true)

    editor.setSelectedShapes([sala])
    act(() => camadas.atual.acoesDoPainel.aoMoverSelecaoPara('topo'))

    expect(editor.getShape(sala)!.meta.camada).toBe('topo')
    expect(editor.getShape(sala)!.isLocked).toBe(false)
  })

  it('mover para camada TRAVADA leva a peça travada e marcada', () => {
    const editor = criarEditorDeTeste()
    const camadas = montarCamadas(editor)
    const sala = criarPeca(editor, 'sala-mapa', 'base', 'sala')
    act(() => camadas.atual.acoesDoPainel.aoAlternarTravada('topo'))

    editor.setSelectedShapes([sala])
    act(() => camadas.atual.acoesDoPainel.aoMoverSelecaoPara('topo'))

    expect(editor.getShape(sala)!.isLocked).toBe(true)
    expect(editor.getShape(sala)!.meta.travadoPelaCamada).toBe(true)
  })

  it('mover para camada OCULTA tira a peça da seleção, para não editar às cegas', () => {
    const editor = criarEditorDeTeste()
    const camadas = montarCamadas(editor)
    const sala = criarPeca(editor, 'sala-mapa', 'base', 'sala')
    act(() => camadas.atual.acoesDoPainel.aoAlternarOculta('topo'))

    editor.setSelectedShapes([sala])
    act(() => camadas.atual.acoesDoPainel.aoMoverSelecaoPara('topo'))

    expect(editor.getSelectedShapeIds()).toEqual([])
  })
})

describe('destravar e excluir camada', () => {
  it('o cadeado abre de novo: destravar solta as peças que ele travou', () => {
    const editor = criarEditorDeTeste()
    const camadas = montarCamadas(editor)
    const sala = criarPeca(editor, 'sala-mapa', 'base', 'sala')

    act(() => camadas.atual.acoesDoPainel.aoAlternarTravada('base'))
    expect(editor.getShape(sala)!.isLocked).toBe(true)
    act(() => camadas.atual.acoesDoPainel.aoAlternarTravada('base'))

    expect(editor.getShape(sala)!.isLocked).toBe(false)
    // `false`, e não ausente: o tldraw MESCLA `meta` chave a chave, então nenhum partial
    // consegue apagar uma chave (ver o comentário em `camadasMapaEditor.tsx`). Quem lê a
    // marca sempre testa `=== true`, então `false` e ausente dão no mesmo.
    expect(editor.getShape(sala)!.meta.travadoPelaCamada).toBe(false)
  })

  /**
   * Excluir uma camada travada não pode deixar as peças presas para sempre: a camada some do
   * painel, então nenhum 🔓 alcançaria mais aquelas peças.
   */
  it('excluir camada TRAVADA migra as peças E as destrava na herdeira livre', () => {
    const editor = criarEditorDeTeste()
    const camadas = montarCamadas(editor)
    const sala = criarPeca(editor, 'sala-mapa', 'topo', 'sala')
    act(() => camadas.atual.acoesDoPainel.aoAlternarTravada('topo'))
    expect(editor.getShape(sala)!.isLocked).toBe(true)

    act(() => camadas.atual.acoesDoPainel.aoExcluir('topo'))

    expect(editor.getShape(sala)!.meta.camada).toBe('base')
    expect(editor.getShape(sala)!.isLocked).toBe(false)
    expect(camadas.atual.camadas.map((c) => c.id)).toEqual(['base'])
  })

  it('cadeado que o usuário pôs à mão numa peça sobrevive ao destravar da camada', () => {
    const editor = criarEditorDeTeste()
    const camadas = montarCamadas(editor)
    const manual = criarPeca(editor, 'sala-mapa', 'base', 'manual')
    editor.updateShapes([{ id: manual, type: 'sala-mapa', isLocked: true }] as Parameters<
      typeof editor.updateShapes
    >[0])

    act(() => camadas.atual.acoesDoPainel.aoAlternarTravada('base'))
    act(() => camadas.atual.acoesDoPainel.aoAlternarTravada('base'))

    expect(editor.getShape(manual)!.isLocked).toBe(true)
  })
})

describe('camada ativa', () => {
  it('ao carregar, a ativa é a da FRENTE (última da lista), como no Photoshop', () => {
    const editor = criarEditorDeTeste()
    const camadas = montarCamadas(editor)
    expect(camadas.atual.camadaAtivaId).toBe('topo')
  })

  it('camada nova nasce na frente e vira a ativa', () => {
    const editor = criarEditorDeTeste()
    const camadas = montarCamadas(editor)

    act(() => camadas.atual.acoesDoPainel.aoCriar('Névoa'))

    const ordem = camadas.atual.getOrdemCamadas()
    expect(ordem[ordem.length - 1]).toBe(camadas.atual.camadaAtivaId)
    expect(camadas.atual.camadas[camadas.atual.camadas.length - 1].nome).toBe('Névoa')
  })
})

/**
 * A contagem tem que somar o TOTAL da página: se uma peça órfã sumisse da conta, o painel
 * mostraria "0" numa camada cujo olho apaga coisa da tela — pior que não mostrar número.
 */
describe('contagem de peças por camada', () => {
  it('distribui pelas camadas existentes', () => {
    expect(contagemPorCamada({ base: 3, topo: 2 }, CAMADAS)).toEqual({ base: 3, topo: 2 })
  })

  it('camada sem peça aparece com zero, não some da lista', () => {
    expect(contagemPorCamada({ base: 3 }, CAMADAS)).toEqual({ base: 3, topo: 0 })
  })

  it('peça sem carimbo e peça de camada excluída somam na primeira, como camadaDoShape', () => {
    expect(contagemPorCamada({ '': 2, 'camada-que-sumiu': 1, topo: 1 }, CAMADAS)).toEqual({ base: 3, topo: 1 })
  })

  it('sem camadas não inventa chave', () => {
    expect(contagemPorCamada({ base: 5 }, [])).toEqual({})
  })

  it('a soma bate com o total da página', () => {
    const crua = { '': 4, base: 7, orfa: 2, topo: 9 }
    const total = Object.values(crua).reduce((a, b) => a + b, 0)
    const somada = Object.values(contagemPorCamada(crua, CAMADAS)).reduce((a, b) => a + b, 0)
    expect(somada).toBe(total)
  })
})
