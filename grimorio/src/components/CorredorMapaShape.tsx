import { BaseBoxShapeUtil, SVGContainer, T, type RecordProps, type TLShape } from 'tldraw'
import { desenharCorredor } from '../lib/desenhoCorredor'
import { atenderDuploClique } from '../lib/duploCliqueMapa'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'corredor-mapa': {
      w: number
      h: number
    }
  }
}

export type CorredorMapaShapeType = TLShape<'corredor-mapa'>

/** Nasce comprido e estreito — um trecho de passagem, não um cômodo. O usuário
 * redimensiona (arrastando as alças) para o comprimento e a largura reais do caminho. */
export const CORREDOR_LARGURA_PADRAO = 140
export const CORREDOR_ALTURA_PADRAO = 40

/**
 * Corredor do mapa: um retângulo simples, sem estado nem rótulo — ver `lib/corredorMapa.ts`
 * para o porquê. `BaseBoxShapeUtil` (mesmo padrão de `PortaShape.tsx`) porque é só uma
 * caixa: sem vértice, sem vínculo, sem badge.
 */
export class CorredorMapaShapeUtil extends BaseBoxShapeUtil<CorredorMapaShapeType> {
  static override type = 'corredor-mapa' as const

  static override props: RecordProps<CorredorMapaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
  }

  getDefaultProps(): CorredorMapaShapeType['props'] {
    return { w: CORREDOR_LARGURA_PADRAO, h: CORREDOR_ALTURA_PADRAO }
  }

  /** Ver `atenderDuploClique`: sem isto, todo duplo clique nesta peça larga um texto vazio no mapa. */
  override onDoubleClick = atenderDuploClique

  component(shape: CorredorMapaShapeType) {
    const { w, h } = shape.props
    return <SVGContainer>{desenharCorredor({ w, h })}</SVGContainer>
  }

  indicator(shape: CorredorMapaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
