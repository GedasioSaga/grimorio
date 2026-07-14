/**
 * Nova largura da imagem em % da coluna, a partir da largura inicial (px),
 * do deslocamento do mouse (px, já com o sinal do lado arrastado) e da largura
 * do container (px). Trava entre `minPct` e 100.
 */
export function calcularLarguraPct(
  inicialPx: number,
  deltaPx: number,
  containerPx: number,
  minPct = 10,
): number {
  if (containerPx <= 0) return 100
  const pct = ((inicialPx + deltaPx) / containerPx) * 100
  return Math.max(minPct, Math.min(100, Math.round(pct)))
}
