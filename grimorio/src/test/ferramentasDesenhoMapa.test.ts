// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sortByIndex, type Editor, type TLLineShape } from 'tldraw'
import { arrastar, clicar, criarEditorDeTeste } from './ajudaEditorMapa'
import { comprimentoDaLinha, LINHA_COMPRIMENTO_MINIMO, LINHA_COMPRIMENTO_PADRAO } from '../lib/linhaMapa'
import type { RetanguloMapaShapeType } from '../components/RetanguloMapaShape'
import { RETANGULO_ALTURA_PADRAO, RETANGULO_LARGURA_PADRAO } from '../lib/retanguloMapa'
import { registrarBeforeCreateMapa } from '../lib/montagemMapa'

/**
 * O bug: "escolho linha (ou outra coisa) e, em vez de colocar no mapa, a peça fica como se
 * eu tivesse na mão e só dá pra arrastar".
 *
 * Diagnóstico completo em `lib/linhaMapa.ts`. O que se prova aqui é o COMPORTAMENTO da
 * ferramenta na máquina de estados de verdade, com eventos de ponteiro reais: clicar
 * COLOCA uma peça de tamanho útil e devolve a seleção; arrastar continua desenhando livre.
 */

function unicaLinha(editor: Editor): TLLineShape {
  const linhas = editor.getCurrentPageShapes().filter((s): s is TLLineShape => s.type === 'line')
  expect(linhas).toHaveLength(1)
  return linhas[0]
}

function pontosDe(linha: TLLineShape) {
  return Object.values(linha.props.points).sort(sortByIndex)
}

describe('ferramenta de linha do mapa', () => {
  it('clicar coloca um segmento de tamanho útil — não uma linha de comprimento zero', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool('line')

    clicar(editor, 100, 100)

    const linha = unicaLinha(editor)
    expect(comprimentoDaLinha(pontosDe(linha))).toBeCloseTo(LINHA_COMPRIMENTO_PADRAO)
  })

  it('o segmento nasce centrado no ponto clicado', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool('line')

    clicar(editor, 100, 100)

    const linha = unicaLinha(editor)
    const [inicio, fim] = pontosDe(linha)
    expect(linha.x + inicio.x).toBeCloseTo(100 - LINHA_COMPRIMENTO_PADRAO / 2)
    expect(linha.x + fim.x).toBeCloseTo(100 + LINHA_COMPRIMENTO_PADRAO / 2)
    expect(linha.y + inicio.y).toBeCloseTo(100)
  })

  it('depois do clique a peça está SELECIONADA e a ferramenta volta pra seleção', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool('line')

    clicar(editor, 100, 100)

    const linha = unicaLinha(editor)
    expect(editor.getSelectedShapeIds()).toEqual([linha.id])
    expect(editor.getCurrentToolId()).toBe('select')
  })

  it('sem o conserto a linha teria ficado degenerada: o comprimento passa do limiar de clique', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool('line')

    clicar(editor, 50, 50)

    expect(comprimentoDaLinha(pontosDe(unicaLinha(editor)))).toBeGreaterThan(LINHA_COMPRIMENTO_MINIMO)
  })

  it('arrastar continua desenhando a linha do tamanho arrastado, sem virar o padrão', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool('line')

    arrastar(editor, 100, 100, 400, 100)

    const comprimento = comprimentoDaLinha(pontosDe(unicaLinha(editor)))
    expect(comprimento).toBeGreaterThan(LINHA_COMPRIMENTO_PADRAO)
    expect(comprimento).toBeCloseTo(300, 0)
  })

  /**
   * O clique vira DUAS escritas no store (a linha degenerada que o `pointing` nativo cria, e
   * a esticada que este projeto põe no lugar). Se cada uma virasse um passo de histórico, um
   * Ctrl+Z deixaria no mapa exatamente a linha invisível que o conserto existe para eliminar
   * — o bug de volta, só que atrás do desfazer.
   */
  it('um único desfazer limpa o mapa, sem deixar a linha degenerada para trás', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool('line')
    clicar(editor, 100, 100)
    expect(editor.getCurrentPageShapes()).toHaveLength(1)

    editor.undo()

    expect(editor.getCurrentPageShapes()).toHaveLength(0)
  })

  /**
   * A peça nasce TRAVADA quando a camada ativa está com o cadeado, e `updateShapes`
   * descarta em silêncio partial sobre shape travado. Sem `ignoreShapeLock`, o conserto
   * virava no-op justamente ali: sobrava a linha invisível de comprimento ~zero, agora
   * travada e impossível de selecionar pelo canvas para apagar.
   */
  it('em camada TRAVADA o clique ainda coloca um segmento de verdade', () => {
    const editor = criarEditorDeTeste()
    const cancelar = registrarBeforeCreateMapa(editor, {
      getCamadaAtivaId: () => 'trancada',
      getCamadaTravada: () => true,
    })
    editor.setCurrentTool('line')

    clicar(editor, 100, 100)

    const linha = unicaLinha(editor)
    expect(linha.isLocked).toBe(true)
    expect(comprimentoDaLinha(pontosDe(linha))).toBeCloseTo(LINHA_COMPRIMENTO_PADRAO)
    cancelar()
  })

  /**
   * Cadeado de ferramenta (tecla `q`): ligado, o tldraw mantém a ferramenta armada. O
   * retângulo herda isso do `BaseBoxShapeTool`; a linha precisa fazer explícito, senão seria
   * a única peça da barra que desarma — e `isToolLocked` viaja no arquivo do mapa.
   */
  it('com o cadeado de ferramenta ligado, a linha continua armada depois do clique', () => {
    const editor = criarEditorDeTeste()
    editor.updateInstanceState({ isToolLocked: true })
    editor.setCurrentTool('line')

    clicar(editor, 100, 100)

    expect(editor.getCurrentToolId()).toBe('line')
    expect(comprimentoDaLinha(pontosDe(unicaLinha(editor)))).toBeCloseTo(LINHA_COMPRIMENTO_PADRAO)
  })

  it('com o cadeado de ferramenta ligado, dois cliques colocam duas linhas', () => {
    const editor = criarEditorDeTeste()
    editor.updateInstanceState({ isToolLocked: true })
    editor.setCurrentTool('line')

    clicar(editor, 100, 100)
    clicar(editor, 400, 400)

    expect(editor.getCurrentPageShapes().filter((s) => s.type === 'line')).toHaveLength(2)
  })

  it('dois cliques seguidos colocam DUAS linhas, cada uma no seu lugar', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool('line')
    clicar(editor, 100, 100)
    editor.setCurrentTool('line')
    clicar(editor, 300, 300)

    const linhas = editor.getCurrentPageShapes().filter((s) => s.type === 'line')
    expect(linhas).toHaveLength(2)
    for (const linha of linhas as TLLineShape[]) {
      expect(comprimentoDaLinha(pontosDe(linha))).toBeCloseTo(LINHA_COMPRIMENTO_PADRAO)
    }
  })
})

