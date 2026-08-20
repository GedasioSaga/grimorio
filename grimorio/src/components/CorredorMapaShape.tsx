import {
  BaseBoxShapeUtil,
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence, SVGContainer,
  T,
  useEditor,
  useValue,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { desenharCorredor } from '../lib/desenhoCorredor'
import { atenderDuploClique } from '../lib/duploCliqueMapa'
import { vaosPorAresta } from '../lib/ancoraPortaEditor'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'corredor-mapa': {
      w: number
      h: number
      /** cor escolhida à mão; vazio = a cor padrão da peça */
      cor: string
      /** desenha a linha de contorno? */
      contorno: boolean
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

/**
 * A peça nasceu sem propriedade nenhuma e ganhou cor e contorno depois — sem migração o tldraw
 * recusa o documento INTEIRO ao validar mapa antigo contra o schema novo.
 */
const versoes = createShapePropsMigrationIds('corredor-mapa', {
  AdicionaAparencia: 1,
})

export class CorredorMapaShapeUtil extends BaseBoxShapeUtil<CorredorMapaShapeType> {
  static override type = 'corredor-mapa' as const

  static override props: RecordProps<CorredorMapaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    cor: T.string,
    contorno: T.boolean,
  }

  static override migrations = createShapePropsMigrationSequence({
    sequence: [
      {
        // sobe com o padrão que a peça SEMPRE desenhou: mapa antigo reabre idêntico.
        id: versoes.AdicionaAparencia,
        up(props) {
          if (props.cor === undefined) props.cor = ''
          if (props.contorno === undefined) props.contorno = true
        },
        down(props) {
          delete props.cor
          delete props.contorno
        },
      },
    ],
  })

  getDefaultProps(): CorredorMapaShapeType['props'] {
    return { w: CORREDOR_LARGURA_PADRAO, h: CORREDOR_ALTURA_PADRAO, cor: '', contorno: true }
  }

  /** Ver `atenderDuploClique`: sem isto, todo duplo clique nesta peça larga um texto vazio no mapa. */
  override onDoubleClick = atenderDuploClique

  component(shape: CorredorMapaShapeType) {
    return <CorpoCorredor shape={shape} />
  }

  indicator(shape: CorredorMapaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

/**
 * Sub-componente porque precisa de hook: ler os vãos das portas ancoradas exige `useValue`,
 * e `component()` da shapeUtil é chamado em contexto onde o padrão do projeto é delegar
 * (mesmo desenho de `CorpoSala`).
 *
 * Sem isto a peça desenhava a parede inteira por cima da porta: ela ancorava, girava e
 * seguia a parede, e a planta continuava afirmando passagem fechada.
 */
function CorpoCorredor({ shape }: { shape: CorredorMapaShapeType }) {
  const { w, h, cor, contorno } = shape.props
  const editor = useEditor()
  const vaos = useValue('vaos-de-porta', () => vaosPorAresta(editor, shape.id), [editor, shape.id])
  return <SVGContainer>{desenharCorredor({ w, h, cor, contorno, vaos })}</SVGContainer>
}
