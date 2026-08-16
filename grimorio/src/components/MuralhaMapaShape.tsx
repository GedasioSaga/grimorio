import { BaseBoxShapeUtil, SVGContainer, T, type RecordProps, type TLShape } from 'tldraw'
import { desenharMuralha } from '../lib/desenhoMuralha'
import { MURALHA_LARGURA_PADRAO, MURALHA_ALTURA_PADRAO } from '../lib/muralhaMapa'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'muralha-mapa': {
      w: number
      h: number
    }
  }
}

export type MuralhaMapaShapeType = TLShape<'muralha-mapa'>

/**
 * Muralha do mapa: contorno externo que cerca o conjunto — ver `lib/muralhaMapa.ts`.
 * Caixa simples (`BaseBoxShapeUtil`, mesma família de `CorredorMapaShapeUtil`): nasce
 * grande o bastante para o usuário arrastar por cima de uma planta pequena, e redimensiona
 * como qualquer caixa até cercar a planta real.
 */
export class MuralhaMapaShapeUtil extends BaseBoxShapeUtil<MuralhaMapaShapeType> {
  static override type = 'muralha-mapa' as const

  static override props: RecordProps<MuralhaMapaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
  }

  getDefaultProps(): MuralhaMapaShapeType['props'] {
    return { w: MURALHA_LARGURA_PADRAO, h: MURALHA_ALTURA_PADRAO }
  }

  component(shape: MuralhaMapaShapeType) {
    const { w, h } = shape.props
    return <SVGContainer>{desenharMuralha({ w, h })}</SVGContainer>
  }

  indicator(shape: MuralhaMapaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
