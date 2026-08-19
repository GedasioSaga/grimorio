// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createShapeId, type Editor } from 'tldraw'
import { arrastar, clicar, criarEditorDeTeste } from './ajudaEditorMapa'
import { registrarAtalhos } from '../components/atalhosCanvas'
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

describe('reformar a sala em polígono pelas alças', () => {
  function poligono(editor: Editor, pontos: Array<{ x: number; y: number }>) {
    const id = createShapeId()
    editor.createShape({ id, type: 'sala-poligono-mapa', x: 0, y: 0, props: { pontos } } as Parameters<
      typeof editor.createShape
    >[0])
    return id
  }
  const pontosDe = (editor: Editor, id: ReturnType<typeof createShapeId>) =>
    (editor.getShape(id)!.props as { pontos: Array<{ x: number; y: number }> }).pontos

  it('há uma alça `create` por ARESTA, incluindo a de fechamento', () => {
    const editor = criarEditorDeTeste()
    const id = poligono(editor, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ])
    const alcas = editor.getShapeHandles(id)!
    expect(alcas.filter((h) => h.type === 'vertex')).toHaveLength(4)
    expect(alcas.filter((h) => h.type === 'create')).toHaveLength(4)
  })

  it('arrastar a alça do meio INSERE um canto, e o arrasto continua nele', () => {
    const editor = criarEditorDeTeste()
    const id = poligono(editor, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ])
    const forma = editor.getShape(id)!
    const util = editor.getShapeUtil(forma) as {
      onHandleDragStart?: (s: typeof forma, i: unknown) => unknown
      onHandleDrag?: (s: typeof forma, i: unknown) => unknown
    }
    const alcaCriar = editor.getShapeHandles(id)!.find((h) => h.type === 'create' && h.id === 'criar-0')!

    // o start insere UMA vez
    const depoisStart = util.onHandleDragStart!(forma, { handle: { ...alcaCriar } }) as {
      props: { pontos: Array<{ x: number; y: number }> }
    }
    expect(depoisStart.props.pontos).toHaveLength(5)

    // e os movimentos seguintes movem o canto novo em vez de inserir outro. `DraggingHandle`
    // reenvia o MESMO id o gesto inteiro, então inserir no drag empilharia dezenas de cantos.
    editor.updateShape({ id, type: 'sala-poligono-mapa', props: depoisStart.props } as Parameters<
      typeof editor.updateShape
    >[0])
    let atual = editor.getShape(id)!
    for (const y of [-20, -40, -60]) {
      const mudanca = util.onHandleDrag!(atual, { handle: { ...alcaCriar, x: 50, y } }) as {
        props: { pontos: Array<{ x: number; y: number }> }
      }
      editor.updateShape({ id, type: 'sala-poligono-mapa', props: mudanca.props } as Parameters<
        typeof editor.updateShape
      >[0])
      atual = editor.getShape(id)!
    }
    expect(pontosDe(editor, id)).toHaveLength(5)
    expect(pontosDe(editor, id)[1]).toEqual({ x: 50, y: -60 })
  })

  it('reformar NÃO apaga nome, estado, cor nem vínculo — é reformar, não refazer', () => {
    const editor = criarEditorDeTeste()
    const id = poligono(editor, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ])
    editor.updateShape({
      id,
      type: 'sala-poligono-mapa',
      props: { rotulo: 'Capela', estado: 'limpa', cor: '#8a4340', cenarioId: 'cen-9', espessura: 6 },
    } as Parameters<typeof editor.updateShape>[0])

    const forma = editor.getShape(id)!
    const util = editor.getShapeUtil(forma) as { onHandleDragStart?: (s: typeof forma, i: unknown) => unknown }
    const alca = editor.getShapeHandles(id)!.find((h) => h.id === 'criar-1')!
    const mudanca = util.onHandleDragStart!(forma, { handle: { ...alca } }) as {
      props: { pontos: Array<{ x: number; y: number }> }
    }
    editor.updateShape({ id, type: 'sala-poligono-mapa', props: mudanca.props } as Parameters<
      typeof editor.updateShape
    >[0])

    const p = editor.getShape(id)!.props as Record<string, unknown>
    expect(p.pontos).toHaveLength(5)
    expect([p.rotulo, p.estado, p.cor, p.cenarioId, p.espessura]).toEqual([
      'Capela',
      'limpa',
      '#8a4340',
      'cen-9',
      6,
    ])
  })

  it('a hitbox acompanha o canto novo', () => {
    const editor = criarEditorDeTeste()
    const id = poligono(editor, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ])
    // (150,50) está fora do quadrado
    expect(editor.getShapeAtPoint({ x: 150, y: 50 }, { hitInside: true })?.id).not.toBe(id)

    editor.updateShape({
      id,
      type: 'sala-poligono-mapa',
      props: {
        pontos: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 100 },
          { x: 0, y: 100 },
        ],
      },
    } as Parameters<typeof editor.updateShape>[0])

    expect(editor.getShapeAtPoint({ x: 150, y: 50 }, { hitInside: true })?.id).toBe(id)
  })
})

