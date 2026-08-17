import {
  Box,
  StateNode,
  createShapeId,
  getIndices,
  sortByIndex,
  type Editor,
  type IndexKey,
  type TLPointerEventInfo,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
  type TLStateNodeConstructor,
} from 'tldraw'
import { apagarTrechoDaLinha, type CirculoBorracha, type PontoLinha } from '../lib/borrachaTrecho'

/**
 * Borracha do mapa: substitui o `eraser` nativo do tldraw (mesmo `id`, trocado por
 * `mergeArraysAndReplaceDefaults`/`tools` — ver `MapaView.tsx`) para que passar a
 * borracha em cima de uma DIVISÓRIA (`line`) apague só o trecho coberto, não o traço
 * inteiro. Em qualquer outra peça continua apagando tudo, igual sempre foi — decisão
 * deliberada (pedida no enunciado): recortar sala/porta/símbolo por um círculo é um
 * problema de boolean de polígono, não de polilinha, e fora do escopo desta peça.
 *
 * Não dá para simplesmente ESTENDER o `Erasing`/`Pointing`/`Idle` nativos: só
 * `EraserTool` é exportado publicamente pelo pacote `tldraw`
 * (`node_modules/tldraw/src/index.ts:209`), os três estados internos não são. Por isso
 * os três abaixo são uma reimplementação — adaptada do código-fonte de
 * `node_modules/tldraw/src/lib/tools/EraserTool/childStates/*.ts` (mesma versão,
 * 4.5.12), com um corte deliberado de escopo: a variação "Ctrl/Cmd + arrastar apaga só a
 * PRIMEIRA peça tocada" e a exclusão de formas dentro de um frame/grupo em que o gesto
 * começou não foram portadas — nenhuma das duas é usada hoje neste mapa (não há frames,
 * e o único grupo é a legenda decorativa, já protegida por `isShapeOrAncestorLocked`
 * não... ver `SelecaoPropriedadesBridge`) e cada uma delas dobraria o tamanho deste
 * arquivo para um ganho que ninguém pediu.
 */

/** Mesmo tamanho visual do rabisco do eraser nativo (`EraserTool/childStates/Erasing.ts:54`). */
const RAIO_BORRACHA_PX = 12

function ehLinhaCortavel(shape: TLShape): boolean {
  return shape.type === 'line'
}

/**
 * Converte os centros da borracha (espaço de página) para o espaço LOCAL de uma forma —
 * mesma forma que `props.points` usa — aplicando a inversa da transform da forma no
 * centro e numa borda do círculo, e medindo a distância resultante. Funciona para
 * rotação e escala uniforme (o caso real de um `line`: `onResize` já escreve a escala
 * direto nos pontos — ver `TLLineShape.ts` — não há shear a considerar).
 */
function circulosNoEspacoLocal(editor: Editor, id: TLShapeId, centrosPagina: PontoLinha[]): CirculoBorracha[] | null {
  const pageTransform = editor.getShapePageTransform(id)
  if (!pageTransform) return null
  const inversa = pageTransform.clone().invert()
  const raioPagina = RAIO_BORRACHA_PX / editor.getZoomLevel()

  return centrosPagina.map((centro) => {
    const centroLocal = inversa.applyToPoint(centro)
    const bordaLocal = inversa.applyToPoint({ x: centro.x + raioPagina, y: centro.y })
    const raio = Math.hypot(bordaLocal.x - centroLocal.x, bordaLocal.y - centroLocal.y)
    return { x: centroLocal.x, y: centroLocal.y, raio }
  })
}

function pontosDaLinha(shape: TLShape): PontoLinha[] {
  const props = shape.props as { points: Record<string, { x: number; y: number; index: IndexKey }> }
  return Object.values(props.points)
    .sort(sortByIndex)
    .map((p) => ({ x: p.x, y: p.y }))
}

