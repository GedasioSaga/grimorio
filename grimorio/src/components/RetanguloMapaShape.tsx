import { BaseBoxShapeUtil, SVGContainer, T, type RecordProps, type TLShape } from 'tldraw'
import { CANTOS_MAPA, CANTO_PADRAO, raioDoCanto, type CantoMapa } from '../lib/cantosMapa'
import { getCantoAtivo } from '../lib/cantoAtivo'
import {
  RETANGULO_ALTURA_PADRAO,
  RETANGULO_COR_PADRAO,
  RETANGULO_ESPESSURA_PADRAO,
  RETANGULO_LARGURA_PADRAO,
  RETANGULO_PREENCHIMENTO_OPACIDADE,
} from '../lib/retanguloMapa'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'retangulo-mapa': {
      w: number
      h: number
      cantos: CantoMapa
      cor: string
      espessura: number
      preenchido: boolean
    }
  }
}

export type RetanguloMapaShapeType = TLShape<'retangulo-mapa'>

/**
 * Retângulo do mapa — o porquê de ser peça própria e não o `geo` nativo está em
 * `lib/retanguloMapa.ts`. Caixa simples (`BaseBoxShapeUtil`, mesma família de
 * `CorredorMapaShapeUtil`/`MuralhaMapaShapeUtil`): redimensiona pelas alças como qualquer
 * caixa, e a ferramenta que o cria (`RetanguloMapaTool`) herda de `BaseBoxShapeTool`, então
 * clicar já COLOCA um retângulo do tamanho padrão e arrastar desenha do tamanho que o
 * usuário quiser — as duas coisas, sem escolher uma.
 *
 * Cor e espessura entram como atributo literal no SVG (não por CSS) porque a exportação
 * PNG/SVG re-renderiza os shapes por um caminho que não carrega o CSS da página — mesmo
 * motivo documentado em `LinhaMapaColoridaShapeUtil`. Por isso `component()` e o desenho da
 * exportação compartilham `desenharRetangulo` em vez de cada um montar o seu.
 */
export class RetanguloMapaShapeUtil extends BaseBoxShapeUtil<RetanguloMapaShapeType> {
  static override type = 'retangulo-mapa' as const

  static override props: RecordProps<RetanguloMapaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    cantos: T.literalEnum(...CANTOS_MAPA),
    cor: T.string,
    espessura: T.positiveNumber,
    preenchido: T.boolean,
  }

  /**
   * O canto sai do que está escolhido na barra (`cantoAtivo`), não de uma constante: é o
   * mesmo lugar de onde o tldraw tira cor/tamanho das próprias formas (`getStyleForNextShape`).
   *
   * Aqui, e não no `registerBeforeCreateHandler` do mapa: lá o canto já teria sido
   * preenchido por este método, e o handler não teria como distinguir "valor padrão" de
   * "escolha que veio junto na forma" — sobrescrever sempre quebraria duplicar/colar um
   * retângulo de canto diferente do ativo.
   */
  getDefaultProps(): RetanguloMapaShapeType['props'] {
    return {
      w: RETANGULO_LARGURA_PADRAO,
      h: RETANGULO_ALTURA_PADRAO,
      cantos: this.editor ? getCantoAtivo(this.editor) : CANTO_PADRAO,
      cor: RETANGULO_COR_PADRAO,
      espessura: RETANGULO_ESPESSURA_PADRAO,
      preenchido: false,
    }
  }

  component(shape: RetanguloMapaShapeType) {
    return <SVGContainer>{desenharRetangulo(shape.props)}</SVGContainer>
  }

  override toSvg(shape: RetanguloMapaShapeType) {
    return desenharRetangulo(shape.props)
  }

  indicator(shape: RetanguloMapaShapeType) {
    const { w, h } = shape.props
    // o indicador acompanha a borda EXTERNA do traço, que é o raio de dentro mais meia
    // espessura — usar o raio de dentro cru descolava o contorno da peça nos quatro cantos.
    const { raio, espessura } = medidasDoRetangulo(shape.props)
    const raioExterno = raio > 0 ? raio + espessura / 2 : 0
    return <rect width={w} height={h} rx={raioExterno} ry={raioExterno} />
  }
}

/**
 * Geometria do traço, resolvida uma vez para o desenho e para o indicador.
 *
 * O `<rect>` desenhado é o do MEIO do traço (recuado meia espessura em cada lado), porque o
 * SVG centra o `stroke` na borda: sem o recuo, metade da espessura vazaria para fora da
 * caixa da peça e o contorno não bateria com as alças de redimensionar.
 *
 * Duas armadilhas fechadas aqui:
 * - **espessura limitada à metade do lado menor.** 10px é opção da lista; num retângulo de
 *   10px de altura, `h - espessura` daria 0, e `width`/`height` = 0 DESABILITA a renderização
 *   do `<rect>` pela spec do SVG — a peça sumia da tela E da exportação, continuando
 *   selecionável, com cara de defeito de render.
 * - **raio calculado sobre as medidas de DENTRO.** Calculado sobre as de fora, um retângulo
 *   200×30 com traço 10 pedia raio 12 num retângulo interno de 20 de altura: o SVG satura o
 *   `ry` em 10 e mantém o `rx` em 12, e o canto sai ELÍPTICO — exatamente a "cápsula
 *   deformada" que `raioDoCanto` existe para evitar.
 */
function medidasDoRetangulo({ w, h, cantos, espessura }: RetanguloMapaShapeType['props']) {
  const espessuraUsada = Math.max(0.5, Math.min(espessura, Math.min(w, h) / 2))
  const larguraInterna = Math.max(0, w - espessuraUsada)
  const alturaInterna = Math.max(0, h - espessuraUsada)
  return {
    espessura: espessuraUsada,
    larguraInterna,
    alturaInterna,
    raio: raioDoCanto(cantos, larguraInterna, alturaInterna),
  }
}

function desenharRetangulo(props: RetanguloMapaShapeType['props']) {
  const { espessura, larguraInterna, alturaInterna, raio } = medidasDoRetangulo(props)
  const traco = props.cor || RETANGULO_COR_PADRAO
  return (
    <rect
      x={espessura / 2}
      y={espessura / 2}
      width={larguraInterna}
      height={alturaInterna}
      rx={raio}
      ry={raio}
      fill={props.preenchido ? traco : 'none'}
      fillOpacity={props.preenchido ? RETANGULO_PREENCHIMENTO_OPACIDADE : undefined}
      stroke={traco}
      strokeWidth={espessura}
    />
  )
}