describe('Delete remove o canto sob o cursor', () => {
  /**
   * O par da alça `create`. Testado com `registrarAtalhos` de verdade montado, porque é ele
   * que escuta a tecla — `ShapeUtil` não recebe evento de teclado.
   *
   * A bancada NÃO registrava os atalhos, então este comportamento era invisível lá. Foi
   * corrigido junto (`src/amostra/CenaMapa.tsx`): superfície de verificação que monta menos
   * que o app real mente sobre o app real.
   */
  function comAtalhos() {
    const editor = criarEditorDeTeste()
    const cancelar = registrarAtalhos(editor, { aoCopiar() {}, aoFalharCopia() {} })
    const id = createShapeId()
    editor.createShape({
      id,
      type: 'sala-poligono-mapa',
      x: 0,
      y: 0,
      props: {
        pontos: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 100 },
          { x: 100, y: 100 },
          { x: 100, y: 200 },
          { x: 0, y: 200 },
        ],
      },
    } as Parameters<typeof editor.createShape>[0])
    editor.setSelectedShapes([id])
    return { editor, id, cancelar }
  }

  const contar = (editor: Editor, id: ReturnType<typeof createShapeId>) =>
    (editor.getShape(id)!.props as { pontos: unknown[] }).pontos.length

  function apertarDelete(editor: Editor, pagina: { x: number; y: number }) {
    editor.dispatch({
      type: 'pointer',
      name: 'pointer_move',
      target: 'canvas',
      pointerId: 1,
      point: pagina,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      accelKey: false,
      button: 0,
      isPen: false,
    } as Parameters<typeof editor.dispatch>[0])
    editor.emit('tick', 16)
    editor
      .getContainer()
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
  }

  it('cursor EM CIMA de um canto: remove aquele canto', () => {
    const { editor, id, cancelar } = comAtalhos()
    expect(contar(editor, id)).toBe(6)
    apertarDelete(editor, { x: 200, y: 100 })
    expect(contar(editor, id)).toBe(5)
    cancelar()
  })

  it('cursor LONGE de canto: não trata, e o Delete do tldraw segue seu curso', () => {
    // trocar "apagar a peça" por "apagar um canto" em toda a área da sala tiraria do
    // usuário um gesto que ele já tem.
    const { editor, id, cancelar } = comAtalhos()
    apertarDelete(editor, { x: 40, y: 40 })
    expect(contar(editor, id)).toBe(6)
    cancelar()
  })

  it('para no piso de 3 cantos', () => {
    const { editor, id, cancelar } = comAtalhos()
    for (const p of [
      { x: 200, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ]) {
      apertarDelete(editor, p)
    }
    // abaixo de 3, `new Polygon2d` lança dentro do getGeometry — que roda ao LER o disco
    expect(contar(editor, id)).toBe(3)
    cancelar()
  })

  it('cada remoção é um Ctrl+Z', () => {
    const { editor, id, cancelar } = comAtalhos()
    apertarDelete(editor, { x: 200, y: 100 })
    apertarDelete(editor, { x: 100, y: 100 })
    expect(contar(editor, id)).toBe(4)
    editor.undo()
    expect(contar(editor, id)).toBe(5)
    editor.undo()
    expect(contar(editor, id)).toBe(6)
    cancelar()
  })
})
