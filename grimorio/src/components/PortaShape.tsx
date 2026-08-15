import {
  BaseBoxShapeUtil,
  SVGContainer,
  T,
  getColorValue,
  getDefaultColorTheme,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { COR_SALA_PADRAO, corDoVao } from '../lib/portaMapa'

/** Vão padrão: ~1 quadrado de largura por meia parede de espessura. */
export const PORTA_LARGURA_PADRAO = 32
export const PORTA_ESPESSURA_PADRAO = 14

// tldraw 4.x: shapes customizados entram no union TLShape via augmentation do
// TLGlobalShapePropsMap (mesmo padrão de CharacterCardShape.tsx).
declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'porta-mapa': {
      w: number
      h: number
      /** nome de cor do tldraw ('green', 'blue'…) copiado da sala sob a porta */
      cor: string
    }
  }
}

export type PortaShapeType = TLShape<'porta-mapa'>

/**
 * Porta do mapa: não é um símbolo POR CIMA da parede, é o buraco NA parede.
 *
 * Desenha três coisas: (1) um retângulo da cor do miolo da sala, que apaga o trecho de
 * contorno onde a porta está; (2) as duas jambas, marcando onde a parede recomeça;
 * (3) o arco de abertura.
 *
 * A cor do buraco é copiada da sala embaixo — ao criar (`onBeforeCreate`, ShapeUtil.ts:615)
 * e toda vez que o usuário solta a porta em outro lugar (`onTranslateEnd`, ShapeUtil.ts:763).
 * Sem isso o usuário teria que repintar a porta à mão cada vez que trocasse a cor de uma
 * sala.
 *
 * CUIDADO com a variante de cor: `fill: 'solid'` do tldraw NÃO pinta com a cor sólida —
 * pinta com a variante `semi` (node_modules/tldraw/src/lib/shapes/shared/ShapeFill.tsx:32-33).
 * O buraco usa a mesma `semi`, senão fica de um tom visivelmente diferente do miolo da sala
 * e o efeito de vão se perde.
 */
export class PortaShapeUtil extends BaseBoxShapeUtil<PortaShapeType> {
  static override type = 'porta-mapa' as const

  static override props: RecordProps<PortaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    cor: T.string,
  }

  getDefaultProps(): PortaShapeType['props'] {
    return { w: PORTA_LARGURA_PADRAO, h: PORTA_ESPESSURA_PADRAO, cor: COR_SALA_PADRAO }
  }

  /** Cor da sala sob o CENTRO da porta; sem sala embaixo, mantém a que já está. */
  private corSob(shape: PortaShapeType): string {
    const bounds = this.editor.getShapePageBounds(shape.id)
    if (!bounds) return shape.props.cor
    const formasSob = this.editor
      .getShapesAtPoint(bounds.center, { hitInside: true })
      .filter((s) => s.id !== shape.id)
    return corDoVao(formasSob, shape.props.cor)
  }

  override onBeforeCreate(next: PortaShapeType) {
    return { ...next, props: { ...next.props, cor: this.corSob(next) } }
  }

  override onTranslateEnd(_initial: PortaShapeType, current: PortaShapeType) {
    return { id: current.id, type: current.type, props: { ...current.props, cor: this.corSob(current) } }
  }

  component(shape: PortaShapeType) {
    const { w, h, cor } = shape.props
    const tema = getDefaultColorTheme({ isDarkMode: this.editor.user.getIsDarkMode() })
    const corDoBuraco = getColorValue(tema, cor as never, 'semi')
    const corDoTraco = getColorValue(tema, cor as never, 'solid')
    const raio = Math.min(w, h * 2)

    return (
      <SVGContainer>
        {/* o buraco: apaga o contorno da parede no vão */}
        <rect x={0} y={0} width={w} height={h} fill={corDoBuraco} />
        {/* jambas: onde a parede recomeça dos dois lados */}
        <line x1={0} y1={0} x2={0} y2={h} stroke={corDoTraco} strokeWidth={1.5} />
        <line x1={w} y1={0} x2={w} y2={h} stroke={corDoTraco} strokeWidth={1.5} />
        {/* arco de abertura */}
        <path
          d={`M 0 ${h} A ${raio} ${raio} 0 0 1 ${Math.min(w, raio)} ${h - Math.min(h, raio)}`}
          fill="none"
          stroke={corDoTraco}
          strokeWidth={1}
          opacity={0.6}
        />
      </SVGContainer>
    )
  }

  indicator(shape: PortaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
