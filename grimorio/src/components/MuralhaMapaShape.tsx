import { BaseBoxShapeUtil, Rectangle2d, type VecLike, SVGContainer, T, type RecordProps, type TLShape } from 'tldraw'
import { desenharMuralha } from '../lib/desenhoMuralha'
import {
  ESPESSURA_CONTORNO_MURALHA,
  MURALHA_ALTURA_PADRAO,
  MURALHA_LARGURA_PADRAO,
} from '../lib/muralhaMapa'
import { atenderDuploClique } from '../lib/duploCliqueMapa'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'muralha-mapa': {
      w: number
      h: number
    }
  }
}

export type MuralhaMapaShapeType = TLShape<'muralha-mapa'>

/**
 * Muralha do mapa: contorno externo que cerca o conjunto — ver `lib/muralhaMapa.ts`.
 * Caixa simples (`BaseBoxShapeUtil`, mesma família de `CorredorMapaShapeUtil`): nasce
 * grande o bastante para o usuário arrastar por cima de uma planta pequena, e redimensiona
 * como qualquer caixa até cercar a planta real.
 */
/**
 * Retângulo preenchido que RECUSA o acerto no miolo, deixando só a faixa do contorno como
 * área clicável — ver o porquê em `getGeometry` abaixo.
 *
 * A faixa tem a espessura do traço desenhado mais uma folga de meio traço para cada lado, o
 * suficiente para o alvo não ser mais fino que a linha que o usuário enxerga (mirar em 6px
 * exatos com o mouse é frustrante; a folga é o que torna a parede pegável).
 */
class AneisDaMuralha extends Rectangle2d {
  private readonly faixa: number
  private readonly larguraTotal: number
  private readonly alturaTotal: number

  constructor(w: number, h: number) {
    super({ width: w, height: h, isFilled: true })
    this.larguraTotal = w
    this.alturaTotal = h
    this.faixa = ESPESSURA_CONTORNO_MURALHA * 1.5
  }

  override ignoreHit(ponto: VecLike): boolean {
    const dentroX = ponto.x > this.faixa && ponto.x < this.larguraTotal - this.faixa
    const dentroY = ponto.y > this.faixa && ponto.y < this.alturaTotal - this.faixa
    return dentroX && dentroY
  }
}

export class MuralhaMapaShapeUtil extends BaseBoxShapeUtil<MuralhaMapaShapeType> {
  static override type = 'muralha-mapa' as const

  static override props: RecordProps<MuralhaMapaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
  }

  getDefaultProps(): MuralhaMapaShapeType['props'] {
    return { w: MURALHA_LARGURA_PADRAO, h: MURALHA_ALTURA_PADRAO }
  }

  /**
   * A muralha é um ANEL: só a faixa do contorno é a peça, o miolo é chão livre.
   *
   * `desenhoMuralha.tsx` desenha com `fill="none"` e diz por quê — "cerca o que já está
   * desenhado por dentro dela sem cobrir nada". A área clicável dizia o contrário:
   * `BaseBoxShapeUtil` devolve `Rectangle2d` com `isFilled: true`, e como a muralha é a maior
   * peça do mapa, clicar em QUALQUER chão vazio dentro do cerco selecionava o cerco inteiro.
   *
   * ## Por que não é só `isFilled: false`
   *
   * Foi a primeira tentativa e ela quebra a peça de outro jeito, medido: com a geometria oca,
   * clicar em cima da própria linha do contorno passou a não selecionar nada. `getShapeAtPoint`
   * trata forma oca por um ramo separado que começa com
   * `if (getShapePageBounds(shape).contains(viewportPageBounds)) continue`
   * (`@tldraw/editor/src/lib/editor/Editor.ts`) — forma oca maior que a viewport é PULADA de
   * propósito, para um quadro gigante não engolir cliques. Uma muralha é justamente isso:
   * maior que a tela sempre que se trabalha com zoom. Resultado: inselecionável.
   * `Group2d` (quatro barras) não escapa — o construtor dele força `isFilled: false`.
   *
   * ## O gancho certo
   *
   * `ignoreHit` existe para exatamente este caso e é o que o tldraw usa no pixel transparente
   * de imagem: a geometria continua PREENCHIDA (então nada de ramo oco, nada de pular por
   * tamanho, e a faixa é alvo sólido), e o acerto é recusado ponto a ponto quando cai no
   * miolo. Ao recusar, o editor segue procurando nas peças de trás — que é o comportamento
   * desejado: o clique atravessa e encontra a sala cercada, ou o vazio.
   */
  override getGeometry(shape: MuralhaMapaShapeType) {
    return new AneisDaMuralha(shape.props.w, shape.props.h)
  }

  /** Ver `atenderDuploClique`: sem isto, todo duplo clique nesta peça larga um texto vazio no mapa. */
  override onDoubleClick = atenderDuploClique

  component(shape: MuralhaMapaShapeType) {
    const { w, h } = shape.props
    return <SVGContainer>{desenharMuralha({ w, h })}</SVGContainer>
  }

  indicator(shape: MuralhaMapaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
