/**
 * Setup global da suíte — ligado em `vite.config.ts` (`test.setupFiles`).
 *
 * Roda uma vez por arquivo de teste, antes do arquivo. Como parte da suíte roda em
 * `node` e parte em `jsdom` (docblock `// @vitest-environment jsdom`), tudo aqui é
 * condicional: nada pode assumir que `document` existe.
 *
 * ---
 *
 * Por que o polyfill de `elementFromPoint` existe
 *
 * jsdom não calcula layout, e por isso nem implementa `document.elementFromPoint` — o
 * método simplesmente não está lá. O prosemirror-view chama esse método no handler de
 * `mousedown` (`posAtCoords`, `node_modules/prosemirror-view/dist/index.js:468`), então
 * QUALQUER teste que dispare um clique dentro de um editor TipTap estoura
 * `TypeError: ...elementFromPoint is not a function` de dentro do listener — fora da
 * pilha do `it`, depois que o caso já passou.
 *
 * O Vitest contabiliza isso como "Unhandled Error": imprime "N passed" e sai com código
 * 1. Era o portão verde no texto e vermelho no exit — e, pior, a própria saída avisava
 * "This might cause false positive tests".
 *
 * A correção é dar ao jsdom a resposta honesta em vez de deixar o método faltando: sem
 * layout nenhum elemento ocupa o ponto, então `elementFromPoint` devolve `null` e
 * `elementsFromPoint` devolve lista vazia — exatamente o que a especificação manda
 * quando não há elemento nas coordenadas. O prosemirror trata `null` (cai no fallback
 * por `getBoundingClientRect`); o que ele não trata é o método ausente.
 *
 * Isto NÃO silencia erro de produto: erro não tratado continua derrubando a suíte. O que
 * some é a lacuna do ambiente de teste.
 */

if (typeof document !== 'undefined') {
  if (typeof document.elementFromPoint !== 'function') {
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      writable: true,
      value: (): Element | null => null,
    })
  }
  if (typeof document.elementsFromPoint !== 'function') {
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      writable: true,
      value: (): Element[] => [],
    })
  }
}
