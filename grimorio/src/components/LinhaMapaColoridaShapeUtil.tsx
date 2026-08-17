import {
  LineShapeUtil,
  PathBuilder,
  SVGContainer,
  STROKE_SIZES,
  sortByIndex,
  Vec,
  type TLLineShape,
} from 'tldraw'
import { COR_LINHA_PADRAO } from '../lib/coresLinha'
import { cantoDeMeta, tracadoDoCanto } from '../lib/cantosMapa'

/**
 * Cor da linha nativa do tldraw (`Divisória`, e a ferramenta "Linha" da toolbar — as duas
 * criam o mesmo tipo `line`), sobrepondo `LineShapeUtil` só na COR.
 *
 * ARMADILHA JÁ PAGA (ver o cabeçalho de `salaMapa.ts`, `CONTORNO_SALA`): existiu um shape
 * de linha próprio deste projeto (`linha-mapa`, hoje só um cadáver mantido por
 * compatibilidade — ver `LinhaMapaShape.tsx`) e ele foi abandonado porque esticar sem o
 * comportamento nativo do tldraw ficava imprevisível. Por isso esta versão NÃO reimplementa
 * a linha: ela ESTENDE `LineShapeUtil` e herda geometria, alças, resize, snap e migração
 * exatamente como estão — só troca o desenho.
 *
 * Por que a cor não é `props.color`: `DefaultColorStyle` é uma paleta FECHADA de 13 nomes
 * (`@tldraw/tlschema/src/styles/TLColorStyle.ts:23-37`), validada em runtime por
 * `T.literalEnum(...)` — um hex ali é rejeitado pelo schema do store antes de chegar à
 * tela (confirmado em `StyleProp.ts:119`, `EnumStyleProp` usa exatamente esse validador).
 * Também não dá para estender `props` com um campo novo (`corPersonalizada: T.string`)
 * PORQUE o `type` continua `'line'`: o STORE (`createTLStore({shapeUtils})`) recusa dois
 * shapeUtils com o mesmo `type` (`defaultShapes.ts:25-27`, `checkShapesAndAddCore`), então
 * o override do editor (`shapeUtils` do `<Tldraw>`, que troca por `type` via
 * `mergeArraysAndReplaceDefaults`) e o schema do STORE (`shapeUtilsDoStore`, que não tem
 * esse mecanismo) discordariam — o `MapaView` já filtra a `LineShapeUtil` nativa de
 * `shapeUtilsDoStore` para este arquivo tomar o lugar dela (ver o comentário lá).
 *
 * A cor mora em `shape.meta.corPersonalizada` (string hex) — sem entrar na prop, ela não
 * exige migração de shape nem toca o schema: `meta` já é lida como objeto livre neste app
 * (`meta.camada`/`meta.peca`/`meta.decorativo`), e mapas salvos ANTES desta leva (linhas
 * sem `corPersonalizada`) continuam válidos, caindo em `COR_LINHA_PADRAO`.
 *
 * `component()`/`toSvg()` são reescritos porque a cor entra como valor literal no atributo
 * `stroke` do SVG — CSS não serviria: a exportação PNG/SVG (`getSvgJsx.tsx`) re-renderiza
 * os shapes por outro caminho e não carrega o CSS da página (mesmo motivo documentado em
 * `LinhaMapaShape.tsx`). O resto (`getGeometry`, `getHandles`, `onHandleDrag`, `onResize`,
 * `indicator`…) fica como está em `LineShapeUtil` — não são sobrescritos aqui.
 */
export class LinhaMapaColoridaShapeUtil extends LineShapeUtil {
  override component(shape: TLLineShape) {
    return (
      <SVGContainer style={{ minWidth: 50, minHeight: 50 }}>
        {desenharCaminhoDaLinha(shape, { escalar: 1 })}
      </SVGContainer>
    )
  }

  override toSvg(shape: TLLineShape) {
    // mesma matemática de `LineShapeUtil`'s `LineShapeSvg({shouldScale: true})`: a
    // exportação já aplica a escala do shape num wrapper próprio, então o path aqui
    // precisa DESFAZER a escala (1/scale) para não escalar duas vezes.
    return desenharCaminhoDaLinha(shape, { escalar: 1 / shape.props.scale })
  }
}

function pontosOrdenados(shape: TLLineShape) {
  return Object.values(shape.props.points)
    .sort(sortByIndex)
    .map((p) => new Vec(p.x, p.y))
}

function caminhoDaLinha(shape: TLLineShape) {
  const pontos = pontosOrdenados(shape)
  return shape.props.spline === 'cubic'
    ? PathBuilder.cubicSplineThroughPoints(pontos, { endOffsets: 0 })
    : PathBuilder.lineThroughPoints(pontos, { endOffsets: 0 })
}

function desenharCaminhoDaLinha(shape: TLLineShape, { escalar }: { escalar: number }) {
  const { dash, size, scale } = shape.props
  const strokeWidth = STROKE_SIZES[size] * scale
  const meta = shape.meta as Record<string, unknown>
  const cor = typeof meta.corPersonalizada === 'string' && meta.corPersonalizada ? meta.corPersonalizada : COR_LINHA_PADRAO
  // ponta/quina do traço: mesma escolha "reto ou arredondado" do retângulo — ver `cantosMapa.ts`.
  const { strokeLinecap, strokeLinejoin } = tracadoDoCanto(cantoDeMeta(shape.meta))

  return caminhoDaLinha(shape).toSvg({
    style: dash,
    strokeWidth,
    randomSeed: shape.id,
    props: {
      transform: `scale(${escalar})`,
      stroke: cor,
      fill: 'none',
      strokeLinecap,
      strokeLinejoin,
    },
  })
}
