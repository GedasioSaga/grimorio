// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createShapeId, type Editor } from 'tldraw'
import { arrastar, clicar, criarEditorDeTeste } from './ajudaEditorMapa'
import { QUADRADO_PX } from '../lib/quadrados'
import { limitesDoPoligono, PONTOS_SALA_POLIGONO_PADRAO } from '../lib/salaPoligonoMapa'

/**
 * As peças de construção passaram a ser DESENHADAS no canvas.
 *
 * Antes cada uma nascia no centro da viewport por um botão: longe de onde o usuário queria,
 * fora da grade, e sempre no mesmo ponto (a segunda em cima da primeira). A comparação cega
 * contra o Dungeon Scrawl perdeu nas três lentes por causa disso.
 *
 * O que estes testes protegem não é "a ferramenta existe" — é o GESTO: clicar coloca
 * centrado no clique, arrastar desenha do tamanho arrastado, e os dois encaixam na grade.
 */
const CONSTRUCOES = [
  'sala-mapa',
  'corredor-mapa',
  'muralha-mapa',
  'torre-mapa',
  'escada-mapa',
  'porta-mapa',
  'sala-poligono-mapa',
] as const

function pecas(editor: Editor, tipo: string) {
  return editor.getCurrentPageShapes().filter((s) => s.type === tipo)
}

describe.each(CONSTRUCOES)('ferramenta de %s', (tipo) => {
  it('existe e é armável pelo id do próprio shape', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool(tipo)
    expect(editor.getCurrentToolId()).toBe(tipo)
  })

  it('clique no canvas COLOCA a peça, centrada no ponto clicado', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool(tipo)
    clicar(editor, 300, 200)

    const criadas = pecas(editor, tipo)
    expect(criadas).toHaveLength(1)
    const b = editor.getShapePageBounds(criadas[0].id)!
    // centro da peça no ponto do clique — tolerância de meio quadrado por causa do encaixe
    expect(Math.abs(b.x + b.w / 2 - 300)).toBeLessThanOrEqual(QUADRADO_PX / 2)
    expect(Math.abs(b.y + b.h / 2 - 200)).toBeLessThanOrEqual(QUADRADO_PX / 2)
  })

  it('nasce selecionada e devolve a ferramenta para o select', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool(tipo)
    clicar(editor, 300, 200)

    expect(editor.getSelectedShapeIds()).toHaveLength(1)
    expect(editor.getCurrentToolId()).toBe('select')
  })

  it('arrastar desenha a peça do tamanho arrastado', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool(tipo)
    arrastar(editor, 100, 100, 420, 292)

    const criadas = pecas(editor, tipo)
    expect(criadas).toHaveLength(1)
    const b = editor.getShapePageBounds(criadas[0].id)!
    // o gesto define o tamanho: não pode sair no tamanho de nascença
    expect(b.w).toBeGreaterThan(200)
    expect(b.h).toBeGreaterThan(100)
    expect(Math.abs(b.x - 100)).toBeLessThanOrEqual(QUADRADO_PX)
    expect(Math.abs(b.y - 100)).toBeLessThanOrEqual(QUADRADO_PX)
  })

  it('duas peças seguidas NÃO caem no mesmo lugar', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool(tipo)
    clicar(editor, 200, 200)
    editor.setCurrentTool(tipo)
    clicar(editor, 600, 400)

    const criadas = pecas(editor, tipo)
    expect(criadas).toHaveLength(2)
    const a = editor.getShapePageBounds(criadas[0].id)!
    const b = editor.getShapePageBounds(criadas[1].id)!
    expect(a.x === b.x && a.y === b.y).toBe(false)
  })

  it('com a grade ligada, nasce em múltiplo de um quadrado', () => {
    const editor = criarEditorDeTeste()
    editor.updateInstanceState({ isGridMode: true })
    editor.updateDocumentSettings({ gridSize: QUADRADO_PX })
    editor.setCurrentTool(tipo)
    // ponto propositalmente fracionário, como o centro da viewport sempre foi
    clicar(editor, 253.7, 191.3)

    const criada = pecas(editor, tipo)[0]
    expect(criada.x % QUADRADO_PX).toBeCloseTo(0, 5)
    expect(criada.y % QUADRADO_PX).toBeCloseTo(0, 5)
  })
})

