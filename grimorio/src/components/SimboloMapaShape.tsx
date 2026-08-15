import { BaseBoxShapeUtil, SVGContainer, T, type RecordProps, type TLShape } from 'tldraw'
import { definicaoDoSimbolo } from '../lib/simbolosMapa'

// tldraw 4.x: shapes customizados entram no union TLShape via augmentation do
// TLGlobalShapePropsMap (mesmo padrão de CharacterCardShape.tsx e PortaShape.tsx).
declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'simbolo-mapa': {
      w: number
      h: number
      /** qual símbolo desenhar — ver SimboloId em lib/simbolosMapa.ts */
      simbolo: string
      /** texto do símbolo numerado (marcador); vazio nos demais */
      rotulo: string
    }
  }
}

export type SimboloMapaShapeType = TLShape<'simbolo-mapa'>

/** Paleta fixa dos símbolos — ver o porquê de não usar o StylePanel em simbolosMapa.ts. */
const CORES = {
  fundoEscuro: '#0d0d0d',
  vidro: '#4dabf7',
  segredoFundo: '#2a1b3d',
  segredoTraco: '#c77dff',
  perigo: '#e03131',
  referencia: '#f2c94c',
  madeira: '#6a5a48',
  madeiraTraco: '#a08d72',
} as const

/**
 * Símbolos desenhados do mapa: janela, passagem secreta, armadilha, marcador numerado,
 * mesa, cama e baú — todos num ShapeUtil só, escolhidos pela prop `simbolo`.
 *
 * O desenho é feito em coordenadas do próprio shape (0..w, 0..h), então redimensionar
 * funciona de graça: o `BaseBoxShapeUtil` cuida da caixa e cada traço acompanha.
 *
 * Símbolo desconhecido (forma vinda de um arquivo editado à mão, ou de uma versão futura
 * do app) NÃO some nem quebra a tela: cai num retângulo tracejado neutro, para o usuário
 * ver que há algo ali e poder apagar.
 */
export class SimboloMapaShapeUtil extends BaseBoxShapeUtil<SimboloMapaShapeType> {
  static override type = 'simbolo-mapa' as const

  static override props: RecordProps<SimboloMapaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    simbolo: T.string,
    rotulo: T.string,
  }

  getDefaultProps(): SimboloMapaShapeType['props'] {
    return { w: 40, h: 40, simbolo: 'marcador', rotulo: '' }
  }

  component(shape: SimboloMapaShapeType) {
    const { w, h, simbolo, rotulo } = shape.props
    return <SVGContainer>{desenharSimbolo(simbolo, w, h, rotulo)}</SVGContainer>
  }

  indicator(shape: SimboloMapaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

function desenharSimbolo(simbolo: string, w: number, h: number, rotulo: string) {
  switch (simbolo) {
    /** vão de parede com vidro: moldura + a linha do vidro no meio */
    case 'janela':
      return (
        <>
          <rect x={0} y={0} width={w} height={h} fill={CORES.fundoEscuro} stroke={CORES.vidro} strokeWidth={2} />
          <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={CORES.vidro} strokeWidth={2} />
        </>
      )

    /** parede falsa: bloco escuro com "S" — some no mapa dos jogadores, salta pro mestre */
    case 'secreta':
      return (
        <>
          <rect
            x={0}
            y={0}
            width={w}
            height={h}
            fill={CORES.segredoFundo}
            stroke={CORES.segredoTraco}
            strokeWidth={2}
          />
          <text
            x={w / 2}
            y={h / 2}
            fill={CORES.segredoTraco}
            fontSize={Math.min(w, h) * 0.8}
            fontFamily="Georgia, serif"
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="central"
          >
            S
          </text>
        </>
      )

    /** losango cheio com "!": perigo se lê de relance mesmo com o mapa reduzido */
    case 'armadilha':
      return (
        <>
          <path d={`M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`} fill={CORES.perigo} />
          <text
            x={w / 2}
            y={h / 2}
            fill={CORES.fundoEscuro}
            fontSize={Math.min(w, h) * 0.55}
            fontWeight={800}
            textAnchor="middle"
            dominantBaseline="central"
          >
            !
          </text>
        </>
      )

    /** círculo cheio com o número: amarra o ponto do mapa à anotação escrita */
    case 'marcador':
      return (
        <>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={CORES.referencia} />
          <text
            x={w / 2}
            y={h / 2}
            fill={CORES.fundoEscuro}
            fontSize={Math.min(w, h) * 0.5}
            fontWeight={800}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {rotulo}
          </text>
        </>
      )

    case 'mesa':
      return <rect x={0} y={0} width={w} height={h} rx={2} fill={CORES.madeira} stroke={CORES.madeiraTraco} strokeWidth={1.5} />

    /** cama: bloco + a linha do travesseiro, que é o que a distingue de uma mesa */
    case 'cama':
      return (
        <>
          <rect x={0} y={0} width={w} height={h} rx={2} fill={CORES.madeira} stroke={CORES.madeiraTraco} strokeWidth={1.5} />
          <line x1={0} y1={h * 0.28} x2={w} y2={h * 0.28} stroke={CORES.madeiraTraco} strokeWidth={1.5} />
        </>
      )

    /** baú: bloco + tampa e o risco do fecho */
    case 'bau':
      return (
        <>
          <rect x={0} y={0} width={w} height={h} rx={2} fill={CORES.madeira} stroke={CORES.madeiraTraco} strokeWidth={1.5} />
          <line x1={0} y1={h * 0.35} x2={w} y2={h * 0.35} stroke={CORES.madeiraTraco} strokeWidth={1.5} />
          <rect x={w / 2 - 2} y={h * 0.35} width={4} height={h * 0.25} fill={CORES.madeiraTraco} />
        </>
      )

    default:
      return (
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          fill="none"
          stroke={CORES.madeiraTraco}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )
  }
}

/** Tamanho de nascença do símbolo, para quem cria a forma. */
export function tamanhoDoSimbolo(id: string): { w: number; h: number } {
  const definicao = definicaoDoSimbolo(id)
  return { w: definicao?.largura ?? 40, h: definicao?.altura ?? 40 }
}
