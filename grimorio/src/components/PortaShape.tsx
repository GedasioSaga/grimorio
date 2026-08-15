import { BaseBoxShapeUtil, SVGContainer, T, type RecordProps, type TLShape } from 'tldraw'
// estado e cor da porta vivem na lib pura, como os da sala — ver o cabeçalho de portaMapa.ts
import { PORTA_ESPESSURA_PADRAO, PORTA_LARGURA_PADRAO, aparenciaDaPorta } from '../lib/portaMapa'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'porta-mapa': {
      w: number
      h: number
      /** 'livre' | 'trancada' | 'atencao' */
      estado: string
    }
  }
}

export type PortaShapeType = TLShape<'porta-mapa'>

/**
 * Porta do mapa: uma BARRA COLORIDA atravessada na parede, e a cor diz se você passa.
 *
 * A primeira versão desenhava vão + jambas + arco de abertura, a convenção de planta
 * arquitetônica. Estava tecnicamente correta e errada de propósito: as referências do
 * usuário são mapas de JOGO, onde a porta não descreve a construção, informa o estado —
 * azul passa, vermelho está trancada. Trocar a convenção também eliminou a parte mais
 * frágil do código anterior, que copiava a cor da sala embaixo para fingir o buraco.
 *
 * Sem `onBeforeCreate`/`onTranslateEnd`: a cor agora vem do estado, não do que está
 * embaixo, então a porta não depende mais de onde foi solta.
 */
export class PortaShapeUtil extends BaseBoxShapeUtil<PortaShapeType> {
  static override type = 'porta-mapa' as const

  static override props: RecordProps<PortaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    estado: T.string,
  }

  getDefaultProps(): PortaShapeType['props'] {
    return { w: PORTA_LARGURA_PADRAO, h: PORTA_ESPESSURA_PADRAO, estado: 'livre' }
  }

  component(shape: PortaShapeType) {
    const { w, h, estado } = shape.props
    const { cor } = aparenciaDaPorta(estado)
    return (
      <SVGContainer>
        <rect x={0} y={0} width={w} height={h} rx={1} fill={cor} />
      </SVGContainer>
    )
  }

  indicator(shape: PortaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