describe('sala em polígono desenhada', () => {
  it('o arrasto preenche a caixa e a silhueta em L é preservada', () => {
    const editor = criarEditorDeTeste()
    editor.setCurrentTool('sala-poligono-mapa')
    arrastar(editor, 100, 100, 420, 388)

    const criada = pecas(editor, 'sala-poligono-mapa')[0]
    const pontos = (criada.props as { pontos: Array<{ x: number; y: number }> }).pontos
    // mesma contagem de vértices da forma de nascença: o arrasto reescala, não simplifica
    expect(pontos).toHaveLength(PONTOS_SALA_POLIGONO_PADRAO.length)

    const b = editor.getShapePageBounds(criada.id)!
    expect(b.w).toBeGreaterThan(280)
    expect(b.h).toBeGreaterThan(250)

    // o polígono ocupa a caixa inteira — se ele saísse menor, sobraria vão entre o que o
    // usuário arrastou e o que apareceu
    const lim = limitesDoPoligono(pontos)
    expect(lim.w).toBeCloseTo(b.w, 1)
    expect(lim.h).toBeCloseTo(b.h, 1)
  })

  it('um Ctrl+Z desfaz a sala desenhada inteira, e só ela', () => {
    const editor = criarEditorDeTeste()
    const antes = createShapeId()
    editor.createShape({ id: antes, type: 'sala-mapa', x: 0, y: 0 } as Parameters<
      typeof editor.createShape
    >[0])

    editor.setCurrentTool('sala-poligono-mapa')
    arrastar(editor, 300, 300, 500, 480)
    expect(pecas(editor, 'sala-poligono-mapa')).toHaveLength(1)

    editor.undo()
    expect(pecas(editor, 'sala-poligono-mapa')).toHaveLength(0)
    // a peça que já existia continua lá: o desenho abriu marca própria
    expect(editor.getShape(antes)).toBeDefined()
  })
})

/**
 * As duas classes de defeito que já haviam sido provadas em UMA peça e continuavam abertas
 * nas outras. Iteram sobre a lista para que a próxima peça de construção entre junto.
 */
describe('duplo clique não suja o mapa', () => {
  it.each([...CONSTRUCOES, 'retangulo-mapa'])('%s atende o duplo clique', (tipo) => {
    const editor = criarEditorDeTeste()
    const id = createShapeId()
    editor.createShape({ id, type: tipo, x: 0, y: 0 } as Parameters<typeof editor.createShape>[0])
    const forma = editor.getShape(id)!
    const util = editor.getShapeUtil(forma) as { onDoubleClick?: (s: typeof forma) => unknown }

    // retorno falsy faz o Idle do SelectTool cair em `handleDoubleClickOnCanvas`, que cria
    // um shape de texto vazio no ponto — invisível no escuro, e vai junto na exportação.
    expect(util.onDoubleClick, `${tipo} sem handler`).toBeTypeOf('function')
    expect(util.onDoubleClick!(forma), `${tipo} devolveu falsy`).toBeTruthy()
  })
})

describe('muralha é um anel, não um bloco', () => {
  /**
   * `hitInside: false` é o que o SelectTool usa para o clique de seleção — medir com
   * `hitInside: true` responde outra pergunta e foi o que me enganou na primeira tentativa.
   */
  const clique = (editor: Editor, x: number, y: number) =>
    editor.getShapeAtPoint({ x, y }, { hitInside: false })?.id

  function cercoComSala() {
    const editor = criarEditorDeTeste()
    const muralha = createShapeId()
    editor.createShape({ id: muralha, type: 'muralha-mapa', x: 0, y: 0, props: { w: 600, h: 480 } } as Parameters<
      typeof editor.createShape
    >[0])
    const sala = createShapeId()
    editor.createShape({ id: sala, type: 'sala-mapa', x: 100, y: 100, props: { w: 160, h: 112 } } as Parameters<
      typeof editor.createShape
    >[0])
    return { editor, muralha, sala }
  }

  it('o chão dentro do cerco não é a muralha', () => {
    const { editor, muralha } = cercoComSala()
    // Era o defeito: a muralha é a maior peça do mapa e, preenchida, engolia o clique de
    // qualquer chão vazio dentro dela.
    expect(clique(editor, 400, 400)).not.toBe(muralha)
  })

  it('a sala cercada continua clicável', () => {
    const { editor, sala } = cercoComSala()
    expect(clique(editor, 150, 150)).toBe(sala)
  })

  it('a LINHA do cerco continua clicável — é assim que se pega uma parede', () => {
    const { editor, muralha } = cercoComSala()
    // A primeira tentativa de correção (`isFilled: false`) passava no teste de cima e
    // quebrava este: forma oca maior que a viewport é pulada por `getShapeAtPoint`, e a
    // muralha ficava inselecionável. Os dois testes juntos são o que prende a solução.
    for (const [x, y] of [
      [2, 240],
      [300, 2],
      [598, 240],
      [300, 478],
    ]) {
      expect(clique(editor, x, y), `borda ${x},${y}`).toBe(muralha)
    }
  })
})
