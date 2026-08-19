import {
  BaseBoxShapeUtil,
  SVGContainer,
  T,
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
  type RecordProps,
  type TLShape,
} from 'tldraw'
// estado e cor da porta vivem na lib pura, como os da sala — ver o cabeçalho de portaMapa.ts
import { PORTA_ESPESSURA_PADRAO, PORTA_LARGURA_PADRAO } from '../lib/portaMapa'
import { desenharPorta } from '../lib/desenhoPorta'
import { atenderDuploClique } from '../lib/duploCliqueMapa'

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
/**
 * A porta trocou `props.cor` por `props.estado` (`ac39c40`) sem migração nenhuma, e o
 * validador de objeto do tldraw reprova nos DOIS sentidos: falta `estado` e sobra `cor`.
 * Resultado numa porta gravada no formato velho: `loadSnapshot` estoura, `useDocumentoTldraw`
 * cai no catch e o MAPA INTEIRO abre como "arquivo com erro" — não é a porta que se perde,
 * é o documento.
 */
const versoes = createShapePropsMigrationIds('porta-mapa', {
  CorViraEstado: 1,
})

export class PortaShapeUtil extends BaseBoxShapeUtil<PortaShapeType> {
  static override type = 'porta-mapa' as const

  static override props: RecordProps<PortaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    estado: T.string,
  }

  static override migrations = createShapePropsMigrationSequence({
    sequence: [
      {
        /**
         * Os dois guards existem por causa de uma armadilha desta migração ser a PRIMEIRA
         * da porta: documento salvo antes de existir sequência nenhuma não tem entrada em
         * `sequences`, então TODA porta já gravada — inclusive as de hoje, com `estado`
         * certo — conta como versão 0 e passa por aqui. Um `props.estado = 'livre'` cego
         * destrancaria todas as portas de todos os mapas do cofre, de uma vez, no primeiro
         * abrir. O `undefined` limita o degrau a quem de fato não tem o campo.
         *
         * A `cor` velha não vira estado: ela era um hex copiado da sala embaixo (o truque
         * que a versão de vão+jambas usava para fingir o buraco na parede), não uma escolha
         * de trancada/livre. Não há informação ali para preservar — 'livre' é o mesmo
         * padrão de `getDefaultProps`, e o mestre corrige no painel quando reparar.
         */
        id: versoes.CorViraEstado,
        up(props) {
          delete props.cor
          if (props.estado === undefined) props.estado = 'livre'
        },
        down(props) {
          delete props.estado
        },
      },
    ],
  })

  getDefaultProps(): PortaShapeType['props'] {
    return { w: PORTA_LARGURA_PADRAO, h: PORTA_ESPESSURA_PADRAO, estado: 'livre' }
  }

  /** Ver `atenderDuploClique`: sem isto, todo duplo clique nesta peça larga um texto vazio no mapa. */
  override onDoubleClick = atenderDuploClique

  component(shape: PortaShapeType) {
    const { w, h, estado } = shape.props
    return <SVGContainer>{desenharPorta({ w, h, estado })}</SVGContainer>
  }

  indicator(shape: PortaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
