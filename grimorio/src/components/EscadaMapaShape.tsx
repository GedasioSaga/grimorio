import { BaseBoxShapeUtil, SVGContainer, T, type RecordProps, type TLShape } from 'tldraw'
import { desenharEscada } from '../lib/desenhoEscada'
import { ESCADA_LARGURA_PADRAO, ESCADA_ALTURA_PADRAO } from '../lib/escadaMapa'
import { atenderDuploClique } from '../lib/duploCliqueMapa'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'escada-mapa': {
      w: number
      h: number
    }
  }
}

export type EscadaMapaShapeType = TLShape<'escada-mapa'>

/**
 * Escada do mapa: shape próprio, mesma família de `CorredorMapaShapeUtil` — caixa simples,
 * sem estado nem rótulo. Substitui a versão anterior (grupo de retângulos `geo` nativos
 * criado por `criarEscada` em `MapaToolbar.tsx`): ver `lib/escadaMapa.ts` para o porquê.
 */
export class EscadaMapaShapeUtil extends BaseBoxShapeUtil<EscadaMapaShapeType> {
  static override type = 'escada-mapa' as const

  static override props: RecordProps<EscadaMapaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
  }

  getDefaultProps(): EscadaMapaShapeType['props'] {
    return { w: ESCADA_LARGURA_PADRAO, h: ESCADA_ALTURA_PADRAO }
  }

  /** Ver `atenderDuploClique`: sem isto, todo duplo clique nesta peça larga um texto vazio no mapa. */
  override onDoubleClick = atenderDuploClique

  component(shape: EscadaMapaShapeType) {
    const { w, h } = shape.props
    return <SVGContainer>{desenharEscada({ w, h })}</SVGContainer>
  }

  indicator(shape: EscadaMapaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
