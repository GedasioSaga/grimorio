/**
 * Régua do mapa: converte px de página do tldraw em "quadrados" da grade.
 *
 * O mapa de mesa não se mede em pixel — se mede em quadrado (a célula da
 * grade, `QUADRADO_PX` de lado). Este módulo faz só a conversão numérica
 * pura, sem tocar no editor, pra ficar fácil de testar e reusar tanto no
 * chip de medida da seleção quanto na distância entre duas formas.
 */

export interface Caixa {
  x: number
  y: number
  w: number
  h: number
}

/** Converte px de página em quadrados da grade, 1 casa decimal com vírgula quando não inteiro ("6" / "6,5"). */
export function emQuadrados(px: number, quadradoPx: number): string {
  const quadrados = Math.round((px / quadradoPx) * 10) / 10
  if (Number.isInteger(quadrados)) return String(quadrados)
  return quadrados.toFixed(1).replace('.', ',')
}

/** "L×A" em quadrados ("6×4", "6,5×4"). */
export function medidaDeCaixa(wPx: number, hPx: number, quadradoPx: number): string {
  return `${emQuadrados(wPx, quadradoPx)}×${emQuadrados(hPx, quadradoPx)}`
}

/** Distância entre as bordas mais próximas de duas caixas, em px; 0 quando sobrepõem/encostam. */
export function distanciaEntreCaixas(a: Caixa, b: Caixa): number {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0)
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0)
  return Math.sqrt(dx * dx + dy * dy)
}
