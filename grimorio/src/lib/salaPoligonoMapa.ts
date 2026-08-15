/**
 * Metade pura da sala em polígono — geometria sem tldraw, mesmo papel que `salaMapa.ts`
 * cumpre para a sala retangular (que também reaproveita `aparenciaDaSala`/`quebrarRotulo`
 * daquele arquivo: cor de estado e quebra de rótulo são as MESMAS regras nos dois formatos
 * de sala, só a geometria muda).
 */

export interface PontoPoligono {
  x: number
  y: number
}

/**
 * Vértices de nascença: um cômodo em L, a forma que a sala retangular sozinha não cobre
 * (compor com retângulos encostados deixa emenda visível — ver cabeçalho de
 * `SalaPoligonoMapaShape.tsx`). Coordenadas locais ao shape, em múltiplos de 20px — o
 * mesmo passo do grid do mapa — para nascer já alinhável a uma sala vizinha sem precisar
 * de ajuste fino.
 */
export const PONTOS_SALA_POLIGONO_PADRAO: PontoPoligono[] = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 100 },
  { x: 100, y: 100 },
  { x: 100, y: 180 },
  { x: 0, y: 180 },
]

/** Centro geométrico (média dos vértices) — usado para posicionar o rótulo. Aproximação
 * de propósito (não é o centroide exato de área): para as formas em L/T comuns num mapa
 * de RPG, a média dos vértices já cai dentro do polígono, e a conta é bem mais simples. */
export function centroDoPoligono(pontos: PontoPoligono[]): PontoPoligono {
  const somaX = pontos.reduce((soma, p) => soma + p.x, 0)
  const somaY = pontos.reduce((soma, p) => soma + p.y, 0)
  return { x: somaX / pontos.length, y: somaY / pontos.length }
}

/** Caixa delimitadora dos vértices — usada para quebrar o rótulo na largura do polígono,
 * do mesmo jeito que a sala retangular quebra na sua própria largura. */
export function limitesDoPoligono(pontos: PontoPoligono[]) {
  const xs = pontos.map((p) => p.x)
  const ys = pontos.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY }
}
