import { BaseBoxShapeUtil, Ellipse2d, SVGContainer, T, type RecordProps, type TLShape } from 'tldraw'
import { desenharTorre } from '../lib/desenhoTorre'
import { TORRE_DIAMETRO_PADRAO } from '../lib/torreMapa'
import { atenderDuploClique } from '../lib/duploCliqueMapa'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'torre-mapa': {
      w: number
      h: number
    }
  }
}

export type TorreMapaShapeType = TLShape<'torre-mapa'>

/**
 * Torre do mapa: círculo que marca um canto da muralha — ver `lib/torreMapa.ts`. Nasce
 * pequena, no canto da viewport; o usuário arrasta e sobrepõe ao canto da muralha (a
 * muralha é redimensionável e livre, então não há canto fixo para nascer encaixada).
 */
export class TorreMapaShapeUtil extends BaseBoxShapeUtil<TorreMapaShapeType> {
  static override type = 'torre-mapa' as const

  static override props: RecordProps<TorreMapaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
  }

  getDefaultProps(): TorreMapaShapeType['props'] {
    return { w: TORRE_DIAMETRO_PADRAO, h: TORRE_DIAMETRO_PADRAO }
  }

  /**
   * A torre é REDONDA, então a área clicável também tem que ser.
   *
   * `BaseBoxShapeUtil.getGeometry` devolve um `Rectangle2d` da caixa inteira, e os quatro
   * cantos que sobram fora do círculo são 21% da área (1 − π/4). Isso seria detalhe se a
   * torre morasse sozinha no meio do mapa — só que `lib/torreMapa.ts` documenta o oposto:
   * ela existe para ser SOBREPOSTA ao canto da muralha. Ou seja, os cantos mortos da caixa
   * caem exatamente em cima da parede, e clicar na parede perto de uma torre selecionava a
   * torre. Nas plantas com torre nos quatro cantos, isso é toda a esquina do contorno.
   *
   * `isFilled: true` continua certo — a torre é um cômodo redondo preenchido
   * (`desenhoTorre.tsx`), não um anel: o miolo dela deve mesmo capturar o clique. O que
   * estava errado era a FORMA da área, não o preenchimento dela.
   *
   * Elipse e não círculo porque `w` e `h` são independentes: `BaseBoxShapeUtil` deixa
   * redimensionar os dois eixos, e o desenho já acompanha com `rx`/`ry` separados.
   */
  override getGeometry(shape: TorreMapaShapeType) {
    return new Ellipse2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }

  /** Ver `atenderDuploClique`: sem isto, todo duplo clique nesta peça larga um texto vazio no mapa. */
  override onDoubleClick = atenderDuploClique

  component(shape: TorreMapaShapeType) {
    const { w, h } = shape.props
    return <SVGContainer>{desenharTorre({ w, h })}</SVGContainer>
  }

  // o contorno de seleção segue a peça: um retângulo em volta de um círculo dizia ao
  // usuário que a área dele era a caixa — a mesma mentira que a hitbox contava.
  indicator(shape: TorreMapaShapeType) {
    const { w, h } = shape.props
    return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} />
  }
}
