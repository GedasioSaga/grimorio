import {
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
  getIndices,
  maybeSnapToGrid,
  Polygon2d,
  ShapeUtil,
  SVGContainer,
  T,
  Vec,
  type IndexKey,
  type RecordProps,
  type TLHandle,
  type TLHandleDragInfo,
  type TLResizeInfo,
  type TLShape,
} from 'tldraw'
import { useApp } from '../state/store'
import { desenharCorpoSalaPoligono } from '../lib/desenhoSalaPoligono'
import { ESPESSURA_CONTORNO_SALA, FONTE_ROTULO_PADRAO } from '../lib/salaMapa'
import { PONTOS_SALA_POLIGONO_PADRAO, pontosSeguros, type PontoPoligono } from '../lib/salaPoligonoMapa'
import { resolverVinculoSala } from '../lib/vinculoSalaCenario'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'sala-poligono-mapa': {
      pontos: PontoPoligono[]
      /** 'pendente' | 'limpa' | 'sem-info' — ver lib/salaMapa.ts */
      estado: string
      /** nome do cômodo, escrito no centro do polígono */
      rotulo: string
      /** cor escolhida à mão; vazio significa "usar a cor do estado" */
      cor: string
      /** id do Cenário (ficha) que esta sala abre; vazio = sem vínculo */
      cenarioId: string
      /** espessura do contorno em px — ver ESPESSURAS_SALA em lib/salaMapa.ts */
      espessura: number
      /** corpo do nome do cômodo em px — ver TAMANHOS_ROTULO */
      rotuloTamanho: number
      /** 'topo' | 'centro' | 'base' — onde o nome fica dentro da sala */
      rotuloAncora: string
      /** nome escrito de baixo para cima, para cômodo estreito e alto */
      rotuloVertical: boolean
    }
  }
}

export type SalaPoligonoMapaShapeType = TLShape<'sala-poligono-mapa'>

const validadorPonto = T.object({ x: T.number, y: T.number })

/**
 * Sala em polígono: mesma semântica de estado/cor/rótulo da sala retangular
 * (`aparenciaDaSala`, reaproveitada em `desenhoSalaPoligono.tsx`), mas com N vértices
 * arrastáveis em vez de w/h.
 *
 * Por que existe: a sala retangular (`SalaMapaShape.tsx`) já documentava o preço da
 * própria forma — "forma irregular se compõe com salas encostadas". Compor um cômodo em L
 * com dois ou três retângulos deixa emenda de contorno visível na junção (cada retângulo
 * desenha o PRÓPRIO contorno) e obriga o mestre a realinhar as peças toda vez que move
 * uma. Um polígono de peça única resolve as duas coisas: um contorno só, e mover a forma
 * inteira move um shape, não um grupo frágil.
 *
 * Não estende `BaseBoxShapeUtil` (que é sempre uma caixa w/h) porque aqui os VÉRTICES são
 * a geometria — não há w/h independente dos pontos. Padrão de handle copiado do
 * `LineShapeUtil` nativo do tldraw
 * (node_modules/tldraw/src/lib/shapes/line/LineShapeUtil.tsx:77-163): vértice arrastável
 * com `maybeSnapToGrid`, a MESMA função que a ferramenta de linha usa para encaixar na
 * grade — por isso "o snap à grade do mapa é aliado" também aqui.
 *
 * Vértices são em quantidade FIXA (a lista de nascença, `PONTOS_SALA_POLIGONO_PADRAO`) —
 * sem handle "create" para inserir vértice no meio de uma aresta, ao contrário da linha
 * nativa. Reduz a superfície da primeira versão a "arrastar para reformar", que já cobre
 * L, T, e qualquer polígono simples; adicionar/remover vértice fica para quando pedirem.
 *
 * PARIDADE COM A SALA RETANGULAR — o que este arquivo teve que ganhar depois:
 * a primeira versão declarou `estado`, `rotulo` e `cor` nas props mas NENHUMA superfície do
 * app sabia escrever nelas, porque o painel e os handlers comparavam contra o literal
 * `'sala-mapa'`. A peça nascia inerte: dava para arrastar vértice e mais nada. Faltavam
 * também `cenarioId`, `onDoubleClick` e `onResize`. Quem decide hoje "isto é uma sala" é
 * `lib/tiposSala.ts`, um lugar só — ver o cabeçalho de lá para o porquê.
 */
