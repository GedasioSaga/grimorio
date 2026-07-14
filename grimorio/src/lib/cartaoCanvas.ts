/** Largura de cada painel (Descrição / Informações) à direita do card no canvas. */
export const PAINEL_DESCRICAO_LARGURA = 240

/** Largura mínima do card recolhido (não deixa o collapse encolher demais). */
const LARGURA_MINIMA_RECOLHIDO = 160

/**
 * Nova largura do card ao abrir/fechar painéis. `deltaPaineis` em número de
 * painéis: +1 abre um, -2 fecha dois (descrição + informações ao lado), etc.
 */
export function ajustarLargura(atual: number, deltaPaineis: number): number {
  return Math.max(LARGURA_MINIMA_RECOLHIDO, atual + deltaPaineis * PAINEL_DESCRICAO_LARGURA)
}
