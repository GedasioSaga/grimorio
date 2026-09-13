import { CARD_LARGURA_COLUNA, escalaDoCartao } from './cartaoCanvas'

/**
 * Onde a faixa com o acervo do cenário fica, grudada no card do canvas. `oculta` é o
 * padrão: canvas salvo antes da faixa existir não pode mudar de tamanho sozinho ao abrir.
 */
export type LadoFaixa = 'oculta' | 'baixo' | 'direita' | 'cima' | 'esquerda'

/** Ordem do botão que gira a faixa. Volta a `oculta` depois do último lado. */
export const LADOS_FAIXA: readonly LadoFaixa[] = ['oculta', 'baixo', 'direita', 'cima', 'esquerda']

/**
 * Espessura da faixa, em unidades do canvas, com o card na escala 1. Cabe uma miniatura de
 * item legível ao lado de uma coluna de 240: grande o bastante para reconhecer a arte, pequena
 * o bastante para não competir com a imagem do cenário.
 */
export const FAIXA_ITENS_BASE = 76

export function proximoLado(lado: LadoFaixa): LadoFaixa {
  const i = LADOS_FAIXA.indexOf(lado)
  return LADOS_FAIXA[(i + 1) % LADOS_FAIXA.length] ?? 'oculta'
}

/** Faixa à direita ou à esquerda come LARGURA do card; em cima ou embaixo, come altura. */
export function faixaComeLargura(lado: LadoFaixa): boolean {
  return lado === 'direita' || lado === 'esquerda'
}

/** Espessura da faixa por unidade de largura do conteúdo: `BASE · escala / w`. */
function espessuraPorLargura(cols: number): number {
  return FAIXA_ITENS_BASE / (Math.max(1, cols) * CARD_LARGURA_COLUNA)
}

/**
 * Largura do conteúdo do card (imagem e painéis), sem a faixa. É dela que sai a escala do
 * card: se a escala usasse a largura total, ligar a faixa ao lado aumentaria o texto e a
 * imagem sozinhos. Como a faixa escala junto com o card, a conta tem forma fechada:
 * `w = wc + BASE · wc / (cols · COLUNA)`.
 */
export function larguraDoConteudo(w: number, lado: LadoFaixa, cols: number): number {
  return faixaComeLargura(lado) ? w / (1 + espessuraPorLargura(cols)) : w
}

/** Espessura da faixa num card de largura total `w`. Cresce junto quando o card é redimensionado. */
export function espessuraFaixa(w: number, lado: LadoFaixa, cols: number): number {
  if (lado === 'oculta') return 0
  return FAIXA_ITENS_BASE * escalaDoCartao(larguraDoConteudo(w, lado, cols), Math.max(1, cols))
}

/**
 * Tamanho do card depois de trocar a faixa de lado: tira a faixa da dimensão onde estava e
 * põe na nova, mantendo o conteúdo do mesmo tamanho. Girar pelos quatro lados e voltar a
 * `oculta` devolve o tamanho de partida.
 */
export function tamanhoAoTrocarLado(
  tamanho: { w: number; h: number },
  cols: number,
  de: LadoFaixa,
  para: LadoFaixa,
): { w: number; h: number } {
  const espAntiga = espessuraFaixa(tamanho.w, de, cols)
  const wConteudo = larguraDoConteudo(tamanho.w, de, cols)
  const hConteudo = de === 'oculta' || faixaComeLargura(de) ? tamanho.h : tamanho.h - espAntiga

  if (para === 'oculta') return { w: wConteudo, h: hConteudo }
  const espNova = FAIXA_ITENS_BASE * escalaDoCartao(wConteudo, Math.max(1, cols))
  return faixaComeLargura(para)
    ? { w: wConteudo + espNova, h: hConteudo }
    : { w: wConteudo, h: hConteudo + espNova }
}
