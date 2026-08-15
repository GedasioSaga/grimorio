import { BaseBoxShapeUtil, SVGContainer, T, type RecordProps, type TLShape } from 'tldraw'
import { ESPESSURA_CONTORNO_SALA, aparenciaDaSala, quebrarRotulo } from '../lib/salaMapa'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'sala-mapa': {
      w: number
      h: number
      /** 'pendente' | 'limpa' | 'sem-info' — ver lib/salaMapa.ts */
      estado: string
      /** nome do cômodo, escrito dentro da própria sala */
      rotulo: string
      /** cor escolhida à mão; vazio significa "usar a cor do estado" */
      cor: string
    }
  }
}

export type SalaMapaShapeType = TLShape<'sala-mapa'>

export const SALA_LARGURA_PADRAO = 160
export const SALA_ALTURA_PADRAO = 112

/** Corpo do nome do cômodo, em px de página. */
const FONTE_ROTULO = 12
const ENTRELINHA = 14

/**
 * Sala do mapa: retângulo preenchido com a cor do ESTADO e o nome do cômodo escrito
 * dentro dela.
 *
 * O nome mora na sala em vez de ser um texto solto por cima porque é assim nas
 * referências — e porque texto solto desalinha na primeira vez que a sala é movida ou
 * redimensionada. Quebra em várias linhas quando a sala é estreita ("Sala do Depósito
 * Seguro"), com a conta em `quebrarRotulo` (lib pura, testada).
 *
 * A cor sai de `aparenciaDaSala`, também pura: vermelho é pendência, azul é limpo,
 * escuro é sem informação. Trocar o estado é o gesto mais repetido no uso real, então
 * ele fica no painel de propriedades, a um clique.
 */
export class SalaMapaShapeUtil extends BaseBoxShapeUtil<SalaMapaShapeType> {
  static override type = 'sala-mapa' as const

  static override props: RecordProps<SalaMapaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    estado: T.string,
    rotulo: T.string,
    cor: T.string,
  }

  getDefaultProps(): SalaMapaShapeType['props'] {
    return { w: SALA_LARGURA_PADRAO, h: SALA_ALTURA_PADRAO, estado: 'pendente', rotulo: '', cor: '' }
  }

  component(shape: SalaMapaShapeType) {
    const { w, h, estado, rotulo, cor } = shape.props
    const aparencia = aparenciaDaSala(estado, cor || undefined)
    const linhas = quebrarRotulo(rotulo, w, FONTE_ROTULO)
    const alturaTexto = linhas.length * ENTRELINHA
    const primeiraLinhaY = h / 2 - alturaTexto / 2 + ENTRELINHA / 2

    return (
      <SVGContainer>
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          fill={aparencia.preenchimento}
          stroke={aparencia.contorno}
          strokeWidth={ESPESSURA_CONTORNO_SALA}
        />
        {linhas.map((linha, i) => (
          <text
            key={i}
            x={w / 2}
            y={primeiraLinhaY + i * ENTRELINHA}
            fill={aparencia.texto}
            fontSize={FONTE_ROTULO}
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {linha}
          </text>
        ))}
      </SVGContainer>
    )
  }

  indicator(shape: SalaMapaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
