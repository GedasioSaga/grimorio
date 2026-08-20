import {
  BaseBoxShapeUtil,
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence, SVGContainer, T, type RecordProps, type TLShape } from 'tldraw'
import { desenharEscada } from '../lib/desenhoEscada'
import { ESCADA_LARGURA_PADRAO, ESCADA_ALTURA_PADRAO } from '../lib/escadaMapa'
import { atenderDuploClique } from '../lib/duploCliqueMapa'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'escada-mapa': {
      w: number
      h: number
      /** cor escolhida à mão; vazio = a cor padrão da peça */
      cor: string
      /** desenha a linha de contorno? */
      contorno: boolean
      /** '' = decide pelo lado maior; 'h' = degraus na horizontal; 'v' = na vertical */
      degraus: string
    }
  }
}

export type EscadaMapaShapeType = TLShape<'escada-mapa'>

/**
 * Escada do mapa: shape próprio, mesma família de `CorredorMapaShapeUtil` — caixa simples,
 * sem estado nem rótulo. Substitui a versão anterior (grupo de retângulos `geo` nativos
 * criado por `criarEscada` em `MapaToolbar.tsx`): ver `lib/escadaMapa.ts` para o porquê.
 */

/**
 * A peça nasceu sem propriedade nenhuma e ganhou cor e contorno depois — sem migração o tldraw
 * recusa o documento INTEIRO ao validar mapa antigo contra o schema novo.
 */
const versoes = createShapePropsMigrationIds('escada-mapa', {
  AdicionaAparencia: 1,
})

export class EscadaMapaShapeUtil extends BaseBoxShapeUtil<EscadaMapaShapeType> {
  static override type = 'escada-mapa' as const

  static override props: RecordProps<EscadaMapaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    cor: T.string,
    contorno: T.boolean,
    degraus: T.string,
  }

  static override migrations = createShapePropsMigrationSequence({
    sequence: [
      {
        // sobe com o padrão que a peça SEMPRE desenhou: mapa antigo reabre idêntico.
        id: versoes.AdicionaAparencia,
        up(props) {
          if (props.cor === undefined) props.cor = ''
          if (props.contorno === undefined) props.contorno = true
          if (props.degraus === undefined) props.degraus = ''
        },
        down(props) {
          delete props.cor
          delete props.contorno
          delete props.degraus
        },
      },
    ],
  })

  getDefaultProps(): EscadaMapaShapeType['props'] {
    return { w: ESCADA_LARGURA_PADRAO, h: ESCADA_ALTURA_PADRAO, cor: '', contorno: true, degraus: '' }
  }

  /** Ver `atenderDuploClique`: sem isto, todo duplo clique nesta peça larga um texto vazio no mapa. */
  override onDoubleClick = atenderDuploClique

  component(shape: EscadaMapaShapeType) {
    const { w, h, cor, contorno, degraus } = shape.props
    return <SVGContainer>{desenharEscada({
          w,
          h,
          cor,
          contorno,
          degrausHorizontais: degraus === 'h' ? true : degraus === 'v' ? false : undefined,
        })}</SVGContainer>
  }

  indicator(shape: EscadaMapaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
