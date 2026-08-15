import {
  getIndices,
  maybeSnapToGrid,
  Polygon2d,
  ShapeUtil,
  SVGContainer,
  T,
  Vec,
  type IndexKey,
  type RecordProps,
  type TLHandle,
  type TLHandleDragInfo,
  type TLShape,
} from 'tldraw'
import { desenharCorpoSalaPoligono } from '../lib/desenhoSalaPoligono'
import { PONTOS_SALA_POLIGONO_PADRAO, type PontoPoligono } from '../lib/salaPoligonoMapa'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'sala-poligono-mapa': {
      pontos: PontoPoligono[]
      /** 'pendente' | 'limpa' | 'sem-info' — ver lib/salaMapa.ts */
      estado: string
      /** nome do cômodo, escrito no centro do polígono */
      rotulo: string
      /** cor escolhida à mão; vazio significa "usar a cor do estado" */
      cor: string
    }
  }
}

export type SalaPoligonoMapaShapeType = TLShape<'sala-poligono-mapa'>

const validadorPonto = T.object({ x: T.number, y: T.number })

/**
 * Sala em polígono: mesma semântica de estado/cor/rótulo da sala retangular
 * (`aparenciaDaSala`, reaproveitada em `desenhoSalaPoligono.tsx`), mas com N vértices
 * arrastáveis em vez de w/h.
 *
 * Por que existe: a sala retangular (`SalaMapaShape.tsx`) já documentava o preço da
 * própria forma — "forma irregular se compõe com salas encostadas". Compor um cômodo em L
 * com dois ou três retângulos deixa emenda de contorno visível na junção (cada retângulo
 * desenha o PRÓPRIO contorno) e obriga o mestre a realinhar as peças toda vez que move
 * uma. Um polígono de peça única resolve as duas coisas: um contorno só, e mover a forma
 * inteira move um shape, não um grupo frágil.
 *
 * Não estende `BaseBoxShapeUtil` (que é sempre uma caixa w/h) porque aqui os VÉRTICES são
 * a geometria — não há w/h independente dos pontos. Padrão de handle copiado do
 * `LineShapeUtil` nativo do tldraw
 * (node_modules/tldraw/src/lib/shapes/line/LineShapeUtil.tsx:77-163): vértice arrastável
 * com `maybeSnapToGrid`, a MESMA função que a ferramenta de linha usa para encaixar na
 * grade — por isso "o snap à grade do mapa é aliado" também aqui.
 *
 * Vértices são em quantidade FIXA (a lista de nascença, `PONTOS_SALA_POLIGONO_PADRAO`) —
 * sem handle "create" para inserir vértice no meio de uma aresta, ao contrário da linha
 * nativa. Reduz a superfície da primeira versão a "arrastar para reformar", que já cobre
 * L, T, e qualquer polígono simples; adicionar/remover vértice fica para quando pedirem.
 */
export class SalaPoligonoMapaShapeUtil extends ShapeUtil<SalaPoligonoMapaShapeType> {
  static override type = 'sala-poligono-mapa' as const

  static override props: RecordProps<SalaPoligonoMapaShapeType> = {
    pontos: T.arrayOf(validadorPonto),
    estado: T.string,
    rotulo: T.string,
    cor: T.string,
  }

  getDefaultProps(): SalaPoligonoMapaShapeType['props'] {
    return { pontos: PONTOS_SALA_POLIGONO_PADRAO, estado: 'sem-info', rotulo: '', cor: '' }
  }

  // sem alça de redimensionar: a única forma de mudar a geometria é arrastando vértice
  // (mesma escolha da linha nativa, LineShapeUtil.ts:39) — um "resize" de caixa não faz
  // sentido para um polígono arbitrário, e sem `onResize` a alça ficaria ali sem efeito.
  override hideResizeHandles() {
    return true
  }
  override hideSelectionBoundsFg() {
    return true
  }
  override hideSelectionBoundsBg() {
    return true
  }

  getGeometry(shape: SalaPoligonoMapaShapeType) {
    return new Polygon2d({
      points: shape.props.pontos.map((p) => new Vec(p.x, p.y)),
      isFilled: true,
    })
  }

  override getHandles(shape: SalaPoligonoMapaShapeType): TLHandle[] {
    const indices = getIndices(shape.props.pontos.length)
    return shape.props.pontos.map((p, i) => ({
      id: `vertice-${i}`,
      type: 'vertex',
      index: indices[i] as IndexKey,
      x: p.x,
      y: p.y,
      canSnap: true,
    }))
  }

  override onHandleDrag(shape: SalaPoligonoMapaShapeType, { handle }: TLHandleDragInfo<SalaPoligonoMapaShapeType>) {
    const indice = Number(handle.id.replace('vertice-', ''))
    if (!Number.isInteger(indice) || indice < 0 || indice >= shape.props.pontos.length) return

    const ponto = maybeSnapToGrid(new Vec(handle.x, handle.y), this.editor)
    const pontos = shape.props.pontos.map((p, i) => (i === indice ? { x: ponto.x, y: ponto.y } : p))

    return { ...shape, props: { ...shape.props, pontos } }
  }

  component(shape: SalaPoligonoMapaShapeType) {
    const { pontos, estado, rotulo, cor } = shape.props
    return <SVGContainer>{desenharCorpoSalaPoligono({ pontos, estado, rotulo, cor })}</SVGContainer>
  }

  indicator(shape: SalaPoligonoMapaShapeType) {
    return <polygon points={shape.props.pontos.map((p) => `${p.x},${p.y}`).join(' ')} />
  }
}
