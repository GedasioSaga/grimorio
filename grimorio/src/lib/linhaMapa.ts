import { QUADRADO_PX } from './quadrados'

/**
 * Lógica pura da ferramenta de linha do mapa — o conserto do bug "a peça fica grudada na
 * mão e só dá pra arrastar".
 *
 * ## O bug, na fonte
 *
 * A ferramenta de linha do tldraw cria o shape no `onPointerDown`, com os dois pontos
 * praticamente no mesmo lugar — `(0,0)` e `(0.1, 0.1)`, ver `getDefaultProps` em
 * `node_modules/tldraw/src/lib/shapes/line/LineShapeUtil.tsx`. Quem ARRASTA nunca vê isso,
 * porque o `onPointerMove` entrega o segundo ponto pro `select.dragging_handle`. Quem
 * CLICA sem arrastar cai no `Pointing.onPointerUp` → `complete()`, que só volta pro estado
 * `idle` DA PRÓPRIA ferramenta de linha
 * (`node_modules/tldraw/src/lib/shapes/line/toolStates/Pointing.ts`): sobra no mapa uma
 * linha de comprimento ~zero, invisível, e a ferramenta continua armada — a peça "na mão".
 * O `0×0,8` que apareceu na captura do usuário é exatamente essa linha degenerada.
 *
 * Compare com a ferramenta de caixa (`BaseBoxShapeTool`), que no mesmo clique COLOCA uma
 * forma do tamanho padrão centrada no ponto e volta pra seleção. A linha é a única peça do
 * mapa que não fazia isso — não é limitação da biblioteca, é um caso não coberto.
 *
 * ## O conserto
 *
 * Detectar a linha degenerada e esticá-la num segmento horizontal do tamanho padrão,
 * centrado no clique. Arrastar continua desenhando livre, e o `shift`+clique pra emendar
 * mais pontos continua intocado — nada da máquina de estados nativa é reescrito.
 */

/** Comprimento do segmento que um clique sem arrasto coloca no mapa. */
export const LINHA_COMPRIMENTO_PADRAO = QUADRADO_PX * 2

/**
 * Abaixo disto o traço é considerado clique, não desenho. 4px de página: menor que o limiar
 * de arrasto do tldraw, então nenhum traço que o usuário desenhou de propósito cai aqui —
 * o alvo é só o `0.1` do `getDefaultProps` e o tremor de mão de quem clicou.
 */
export const LINHA_COMPRIMENTO_MINIMO = 4

export interface PontoLinha {
  x: number
  y: number
}

/** Comprimento total do traço, somando segmento a segmento. */
export function comprimentoDaLinha(pontos: readonly PontoLinha[]): number {
  let total = 0
  for (let i = 1; i < pontos.length; i++) {
    total += Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y)
  }
  return total
}

/** A linha nasceu de um clique sem arrasto (comprimento desprezível)? */
export function ehLinhaDeClique(pontos: readonly PontoLinha[]): boolean {
  if (pontos.length < 2) return true
  return comprimentoDaLinha(pontos) < LINHA_COMPRIMENTO_MINIMO
}

/**
 * Segmento horizontal padrão para substituir a linha degenerada, centrado no ponto clicado.
 *
 * `deslocamentoX` é quanto a origem do shape anda para a esquerda: o tldraw guarda os
 * pontos em coordenadas LOCAIS a partir de `shape.x`/`shape.y`, então centrar no clique é
 * mover a origem meio comprimento para trás e deixar os dois pontos em `y = 0`.
 */
export function segmentoPadraoDeClique(comprimento: number = LINHA_COMPRIMENTO_PADRAO): {
  deslocamentoX: number
  pontos: [PontoLinha, PontoLinha]
} {
  return {
    deslocamentoX: comprimento / 2,
    pontos: [
      { x: 0, y: 0 },
      { x: comprimento, y: 0 },
    ],
  }
}