function pontosParaDicionario(pontos: PontoLinha[]): Record<string, { id: string; index: IndexKey; x: number; y: number }> {
  const indices = getIndices(pontos.length)
  const dict: Record<string, { id: string; index: IndexKey; x: number; y: number }> = {}
  pontos.forEach((p, i) => {
    dict[indices[i]] = { id: indices[i], index: indices[i], x: p.x, y: p.y }
  })
  return dict
}

/**
 * Aplica a borracha de trecho às formas atingidas por um gesto (arrastar ou clicar).
 * `centrosPagina` é o caminho percorrido pela borracha, em espaço de página — um clique
 * simples manda só um ponto.
 */
function aplicarBorracha(editor: Editor, idsAtingidos: TLShapeId[], centrosPagina: PontoLinha[]) {
  if (idsAtingidos.length === 0 || centrosPagina.length === 0) return

  editor.run(() => {
    const idsParaApagarInteiro: TLShapeId[] = []

    for (const id of idsAtingidos) {
      const shape = editor.getShape(id)
      if (!shape) continue
      if (!ehLinhaCortavel(shape)) {
        idsParaApagarInteiro.push(id)
        continue
      }

      const circulos = circulosNoEspacoLocal(editor, id, centrosPagina)
      if (!circulos) {
        idsParaApagarInteiro.push(id)
        continue
      }

      const pontosOriginais = pontosDaLinha(shape)
      const resultado = apagarTrechoDaLinha(pontosOriginais, circulos)

      if (resultado.length === 0) {
        idsParaApagarInteiro.push(id)
        continue
      }
      if (resultado.length === 1 && resultado[0] === pontosOriginais) {
        continue // a borracha passou perto mas não chegou a encostar nesta linha
      }

      const [primeiraCadeia, ...cadeiasExtras] = resultado
      editor.updateShape({
        id,
        type: 'line',
        props: { points: pontosParaDicionario(primeiraCadeia) },
      } as TLShapePartial)

      for (const cadeia of cadeiasExtras) {
        editor.createShape({
          id: createShapeId(),
          type: 'line',
          x: shape.x,
          y: shape.y,
          rotation: shape.rotation,
          parentId: shape.parentId,
          meta: { ...shape.meta },
          props: { ...(shape.props as object), points: pontosParaDicionario(cadeia) },
        } as TLShapePartial)
      }
    }

    if (idsParaApagarInteiro.length) editor.deleteShapes(idsParaApagarInteiro)
  })
}

class Idle extends StateNode {
  static override id = 'idle'

  override onPointerDown(info: TLPointerEventInfo) {
    this.parent.transition('pointing', info)
  }

  override onCancel() {
    this.editor.setCurrentTool('select')
  }
}

class Pointing extends StateNode {
  static override id = 'pointing'

  private idsAtingidos: TLShapeId[] = []

  override onEnter() {
    const zoomLevel = this.editor.getZoomLevel()
    const ponto = this.editor.inputs.getCurrentPagePoint()
    const atingidas = this.editor
      .getCurrentPageShapesSorted()
      .reverse()
      .filter(
        (shape) =>
          !this.editor.isShapeOrAncestorLocked(shape) &&
          !this.editor.isShapeOfType(shape, 'group') &&
          this.editor.isPointInShape(shape, ponto, {
            hitInside: false,
            margin: this.editor.options.hitTestMargin / zoomLevel,
          }),
      )
      .map((shape) => this.editor.getOutermostSelectableShape(shape).id)
    this.idsAtingidos = Array.from(new Set(atingidas))
    this.editor.setErasingShapes(this.idsAtingidos)
  }

  override onExit(_info: unknown, to: string) {
    if (to !== 'erasing') this.editor.setErasingShapes([])
  }

  override onPointerMove(info: TLPointerEventInfo) {
    if (this.editor.inputs.getIsDragging()) this.parent.transition('erasing', info)
  }

  override onPointerUp() {
    this.complete()
  }

  override onCancel() {
    this.parent.transition('idle')
  }

