import { BaseBoxShapeUtil, SVGContainer, T, type RecordProps, type TLShape } from 'tldraw'
import { definicaoDoSimbolo } from '../lib/simbolosMapa'
import { desenharSimbolo } from '../lib/desenhoSimbolo'

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
 *
 * O desenho em si mora em `lib/desenhoSimbolo.tsx` (função pura, sem tldraw) — a página de
 * amostra (`.amostra/mapa.html`) chama a mesma função, para as duas nunca divergirem.
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

/** Tamanho de nascença do símbolo, para quem cria a forma. */
export function tamanhoDoSimbolo(id: string): { w: number; h: number } {
  const definicao = definicaoDoSimbolo(id)
  return { w: definicao?.largura ?? 40, h: definicao?.altura ?? 40 }
}
