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

/**
 * Largura do card a partir do nº de colunas de painel visíveis.
 * `base` = largura da coluna principal (imagem+nome). Cada coluna de painel
 * adiciona PAINEL_DESCRICAO_LARGURA.
 */
export function larguraDoCartao(base: number, colunasPaineis: number): number {
  return base + colunasPaineis * PAINEL_DESCRICAO_LARGURA
}

/** Colunas de painel visíveis: 0 se recolhido; senão 1 (coluna da Descrição) + nº de seções ao lado. */
export function colunasPaineisVisiveis(expandido: boolean, secoesAoLado: number): number {
  return expandido ? 1 + secoesAoLado : 0
}

/** Largura base de uma coluna (imagem ou painel), em unidades de design. */
export const CARD_LARGURA_COLUNA = PAINEL_DESCRICAO_LARGURA

/** Altura base da faixa nome+resumo+controles (fora a imagem), em px de design. */
export const FAIXA_TEXTO_ALTURA = 74

/** Total de colunas do card: 1 (principal) + colunas de painel visíveis. */
export function colunasTotais(expandido: boolean, secoesAoLado: number): number {
  return 1 + colunasPaineisVisiveis(expandido, secoesAoLado)
}

/**
 * Escala uniforme do card = largura de UMA coluna ÷ largura base da coluna.
 * Vira o multiplicador --card-fe, que a CSS aplica em TODA fonte — assim o texto
 * acompanha o tamanho da imagem quando o card é redimensionado. `cols` = colunasTotais.
 */
export function escalaDoCartao(w: number, cols: number): number {
  if (cols <= 0) return 1
  return w / (cols * CARD_LARGURA_COLUNA)
}

/**
 * Altura que emoldura a imagem (aspecto `ar` = largura/altura) num card recolhido
 * de largura `w`: altura da imagem na coluna + faixa de texto, sem espaço morto.
 */
export function alturaMoldadaAImagem(w: number, ar: number): number {
  if (!(ar > 0)) return Math.round(w + FAIXA_TEXTO_ALTURA)
  return Math.round(w / ar + FAIXA_TEXTO_ALTURA)
}