  override onComplete() {
    this.complete()
  }

  private complete() {
    if (this.idsAtingidos.length) {
      const ponto = this.editor.inputs.getCurrentPagePoint()
      this.editor.markHistoryStoppingPoint('borracha de trecho: clique')
      aplicarBorracha(this.editor, this.idsAtingidos, [{ x: ponto.x, y: ponto.y }])
    }
    this.parent.transition('idle')
  }
}

class Erasing extends StateNode {
  static override id = 'erasing'

  private markId = ''
  private idsAtingidos = new Set<TLShapeId>()
  private centrosPercorridos: PontoLinha[] = []
  private scribbleId = ''

  override onEnter() {
    this.markId = this.editor.markHistoryStoppingPoint('borracha de trecho: começo')
    this.idsAtingidos = new Set(this.editor.getErasingShapeIds())
    const origem = this.editor.inputs.getOriginPagePoint()
    this.centrosPercorridos = [{ x: origem.x, y: origem.y }]
    const scribble = this.editor.scribbles.addScribble({ color: 'muted-1', size: RAIO_BORRACHA_PX })
    this.scribbleId = scribble.id
    this.update()
  }

  override onExit() {
    this.editor.setErasingShapes([])
    this.editor.scribbles.stop(this.scribbleId)
  }

  override onPointerMove() {
    this.update()
  }

  override onPointerUp() {
    this.complete()
  }

  override onCancel() {
    this.cancel()
  }

  override onComplete() {
    this.complete()
  }

  private update() {
    const editor = this.editor
    const zoomLevel = editor.getZoomLevel()
    const atual = editor.inputs.getCurrentPagePoint()
    const anterior = editor.inputs.getPreviousPagePoint()
    editor.scribbles.addPoint(this.scribbleId, atual.x, atual.y)
    this.centrosPercorridos.push({ x: atual.x, y: atual.y })

    const minDist = editor.options.hitTestMargin / zoomLevel
    const limites = Box.FromPoints([anterior, atual]).expandBy(minDist)
    const candidatosIds = editor.getShapeIdsInsideBounds(limites)
    if (candidatosIds.size === 0) {
      editor.setErasingShapes(Array.from(this.idsAtingidos))
      return
    }

    const candidatos = editor.getCurrentPageRenderingShapesSorted().filter((s) => candidatosIds.has(s.id))
    for (const shape of candidatos) {
      if (editor.isShapeOfType(shape, 'group') || editor.isShapeOrAncestorLocked(shape)) continue

      const geometria = editor.getShapeGeometry(shape)
      const pageTransform = editor.getShapePageTransform(shape)
      if (!geometria || !pageTransform) continue
      const inversa = pageTransform.clone().invert()
      const a = inversa.applyToPoint(anterior)
      const b = inversa.applyToPoint(atual)

      const { bounds } = geometria
      if (
        bounds.minX - minDist > Math.max(a.x, b.x) ||
        bounds.minY - minDist > Math.max(a.y, b.y) ||
        bounds.maxX + minDist < Math.min(a.x, b.x) ||
        bounds.maxY + minDist < Math.min(a.y, b.y)
      ) {
        continue
      }

      if (geometria.hitTestLineSegment(a, b, minDist)) {
        this.idsAtingidos.add(editor.getOutermostSelectableShape(shape).id)
      }
    }

    editor.setErasingShapes(Array.from(this.idsAtingidos))
  }

  private complete() {
    aplicarBorracha(this.editor, Array.from(this.idsAtingidos), this.centrosPercorridos)
    this.parent.transition('idle')
  }

  private cancel() {
    this.editor.bailToMark(this.markId)
    this.parent.transition('idle')
  }
}

export class BorrachaTrechoMapaTool extends StateNode {
  static override id = 'eraser'
  static override initial = 'idle'
  static override isLockable = false
  static override children(): TLStateNodeConstructor[] {
    return [Idle, Pointing, Erasing]
  }

  override onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }
}
