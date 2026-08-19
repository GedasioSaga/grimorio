import { BaseBoxShapeTool } from 'tldraw'

/**
 * Ferramentas de DESENHO das peças de construção que são caixas (w/h).
 *
 * ## Por que existem
 *
 * Antes, cada uma destas peças nascia por `editor.createShape` no CENTRO DA VIEWPORT, a
 * partir de um botão da gaveta. Três coisas erradas de uma vez, e a comparação cega contra
 * o Dungeon Scrawl perdeu nas três lentes por causa disso:
 *
 * 1. **Custo.** Colocar um cômodo era: abrir a gaveta, clicar na peça (a gaveta fecha),
 *    arrastar a peça do meio da tela até o lugar, e então arrastar as alças até o tamanho.
 *    Uma masmorra de oito salas passava de cinquenta idas à gaveta. No editor de referência
 *    é um arrasto por cômodo, direto no canvas.
 * 2. **Fora da grade.** O centro da viewport é um ponto fracionário qualquer, e nenhuma das
 *    funções `criar*` passava por `maybeSnapToGrid`. Mesmo com a grade ligada, TODA peça
 *    nascia desalinhada e precisava ser encaixada à mão — o que também estraga a contagem em
 *    quadrados na mesa.
 * 3. **Empilhamento no mesmo ponto.** Todas nasciam no mesmo lugar, então a segunda caía em
 *    cima da primeira.
 *
 * ## Por que herdar em vez de escrever
 *
 * `BaseBoxShapeTool` já é a base das ferramentas de caixa do próprio tldraw e resolve as
 * duas interações sem obrigar a escolher uma (verificado em
 * `@tldraw/editor/src/lib/editor/tools/BaseBoxShapeTool/children/Pointing.ts`):
 *
 * - **clique sem arrasto** coloca a peça no tamanho de nascença (o `getDefaultProps` de cada
 *   shapeUtil manda), CENTRADA no ponto clicado e passada por `maybeSnapToGrid`;
 * - **arrasto** cria a peça e entrega para `select.resizing` com `isCreating`, então o
 *   tamanho sai pronto do próprio gesto, com preview ao vivo;
 * - abre marca de histórico (`creating_box:<id>`), seleciona a peça e volta para `select` —
 *   ou mantém a ferramenta armada quando `isToolLocked` está ligado, que é o "colocar
 *   várias seguidas" sem inventar modificador novo.
 *
 * O `RetanguloMapaTool` já fazia exatamente isso desde que existe. O que faltava era
 * estender o mesmo caminho às peças de construção, em vez de mantê-las no `createShape`
 * direto.
 *
 * ## O que continua vindo de outro lugar
 *
 * Nada de tamanho, cor ou estado mora aqui: a peça nasce com o que `getDefaultProps` diz
 * (`sem-info` na sala, e não vermelho — ver `SalaMapaShape.tsx`), e a banda de empilhamento
 * e a camada ativa continuam sendo carimbadas por `registrarBeforeCreateMapa`
 * (`lib/montagemMapa.tsx`), que roda para qualquer criação, venha de onde vier.
 *
 * A sala em POLÍGONO não entra nesta lista: ela não tem `w`/`h` (a geometria são os
 * vértices), e `BaseBoxShapeTool` escreve `props: { w: 1, h: 1 }` ao começar o arrasto, o
 * que o schema dela recusa. Ferramenta própria em `SalaPoligonoMapaTool.ts`.
 */

export class SalaMapaTool extends BaseBoxShapeTool {
  static override id = 'sala-mapa'
  static override initial = 'idle'
  override shapeType = 'sala-mapa' as const
}

export class CorredorMapaTool extends BaseBoxShapeTool {
  static override id = 'corredor-mapa'
  static override initial = 'idle'
  override shapeType = 'corredor-mapa' as const
}

export class MuralhaMapaTool extends BaseBoxShapeTool {
  static override id = 'muralha-mapa'
  static override initial = 'idle'
  override shapeType = 'muralha-mapa' as const
}

export class TorreMapaTool extends BaseBoxShapeTool {
  static override id = 'torre-mapa'
  static override initial = 'idle'
  override shapeType = 'torre-mapa' as const
}

export class EscadaMapaTool extends BaseBoxShapeTool {
  static override id = 'escada-mapa'
  static override initial = 'idle'
  override shapeType = 'escada-mapa' as const
}

export class PortaMapaTool extends BaseBoxShapeTool {
  static override id = 'porta-mapa'
  static override initial = 'idle'
  override shapeType = 'porta-mapa' as const
}

/** Ferramentas de caixa das peças de construção, na ordem em que a barra as mostra. */
export const FERRAMENTAS_CAIXA_MAPA = [
  SalaMapaTool,
  CorredorMapaTool,
  MuralhaMapaTool,
  TorreMapaTool,
  EscadaMapaTool,
  PortaMapaTool,
]
