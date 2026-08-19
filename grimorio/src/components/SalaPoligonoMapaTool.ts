import {
  StateNode,
  Vec,
  createShapeId,
  maybeSnapToGrid,
  type TLShapeId,
  type TLStateNodeConstructor,
} from 'tldraw'
import {
  PONTOS_SALA_POLIGONO_PADRAO,
  escalarPontosPara,
  limitesDoPoligono,
} from '../lib/salaPoligonoMapa'

/**
 * Ferramenta de desenho da sala em POLÍGONO.
 *
 * Ela não herda `BaseBoxShapeTool`, ao contrário das outras peças de construção
 * (`FerramentasCaixaMapa.ts`), por um motivo de schema e não de gosto: aquela base começa o
 * arrasto escrevendo `props: { w: 1, h: 1 }`
 * (`@tldraw/editor/.../BaseBoxShapeTool/children/Pointing.ts`), e a sala em polígono não tem
 * `w`/`h` — a geometria dela são os VÉRTICES. O update seria recusado pelo validador antes de
 * qualquer desenho aparecer.
 *
 * O comportamento entregue é o mesmo das outras, de propósito — quem desenha não deve
 * descobrir que uma peça responde diferente:
 *
 * - **clique sem arrasto** coloca o cômodo em L de nascença no tamanho padrão, centrado no
 *   ponto clicado;
 * - **arrasto** desenha o cômodo dentro da caixa arrastada, com a silhueta já reescalada a
 *   cada movimento (`escalarPontosPara`) — o que está sob o cursor durante o gesto é a peça
 *   final, não um retângulo que vira polígono ao soltar;
 * - os dois caminhos passam por `maybeSnapToGrid`, então a peça nasce na grade quando a
 *   grade está ligada;
 * - abre marca de histórico, seleciona a peça e volta para `select` — ou fica armada quando
 *   `isToolLocked` estiver ligado.
 *
 * O arrasto NÃO é delegado a `select.resizing` (o truque que a base usa) porque isso exigiria
 * criar antes um polígono degenerado de 1×1 e depois escalá-lo por um fator de ~200: a
 * silhueta chega ao fim do gesto deformada por acúmulo de ponto flutuante. Reescalar da lista
 * de nascença a cada movimento parte sempre da forma correta.
 */

const { w: LARGURA_PADRAO, h: ALTURA_PADRAO } = limitesDoPoligono(PONTOS_SALA_POLIGONO_PADRAO)

/** Arrasto menor que isto (em px de página) conta como clique, não como desenho. */
const MINIMO_PARA_DESENHAR = 4

class IdleSalaPoligono extends StateNode {
  static override id = 'idle'

  override onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  override onPointerDown() {
    this.parent.transition('pointing')
  }

  override onCancel() {
    this.editor.setCurrentTool('select')
  }
}

class PointingSalaPoligono extends StateNode {
  static override id = 'pointing'

  // `idCriado`, não `id`: `StateNode.id` já existe e é público (o nome do estado na máquina
  // de estados). Sombrear com um campo privado quebra a classe inteira contra o tipo base.
  private idCriado: TLShapeId | undefined
  private marca: string | undefined

  override onEnter() {
    this.idCriado = undefined
    this.marca = undefined
  }

  override onPointerMove() {
    if (!this.editor.inputs.getIsDragging()) return

    const origem = this.editor.inputs.getOriginPagePoint()
    const atual = this.editor.inputs.getCurrentPagePoint()
    const a = maybeSnapToGrid(new Vec(origem.x, origem.y), this.editor)
    const b = maybeSnapToGrid(new Vec(atual.x, atual.y), this.editor)

    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    // arrasto para trás é arrasto igual: normalizar aqui evita largura negativa chegando ao
    // `escalarPontosPara`, que a devolveria como polígono espelhado e invertido.
    const w = Math.max(Math.abs(b.x - a.x), 1)
    const h = Math.max(Math.abs(b.y - a.y), 1)
    const pontos = escalarPontosPara(PONTOS_SALA_POLIGONO_PADRAO, w, h)

    if (!this.idCriado) {
      this.idCriado = createShapeId()
      this.marca = this.editor.markHistoryStoppingPoint(`criando-sala-poligono:${this.idCriado}`)
      this.editor.createShape({ id: this.idCriado, type: 'sala-poligono-mapa', x, y, props: { pontos } })
      this.editor.select(this.idCriado)
      return
    }

    this.editor.updateShape({ id: this.idCriado, type: 'sala-poligono-mapa', x, y, props: { pontos } })
  }

  override onPointerUp() {
    this.completar()
  }

  override onComplete() {
    this.completar()
  }

  override onCancel() {
    this.cancelar()
  }

  override onInterrupt() {
    this.cancelar()
  }

  /**
   * Fecha o gesto. Sem arrasto (ou com arrasto curto demais para ser intencional), coloca a
   * peça no tamanho de nascença CENTRADA no clique — a mesma regra que `BaseBoxShapeTool`
   * aplica às outras peças, para o gesto significar a mesma coisa em todas.
   */
  private completar() {
    const editor = this.editor

    if (!this.idCriado) {
      const origem = editor.inputs.getOriginPagePoint()
      const arrastou =
        Vec.Dist(origem, editor.inputs.getCurrentPagePoint()) > MINIMO_PARA_DESENHAR
      if (!arrastou) {
        const id = createShapeId()
        editor.markHistoryStoppingPoint(`criando-sala-poligono:${id}`)
        const canto = maybeSnapToGrid(
          new Vec(origem.x - LARGURA_PADRAO / 2, origem.y - ALTURA_PADRAO / 2),
          editor,
        )
        editor.createShape({ id, type: 'sala-poligono-mapa', x: canto.x, y: canto.y })
        editor.select(id)
        this.idCriado = id
      }
    }

    this.encerrar()
  }

  private cancelar() {
    // desfaz até a marca aberta ao começar: um Escape no meio do arrasto não pode deixar
    // meia sala no mapa.
    if (this.marca) this.editor.bailToMark(this.marca)
    this.encerrar()
  }

  private encerrar() {
    if (this.editor.getInstanceState().isToolLocked) {
      this.parent.transition('idle')
      return
    }
    this.editor.setCurrentTool('select.idle')
  }
}

export class SalaPoligonoMapaTool extends StateNode {
  static override id = 'sala-poligono-mapa'
  static override initial = 'idle'
  // tipo explícito: campos privados nos estados filhos os tornam estruturalmente
  // incompatíveis com `StateNode` na inferência, e o array sai como união de classes em vez
  // de `TLStateNodeConstructor[]`. Mesmo tratamento que `LinhaMapaTool.children()`.
  static override children(): TLStateNodeConstructor[] {
    return [IdleSalaPoligono, PointingSalaPoligono]
  }

  override onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }
}
