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
      return desenharItem(simbolo, w, h)
  }
}

/**
 * Itens largados pelo mapa. Desenhados na mesma linguagem sólida das peças, mas com um
 * contorno escuro por baixo: o ícone cai em cima de sala vermelha, azul ou escura, e sem
 * o contorno ele se perde no fundo em pelo menos uma delas.
 *
 * Cada desenho usa fração de `w`/`h` em vez de px fixos, para o ícone continuar correto
 * quando o usuário aumenta um item que quer destacar.
 */
function desenharItem(simbolo: string, w: number, h: number) {
  const traco = '#1a1a1a'

  switch (simbolo) {
    /** frasco de poção: cura, o item mais comum de qualquer mesa */
    case 'pocao':
      return (
        <g stroke={traco} strokeWidth={1}>
          <rect x={w * 0.38} y={h * 0.08} width={w * 0.24} height={h * 0.18} fill="#8a7b6b" />
          <path
            d={`M ${w * 0.32} ${h * 0.95} L ${w * 0.32} ${h * 0.42} L ${w * 0.42} ${h * 0.26} L ${w * 0.58} ${h * 0.26} L ${w * 0.68} ${h * 0.42} L ${w * 0.68} ${h * 0.95} Z`}
            fill="#c0392b"
          />
        </g>
      )

    /** erva: three-leaf, o verde que se lê de longe */
    case 'erva':
      return (
        <g stroke={traco} strokeWidth={0.8} fill="#2e9e5b">
          <ellipse cx={w * 0.5} cy={h * 0.28} rx={w * 0.16} ry={h * 0.22} />
          <ellipse cx={w * 0.26} cy={h * 0.58} rx={w * 0.16} ry={h * 0.22} transform={`rotate(-35 ${w * 0.26} ${h * 0.58})`} />
          <ellipse cx={w * 0.74} cy={h * 0.58} rx={w * 0.16} ry={h * 0.22} transform={`rotate(35 ${w * 0.74} ${h * 0.58})`} />
          <line x1={w * 0.5} y1={h * 0.5} x2={w * 0.5} y2={h * 0.95} stroke="#1f6e40" strokeWidth={1.4} />
        </g>
      )

    case 'chave':
      return (
        <g stroke={traco} strokeWidth={0.8} fill="#d4a017">
          <circle cx={w * 0.28} cy={h * 0.32} r={w * 0.2} />
          <circle cx={w * 0.28} cy={h * 0.32} r={w * 0.08} fill={traco} stroke="none" />
          <rect x={w * 0.4} y={h * 0.42} width={w * 0.14} height={h * 0.5} transform={`rotate(-35 ${w * 0.4} ${h * 0.42})`} />
          <rect x={w * 0.58} y={h * 0.66} width={w * 0.2} height={h * 0.12} />
        </g>
      )

    /** documento: a folha com linhas escritas, e o canto dobrado que diz "papel" */
    case 'documento':
      return (
        <g stroke={traco} strokeWidth={0.9}>
          <path
            d={`M ${w * 0.22} ${h * 0.08} L ${w * 0.62} ${h * 0.08} L ${w * 0.8} ${h * 0.28} L ${w * 0.8} ${h * 0.92} L ${w * 0.22} ${h * 0.92} Z`}
            fill="#e8dcc0"
          />
          <path d={`M ${w * 0.62} ${h * 0.08} L ${w * 0.62} ${h * 0.28} L ${w * 0.8} ${h * 0.28}`} fill="#c9bda0" />
          <g stroke="#8a7b5b" strokeWidth={0.9}>
            <line x1={w * 0.32} y1={h * 0.46} x2={w * 0.7} y2={h * 0.46} />
            <line x1={w * 0.32} y1={h * 0.6} x2={w * 0.7} y2={h * 0.6} />
            <line x1={w * 0.32} y1={h * 0.74} x2={w * 0.58} y2={h * 0.74} />
          </g>
        </g>
      )

    /** moedas empilhadas: tesouro, não uma moeda perdida */
    case 'moeda':
      return (
        <g stroke={traco} strokeWidth={0.9} fill="#d4a017">
          <ellipse cx={w * 0.5} cy={h * 0.74} rx={w * 0.34} ry={h * 0.16} />
          <ellipse cx={w * 0.5} cy={h * 0.54} rx={w * 0.34} ry={h * 0.16} />
          <ellipse cx={w * 0.5} cy={h * 0.34} rx={w * 0.34} ry={h * 0.16} fill="#e8bd3a" />
        </g>
      )

    case 'espada':
      return (
        <g stroke={traco} strokeWidth={0.9}>
          <path
            d={`M ${w * 0.5} ${h * 0.06} L ${w * 0.6} ${h * 0.24} L ${w * 0.6} ${h * 0.66} L ${w * 0.4} ${h * 0.66} L ${w * 0.4} ${h * 0.24} Z`}
            fill="#b8c0c8"
          />
          <rect x={w * 0.24} y={h * 0.66} width={w * 0.52} height={h * 0.1} fill="#8a6a3a" />
          <rect x={w * 0.44} y={h * 0.76} width={w * 0.12} height={h * 0.2} fill="#6a4a26" />
        </g>
      )

    /** flechas: munição em linguagem de RPG, não cartucho */
    case 'municao':
      return (
        <g stroke="#b07a3a" strokeWidth={Math.max(1, w * 0.07)} strokeLinecap="round">
          <line x1={w * 0.2} y1={h * 0.85} x2={w * 0.72} y2={h * 0.2} />
          <line x1={w * 0.36} y1={h * 0.9} x2={w * 0.88} y2={h * 0.25} />
          <g stroke={traco} strokeWidth={0.9}>
            <path d={`M ${w * 0.72} ${h * 0.2} l ${w * 0.12} ${-h * 0.12} l 0 ${h * 0.2} z`} fill="#d8d8d8" />
            <path d={`M ${w * 0.88} ${h * 0.25} l ${w * 0.1} ${-h * 0.14} l ${-w * 0.02} ${h * 0.22} z`} fill="#d8d8d8" />
          </g>
        </g>
      )

    case 'livro':
      return (
        <g stroke={traco} strokeWidth={0.9}>
          <rect x={w * 0.2} y={h * 0.14} width={w * 0.6} height={h * 0.72} rx={1} fill="#7b4fa8" />
          <rect x={w * 0.2} y={h * 0.14} width={w * 0.14} height={h * 0.72} fill="#5c3782" />
          <line x1={w * 0.44} y1={h * 0.32} x2={w * 0.7} y2={h * 0.32} stroke="#d9c7ee" strokeWidth={1.2} />
          <line x1={w * 0.44} y1={h * 0.46} x2={w * 0.7} y2={h * 0.46} stroke="#d9c7ee" strokeWidth={1.2} />
        </g>
      )

    case 'tocha':
      return (
        <g stroke={traco} strokeWidth={0.9}>
          <rect x={w * 0.44} y={h * 0.42} width={w * 0.12} height={h * 0.54} fill="#6a4a26" />
          <path
            d={`M ${w * 0.5} ${h * 0.04} C ${w * 0.78} ${h * 0.24} ${w * 0.72} ${h * 0.46} ${w * 0.5} ${h * 0.5} C ${w * 0.28} ${h * 0.46} ${w * 0.22} ${h * 0.24} ${w * 0.5} ${h * 0.04} Z`}
            fill="#e8802b"
          />
          <path
            d={`M ${w * 0.5} ${h * 0.18} C ${w * 0.64} ${h * 0.3} ${w * 0.6} ${h * 0.42} ${w * 0.5} ${h * 0.44} C ${w * 0.4} ${h * 0.42} ${w * 0.36} ${h * 0.3} ${w * 0.5} ${h * 0.18} Z`}
            fill="#f5c542"
            stroke="none"
          />
        </g>
      )

    case 'comida':
      return (
        <g stroke={traco} strokeWidth={0.9}>
          <path
            d={`M ${w * 0.28} ${h * 0.3} C ${w * 0.28} ${h * 0.1} ${w * 0.78} ${h * 0.1} ${w * 0.78} ${h * 0.38} C ${w * 0.78} ${h * 0.66} ${w * 0.44} ${h * 0.74} ${w * 0.36} ${h * 0.6} Z`}
            fill="#a5673f"
          />
          <line
            x1={w * 0.36}
            y1={h * 0.6}
            x2={w * 0.14}
            y2={h * 0.94}
            stroke="#e8dcc0"
            strokeWidth={Math.max(1.5, w * 0.1)}
            strokeLinecap="round"
          />
        </g>
      )

    /** símbolo desconhecido: retângulo tracejado neutro, para o usuário ver e poder apagar */
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
