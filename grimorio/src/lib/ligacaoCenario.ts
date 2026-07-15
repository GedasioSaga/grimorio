import type { PastaCenarioNode } from './types'
import { encontrarCenarioNode, paiDoCenario } from './cenarioArvore'

/** Par de ligação pai→filho no canvas. */
export interface ParLigacao {
  paiId: string
  filhoId: string
}

/**
 * Pares pai→filho que envolvem `cenarioId`: o vínculo com o pai (se houver) e
 * um vínculo por filho direto. Usado ao dropar um cenário para religar aos
 * cards já presentes no canvas.
 */
export function paresParaLigar(raiz: PastaCenarioNode, cenarioId: string): ParLigacao[] {
  const pares: ParLigacao[] = []
  const pai = paiDoCenario(raiz, cenarioId)
  if (pai) pares.push({ paiId: pai, filhoId: cenarioId })
  const node = encontrarCenarioNode(raiz, cenarioId)
  if (node) for (const f of node.filhos) pares.push({ paiId: cenarioId, filhoId: f.id })
  return pares
}
