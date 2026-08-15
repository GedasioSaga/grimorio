import {
  Edge2d,
  ShapeUtil,
  SVGContainer,
  T,
  Vec,
  type IndexKey,
  type RecordProps,
  type TLHandle,
  type TLHandleDragInfo,
  type TLShape,
  type TLShapePartial,
} from 'tldraw'
import { CONTORNO_SALA } from '../lib/salaMapa'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'linha-mapa': {
      /** ponta final, relativa ao início (que é o x/y do shape) */
      dx: number
      dy: number
    }
  }
}

export type LinhaMapaShapeType = TLShape<'linha-mapa'>

/** Comprimento de nascença: 4 quadrados na horizontal. */
export const LINHA_COMPRIMENTO_PADRAO = 128

/** Mesma espessura do contorno da sala — ver SalaMapaShape. */
const ESPESSURA = 1.2

/**
 * Divisória do mapa: uma linha reta com EXATAMENTE o traço do contorno da sala.
 *
 * Por que não a ferramenta `line` do tldraw pré-estilada, que era a versão anterior: a
 * paleta do tldraw é fechada em 13 cores e a mais próxima (`grey`, #9fa8b2) não é a cor
 * do contorno (#b9c4c9). Lado a lado a diferença aparece, e o usuário pediu que batesse
 * exato.
 *
 * Por que não resolver com CSS sobrescrevendo o `stroke` (atributo de apresentação perde
 * para CSS, então funcionaria): a exportação PNG/SVG re-renderiza os shapes por outro
 * caminho (`@tldraw/editor/src/lib/exports/getSvgJsx.tsx`) e não leva o CSS da página. A
 * linha sairia certa na tela e errada no arquivo exportado — que é justamente o que vai
 * para a mesa.
 *
 * A cor vem de `CONTORNO_SALA`, a mesma constante que a sala usa: uma fonte só, para as
 * duas nunca divergirem.
 *
 * O shape tem duas alças (`getHandles`), uma em cada ponta, então o usuário estica e gira
 * arrastando — o mesmo gesto da linha nativa. `Edge2d` como geometria dá o acerto de
 * clique ao longo do traço, e não numa caixa em volta.
 */
export class LinhaMapaShapeUtil extends ShapeUtil<LinhaMapaShapeType> {
  static override type = 'linha-mapa' as const

  static override props: RecordProps<LinhaMapaShapeType> = {
    dx: T.number,
    dy: T.number,
  }

  getDefaultProps(): LinhaMapaShapeType['props'] {
    return { dx: LINHA_COMPRIMENTO_PADRAO, dy: 0 }
  }

  override canResize() {
    return false
  }

  getGeometry(shape: LinhaMapaShapeType) {
    return new Edge2d({
      start: new Vec(0, 0),
      end: new Vec(shape.props.dx, shape.props.dy),
    })
  }

  override getHandles(shape: LinhaMapaShapeType): TLHandle[] {
    return [
      { id: 'inicio', type: 'vertex', index: 'a1' as IndexKey, x: 0, y: 0 },
      { id: 'fim', type: 'vertex', index: 'a2' as IndexKey, x: shape.props.dx, y: shape.props.dy },
    ]
  }

  /**
   * Arrastar a ponta INICIAL move o shape e encurta o vetor na mesma medida — senão a
   * linha inteira andaria junto e a ponta pareceria presa.
   */
  override onHandleDrag(
    shape: LinhaMapaShapeType,
    { handle }: TLHandleDragInfo<LinhaMapaShapeType>,
  ): TLShapePartial<LinhaMapaShapeType> | void {
    if (handle.id === 'fim') {
      return { id: shape.id, type: shape.type, props: { dx: handle.x, dy: handle.y } }
    }
    return {
      id: shape.id,
      type: shape.type,
      x: shape.x + handle.x,
      y: shape.y + handle.y,
      props: { dx: shape.props.dx - handle.x, dy: shape.props.dy - handle.y },
    }
  }

  component(shape: LinhaMapaShapeType) {
    const { dx, dy } = shape.props
    return (
      <SVGContainer>
        <line x1={0} y1={0} x2={dx} y2={dy} stroke={CONTORNO_SALA} strokeWidth={ESPESSURA} strokeLinecap="round" />
        {/* faixa transparente larga: dá o que clicar sem engrossar o traço visível */}
        <line x1={0} y1={0} x2={dx} y2={dy} stroke="transparent" strokeWidth={10} />
      </SVGContainer>
    )
  }

  indicator(shape: LinhaMapaShapeType) {
    const { dx, dy } = shape.props
    return <line x1={0} y1={0} x2={dx} y2={dy} />
  }
}
