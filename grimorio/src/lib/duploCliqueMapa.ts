import type { TLShape, TLShapePartial } from 'tldraw'

/**
 * Duplo clique ATENDIDO, sem fazer nada.
 *
 * Parece um no-op e não é. O `Idle` do SelectTool só considera o duplo clique tratado quando
 * o handler devolve algo truthy
 * (`node_modules/tldraw/src/lib/tools/SelectTool/childStates/Idle.ts` — `if (change) { ...
 * return }`). Sem handler, ou com handler devolvendo `undefined`, ele segue para
 * `handleDoubleClickOnCanvas`, que CRIA um shape de texto vazio no ponto e entra em edição.
 *
 * Como nenhuma peça de construção é editável inline (o nome do cômodo se escreve no painel),
 * o resultado era: todo duplo clique numa peça largava um texto invisível no mapa. Some no
 * escuro, entra na exportação, entra na contagem da camada, e o mestre nunca descobre de onde
 * veio. `SalaMapaShape.tsx` documentou isso e se defendeu; corredor, muralha, torre, escada,
 * porta e retângulo continuaram descobertos.
 *
 * O retorno é um parcial sem prop nenhuma: `updateShapes` não acha diferença e nada muda de
 * verdade. O valor serve só de "eu tratei isto".
 *
 * A sala é a exceção que NÃO usa esta função: nela o duplo clique abre a ficha do Cenário
 * vinculado, então ela tem handler próprio.
 */
// Genérica, e não `(shape: TLShape) => TLShapePartial`: `onDoubleClick` é tipado por shape,
// e a versão larga faria o retorno ser a UNIÃO de todos os parciais do app — um
// `character-card` no lugar onde o corredor espera `corredor-mapa`. Com o parâmetro de tipo,
// cada peça recebe de volta exatamente o próprio parcial.
export function atenderDuploClique<S extends TLShape>(shape: S): TLShapePartial<S> {
  return { id: shape.id, type: shape.type } as TLShapePartial<S>
}