// mapa salvo antes do vínculo e da espessura não tem essas props — sem migração o tldraw
// recusa o documento INTEIRO ao validar contra o schema novo (mesmo padrão de
// `SalaMapaShape.tsx` / `CharacterCardShape.tsx`).
const versoes = createShapePropsMigrationIds('sala-poligono-mapa', {
  AdicionaCenarioId: 1,
  AdicionaEspessura: 2,
  AdicionaEstiloRotulo: 3,
})

export class SalaPoligonoMapaShapeUtil extends ShapeUtil<SalaPoligonoMapaShapeType> {
  static override type = 'sala-poligono-mapa' as const

  static override props: RecordProps<SalaPoligonoMapaShapeType> = {
    pontos: T.arrayOf(validadorPonto),
    estado: T.string,
    rotulo: T.string,
    cor: T.string,
    cenarioId: T.string,
    espessura: T.positiveNumber,
    rotuloTamanho: T.positiveNumber,
    rotuloAncora: T.string,
    rotuloVertical: T.boolean,
  }

  static override migrations = createShapePropsMigrationSequence({
    sequence: [
      {
        id: versoes.AdicionaCenarioId,
        up(props) {
          props.cenarioId = ''
        },
        down(props) {
          delete props.cenarioId
        },
      },
      {
        // sobe com o valor que o polígono SEMPRE desenhou, não com o primeiro item da
        // lista de espessuras: mapa antigo tem que reabrir idêntico, senão a migração
        // vira uma edição em massa que o autosave grava no cofre sem ninguém pedir.
        id: versoes.AdicionaEspessura,
        up(props) {
          props.espessura = ESPESSURA_CONTORNO_SALA
        },
        down(props) {
          delete props.espessura
        },
      },
      {
        /**
         * Tamanho, posição e orientação do nome entram num degrau SÓ: são uma decisão de
         * apresentação do rótulo, sempre escolhidas juntas no painel, e três degraus
         * separados só multiplicariam a chance de um mapa parar no meio da escada.
         *
         * Os valores de subida são exatamente o que a sala SEMPRE desenhou — corpo 12,
         * ancorada no topo, horizontal. Mapa antigo reabre idêntico; nada de migração que
         * reposiciona o nome de todo cômodo do cofre sem ninguém pedir.
         */
        id: versoes.AdicionaEstiloRotulo,
        up(props) {
          if (props.rotuloTamanho === undefined) props.rotuloTamanho = FONTE_ROTULO_PADRAO
          if (props.rotuloAncora === undefined) props.rotuloAncora = 'topo'
          if (props.rotuloVertical === undefined) props.rotuloVertical = false
        },
        down(props) {
          delete props.rotuloTamanho
          delete props.rotuloAncora
          delete props.rotuloVertical
        },
      },
    ],
  })

  getDefaultProps(): SalaPoligonoMapaShapeType['props'] {
    return {
      pontos: PONTOS_SALA_POLIGONO_PADRAO,
      estado: 'sem-info',
      rotulo: '',
      cor: '',
      cenarioId: '',
      espessura: ESPESSURA_CONTORNO_SALA,
      rotuloTamanho: FONTE_ROTULO_PADRAO,
      rotuloAncora: 'topo',
      rotuloVertical: false,
    }
  }

  // sem ALÇA de redimensionar: reformar a silhueta é arrastando vértice (mesma escolha da
  // linha nativa, LineShapeUtil.ts:39) — uma alça de caixa não faz sentido para um polígono
  // arbitrário. Isso NÃO é o mesmo que não redimensionar: os campos L/A do painel e o
  // resize de uma seleção múltipla passam por `onResize`, abaixo.
  override hideResizeHandles() {
    return true
  }
  override hideSelectionBoundsFg() {
    return true
  }
  override hideSelectionBoundsBg() {
    return true
  }

  /**
   * `pontosSeguros` e não `shape.props.pontos` direto: `new Polygon2d({ points: [] })` LANÇA,
   * e este método roda ao LER O DOCUMENTO — um polígono degenerado vindo de uma planta de IA
   * torta derruba o mapa inteiro no `LimiteDeErro`, não só a peça. O porquê inteiro está na
   * função, em `lib/salaPoligonoMapa.ts`.
   */
  getGeometry(shape: SalaPoligonoMapaShapeType) {
    return new Polygon2d({
      points: pontosSeguros(shape.props.pontos).map((p) => new Vec(p.x, p.y)),
      isFilled: true,
    })
  }

