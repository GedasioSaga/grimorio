/**
 * Régua do mapa: converte px de página do tldraw em "quadrados" da grade.
 *
 * O mapa de mesa não se mede em pixel — se mede em quadrado (a célula da
 * grade, `QUADRADO_PX` de lado). Este módulo faz só a conversão numérica
 * pura, sem tocar no editor, pra ficar fácil de testar e reusar tanto no
 * chip de medida da seleção quanto na distância entre duas formas.
 */

/** Lado do quadrado da grade, em px de página. 1 quadrado = 1 célula de mapa de mesa. */
export const QUADRADO_PX = 32

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

/** Passos "redondos" de quadrado disponíveis pra régua, do mais denso ao mais esparso. */
const PASSOS_REGUA = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]

/** Espaço mínimo em px de tela entre dois tiques, pra não virar borrão em zoom baixo. */
const TIQUE_MIN_PX = 8

/**
 * Passo da régua do mapa em quadrados, dado o zoom atual do editor.
 *
 * `tique`: de quantos em quantos quadrados desenhar um traço menor.
 * `rotulo`: de quantos em quantos quadrados escrever o número (sempre 5×tique,
 * então nunca fica mais denso que o tique nem sobrepõe o vizinho).
 *
 * Pega o menor passo da lista cujo espaçamento em tela (passo × zoom × QUADRADO_PX)
 * já alcança `TIQUE_MIN_PX` — em zoom alto isso cai em 1 quadrado por tique; em zoom
 * baixo, sobe pros múltiplos redondos seguintes.
 */
export function passoDaRegua(zoom: number): { tique: number; rotulo: number } {
  const tique = PASSOS_REGUA.find((passo) => passo * zoom * QUADRADO_PX >= TIQUE_MIN_PX) ?? PASSOS_REGUA[PASSOS_REGUA.length - 1]
  return { tique, rotulo: tique * 5 }
}
