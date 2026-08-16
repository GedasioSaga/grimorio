import { BaseBoxShapeUtil, SVGContainer, T, type RecordProps, type TLShape } from 'tldraw'
import { desenharTorre } from '../lib/desenhoTorre'
import { TORRE_DIAMETRO_PADRAO } from '../lib/torreMapa'

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

  component(shape: TorreMapaShapeType) {
    const { w, h } = shape.props
    return <SVGContainer>{desenharTorre({ w, h })}</SVGContainer>
  }

  indicator(shape: TorreMapaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