  override getHandles(shape: SalaPoligonoMapaShapeType): TLHandle[] {
    // mesma lista que a geometria e o desenho usam: alça em vértice que não existe no
    // polígono desenhado é alça que arrasta o nada.
    const pontos = pontosSeguros(shape.props.pontos)
    const indices = getIndices(pontos.length)
    return pontos.map((p, i) => ({
      id: `vertice-${i}`,
      type: 'vertex',
      index: indices[i] as IndexKey,
      x: p.x,
      y: p.y,
      canSnap: true,
    }))
  }

  override onHandleDrag(shape: SalaPoligonoMapaShapeType, { handle }: TLHandleDragInfo<SalaPoligonoMapaShapeType>) {
    const indice = Number(handle.id.replace('vertice-', ''))
    if (!Number.isInteger(indice) || indice < 0 || indice >= shape.props.pontos.length) return

    const ponto = maybeSnapToGrid(new Vec(handle.x, handle.y), this.editor)
    const pontos = shape.props.pontos.map((p, i) => (i === indice ? { x: ponto.x, y: ponto.y } : p))

    return { ...shape, props: { ...shape.props, pontos } }
  }

  /**
   * Redimensionar escalando os vértices — padrão do `LineShapeUtil` nativo
   * (node_modules/tldraw/src/lib/shapes/line/LineShapeUtil.tsx:109-122): a util devolve
   * SÓ as props, e o editor aplica o novo x/y por conta própria a partir de `newPoint`
   * (@tldraw/editor/src/lib/editor/Editor.ts:7686-7690).
   *
   * Sem este handler o polígono não era "não redimensionável", era pior: os campos L e A
   * do painel de propriedades aceitavam o número e não faziam nada. `Editor.resizeShape`
   * é guardado por `if (util.onResize && util.canResize(shape))` (Editor.ts:7627) e sai
   * em silêncio quando o handler não existe — o usuário digita 8, aperta Enter, o campo
   * volta ao valor velho e nenhum erro aparece em lugar nenhum.
   */
  override onResize(shape: SalaPoligonoMapaShapeType, { scaleX, scaleY }: TLResizeInfo<SalaPoligonoMapaShapeType>) {
    return {
      props: {
        pontos: shape.props.pontos.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY })),
      },
    }
  }

  /**
   * Duplo clique abre a ficha do Cenário vinculado — mesma escolha e MESMA armadilha da
   * sala retangular (ver o comentário longo em `SalaMapaShape.tsx`): o `Idle` do SelectTool
   * só considera o handler atendido quando ele devolve algo truthy, e sem retorno cai em
   * `handleDoubleClickOnCanvas`, que CRIA um shape de texto vazio no ponto. Enquanto este
   * handler não existiu, todo duplo clique num polígono sujava o mapa com um texto invisível.
   */
  override onDoubleClick = (shape: SalaPoligonoMapaShapeType) => {
    const { cenarioId } = shape.props
    if (cenarioId && useApp.getState().cenarios[cenarioId]) useApp.getState().abrirCenario(cenarioId)
    return { id: shape.id, type: shape.type }
  }

  component(shape: SalaPoligonoMapaShapeType) {
    return <CorpoSalaPoligono shape={shape} />
  }

  indicator(shape: SalaPoligonoMapaShapeType) {
    return <polygon points={pontosSeguros(shape.props.pontos).map((p) => `${p.x},${p.y}`).join(' ')} />
  }
}

/**
 * Igual ao `CorpoSala` da sala retangular: o vínculo com o Cenário se resolve AQUI (depende
 * do store) e chega à função de desenho já pronto. `carregando` separa "cenário sumiu" de
 * "ainda não li os cenários" — o porquê inteiro está em `resolverVinculoSala`.
 */
function CorpoSalaPoligono({ shape }: { shape: SalaPoligonoMapaShapeType }) {
  const { pontos, estado, rotulo, cor, cenarioId, espessura, rotuloTamanho, rotuloAncora, rotuloVertical } =
    shape.props
  const nomeCenario = useApp((s) => (cenarioId ? s.cenarios[cenarioId]?.nome : undefined))
  const carregando = useApp((s) => s.carregando)
  const vinculo = resolverVinculoSala(
    cenarioId,
    nomeCenario !== undefined ? { [cenarioId]: nomeCenario } : {},
    !carregando,
  )

  return (
    <SVGContainer>
      {desenharCorpoSalaPoligono({
        pontos,
        estado,
        rotulo,
        cor,
        espessura,
        vinculo,
        estiloRotulo: { tamanho: rotuloTamanho, ancora: rotuloAncora, vertical: rotuloVertical },
      })}
    </SVGContainer>
  )
}
