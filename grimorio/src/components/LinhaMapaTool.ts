import {
  LineShapeTool,
  StateNode,
  Vec,
  maybeSnapToGrid,
  sortByIndex,
  type TLLineShape,
  type TLShapeId,
  type TLShapePartial,
  type TLStateNodeConstructor,
} from 'tldraw'
import { ehLinhaDeClique, segmentoPadraoDeClique } from '../lib/linhaMapa'

/**
 * Ferramenta de linha do mapa: a do tldraw, com UM caso consertado — o clique sem arrasto.
 *
 * O diagnóstico completo (com os arquivos e as linhas do tldraw) está em `lib/linhaMapa.ts`.
 * Em uma frase: clicar sem arrastar deixava no mapa uma linha de comprimento ~zero,
 * invisível, e mantinha a ferramenta armada — a peça "grudada na mão", que só desgrudava
 * arrastando. Toda outra peça do mapa COLOCA no clique; a linha era a exceção.
 *
 * ## Por que só o estado `idle` é reescrito
 *
 * `Pointing` (criar no `pointerDown`, arrastar a alça, emendar ponto com `shift`) vem
 * INTOCADO do tldraw, reaproveitado pelo estado `pointing` de `LineShapeTool.children()`
 * (buscado pelo `id`, não por posição no array: a ordem dos filhos é detalhe interno da
 * biblioteca e mudaria em silêncio numa atualização). Reescrevê-lo
 * significaria copiar ~90 linhas de máquina de estados que a biblioteca mantém — e este
 * projeto já pagou o preço de reimplementar a linha uma vez (ver o cabeçalho de
 * `LinhaMapaColoridaShapeUtil`, sobre o cadáver `linha-mapa`).
 *
 * `Pointing.complete()` termina voltando pra `idle` DESTA ferramenta, passando o id do
 * shape recém-criado. É o único ponto em que dá pra saber "houve um clique que não virou
 * arrasto" — o arrasto nunca passa por aqui, porque `onPointerMove` desvia pro
 * `select.dragging_handle` e ele termina na seleção. Então `idle` recebe exatamente as
 * linhas degeneradas, e só elas.
 */
class IdleLinhaMapa extends StateNode {
  static override id = 'idle'

  private shapeId: TLShapeId | undefined

  override onEnter(info: { shapeId?: TLShapeId }) {
    this.shapeId = info?.shapeId
    this.editor.setCursor({ type: 'cross', rotation: 0 })
    if (this.shapeId) this.colocarSegmentoDeClique(this.shapeId)
  }

  override onPointerDown() {
    this.parent.transition('pointing', { shapeId: this.shapeId })
  }

  override onCancel() {
    this.editor.setCurrentTool('select')
  }

  /**
   * Troca a linha degenerada por um segmento horizontal do tamanho padrão, centrado no
   * clique, e devolve o usuário pra seleção — o mesmo desfecho que clicar com o retângulo,
   * a sala ou a porta já dava.
   */
  private colocarSegmentoDeClique(id: TLShapeId) {
    const shape = this.editor.getShape<TLLineShape>(id)
    if (!shape) return

    const pontos = Object.values(shape.props.points).sort(sortByIndex)
    // shift+clique emenda pontos no mesmo shape: aí não é um clique solto, é desenho.
    if (pontos.length !== 2) return
    if (!ehLinhaDeClique(pontos)) return

    const { deslocamentoX, pontos: novos } = segmentoPadraoDeClique()
    const origem = maybeSnapToGrid(new Vec(shape.x - deslocamentoX, shape.y), this.editor)

    /**
     * `ignoreShapeLock`: a linha nasce TRAVADA quando a camada ativa está com o cadeado
     * (`registrarBeforeCreateMapa` carimba `isLocked`), e `updateShapes` descarta em
     * silêncio partial sobre shape travado — sem a flag, o conserto vira no-op e sobra no
     * mapa exatamente a linha invisível de comprimento zero que ele existe para eliminar,
     * agora travada e impossível de selecionar pelo canvas.
     */
    this.editor.run(() => {
      this.editor.updateShape({
        id,
        type: 'line',
        x: origem.x,
        y: origem.y,
        props: {
          points: {
            [pontos[0].index]: { ...pontos[0], x: novos[0].x, y: novos[0].y },
            [pontos[1].index]: { ...pontos[1], x: novos[1].x, y: novos[1].y },
          },
        },
      } as TLShapePartial)
    }, { ignoreShapeLock: true })

    this.shapeId = undefined
    this.editor.setSelectedShapes([id])
    /**
     * Cadeado de FERRAMENTA (tecla `q`): ligado, o tldraw mantém a ferramenta armada em vez
     * de voltar pra seleção — é o que `BaseBoxShapeTool` faz no fim do `complete()` dele, e
     * o que o retângulo do mapa herda. Sem este `return`, a linha seria a única peça da
     * barra que desarma com o cadeado ligado, e `isToolLocked` viaja no snapshot de sessão
     * gravado no arquivo do mapa: um `q` acidental deixaria a linha fora de compasso com o
     * resto da barra para sempre. Já estamos DENTRO do `idle`, então ficar armado é não
     * fazer nada — transicionar para `idle` daqui seria reentrar no próprio `onEnter`.
     */
    if (this.editor.getInstanceState().isToolLocked) return
    this.editor.setCurrentTool('select')
  }
}

export class LinhaMapaTool extends LineShapeTool {
  static override id = 'line'
  static override initial = 'idle'

  static override children(): TLStateNodeConstructor[] {
    // por `id`, nunca por posição: um estado novo no meio do array nativo quebraria a
    // ferramenta em runtime, no primeiro clique, sem nenhum erro de tipo antes.
    const pointingNativo = LineShapeTool.children().find((c) => c.id === 'pointing')
    if (!pointingNativo) throw new Error('LinhaMapaTool: o estado "pointing" do tldraw sumiu — ver LinhaMapaTool.ts')
    return [IdleLinhaMapa, pointingNativo]
  }
}