describe('ferramenta do retângulo do mapa', () => {
  function unicoRetangulo(editor: Editor): RetanguloMapaShapeType {
    const rs = editor.getCurrentPageShapes().filter((s): s is RetanguloMapaShapeType => s.type === 'retangulo-mapa')
    expect(rs).toHaveLength(1)
    return rs[0]
  }

  it('clicar coloca um retângulo do tamanho padrão, centrado no clique', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool('retangulo-mapa')

    clicar(editor, 200, 200)

    const r = unicoRetangulo(editor)
    expect(r.props.w).toBeCloseTo(RETANGULO_LARGURA_PADRAO)
    expect(r.props.h).toBeCloseTo(RETANGULO_ALTURA_PADRAO)
    expect(r.x).toBeCloseTo(200 - RETANGULO_LARGURA_PADRAO / 2)
    expect(r.y).toBeCloseTo(200 - RETANGULO_ALTURA_PADRAO / 2)
  })

  it('depois do clique o retângulo está selecionado e a ferramenta volta pra seleção', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool('retangulo-mapa')

    clicar(editor, 200, 200)

    expect(editor.getSelectedShapeIds()).toEqual([unicoRetangulo(editor).id])
    expect(editor.getCurrentToolId()).toBe('select')
  })

  it('arrastar desenha o retângulo do tamanho arrastado', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool('retangulo-mapa')

    arrastar(editor, 100, 100, 340, 260)

    const r = unicoRetangulo(editor)
    expect(r.props.w).toBeCloseTo(240, 0)
    expect(r.props.h).toBeCloseTo(160, 0)
  })

  it('o retângulo nasce sem preenchimento, para não tampar a planta por baixo', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool('retangulo-mapa')
    clicar(editor, 200, 200)
    expect(unicoRetangulo(editor).props.preenchido).toBe(false)
  })

  it('um único desfazer limpa o mapa', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool('retangulo-mapa')
    clicar(editor, 200, 200)
    expect(editor.getCurrentPageShapes()).toHaveLength(1)

    editor.undo()

    expect(editor.getCurrentPageShapes()).toHaveLength(0)
  })
})
