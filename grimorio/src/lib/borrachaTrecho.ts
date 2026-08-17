/**
 * Borracha de TRECHO: apaga só o pedaço de uma polilinha que a borracha passou por cima,
 * deixando o resto no lugar — em vez do eraser nativo do tldraw, que sempre some com o
 * SHAPE inteiro (`editor.deleteShapes`, ver `EraserTool/childStates/Erasing.ts:175`).
 *
 * Geometria pura, sem tldraw: dado os pontos da linha (em qualquer espaço de coordenadas
 * — quem chama já converteu a borracha para o mesmo espaço dos pontos, ver
 * `BorrachaTrechoMapaTool.tsx`) e um ou mais círculos de borracha passando por cima,
 * devolve os pedaços que sobraram. Cada pedaço é uma nova polilinha; zero pedaços
 * significa "a peça inteira foi consumida"; um pedaço IDÊNTICO (mesma referência) ao
 * array de entrada significa "a borracha não encostou em nada".
 *
 * Método: cada segmento p[i]→p[i+1] é testado contra cada círculo por interseção
 * segmento-círculo (equação quadrática em t, o parâmetro 0..1 ao longo do segmento —
 * fórmula padrão de "closest point on line vs sphere", aqui em 2D). Os intervalos de t
 * cobertos por CADA círculo são unidos por segmento; o complemento é o que sobra. Pedaços
 * mantidos de segmentos vizinhos são costurados numa cadeia só quando se tocam exatamente
 * no vértice compartilhado (nada foi apagado bem ali); um buraco no meio de um segmento,
 * ou entre dois segmentos, começa uma cadeia nova — é isso que faz "corte no meio" virar
 * duas polilinhas em vez de uma só encolhida.
 */

export interface PontoLinha {
  x: number
  y: number
}

export interface CirculoBorracha {
  x: number
  y: number
  raio: number
}

/** Abaixo disso, um pedaço "sobrando" é ruído de ponto-flutuante, não geometria real. */
const LARGURA_FISICA_MINIMA = 1e-6
/** Tolerância para "esse t é essencialmente 0/1" (toca o vértice original do segmento). */
const EPS_T = 1e-9

interface FaixaMantida {
  segmento: number
  t0: number
  t1: number
}

function mesclarIntervalos(intervalos: Array<[number, number]>): Array<[number, number]> {
  if (intervalos.length === 0) return []
  const ordenados = [...intervalos].sort((a, b) => a[0] - b[0])
  const mescladas: Array<[number, number]> = [ordenados[0]]
  for (let i = 1; i < ordenados.length; i++) {
    const ultima = mescladas[mescladas.length - 1]
    const atual = ordenados[i]
    if (atual[0] <= ultima[1] + EPS_T) {
      ultima[1] = Math.max(ultima[1], atual[1])
    } else {
      mescladas.push(atual)
    }
  }
  return mescladas
}

/** Interseção segmento-círculo: intervalo de t (0..1) em que o segmento entra no círculo. */
function intervaloCobertoPeloCirculo(
  a: PontoLinha,
  dx: number,
  dy: number,
  lenSq: number,
  circulo: CirculoBorracha,
): [number, number] | null {
  const ax = a.x - circulo.x
  const ay = a.y - circulo.y
  const coefB = 2 * (dx * ax + dy * ay)
  const coefC = ax * ax + ay * ay - circulo.raio * circulo.raio
  const discriminante = coefB * coefB - 4 * lenSq * coefC
  if (discriminante < 0) return null // segmento inteiro fora do círculo (ver JSDoc do arquivo)

  const raizDisc = Math.sqrt(discriminante)
  const t1 = (-coefB - raizDisc) / (2 * lenSq)
  const t2 = (-coefB + raizDisc) / (2 * lenSq)
  const lo = Math.max(0, Math.min(t1, t2))
  const hi = Math.min(1, Math.max(t1, t2))
  return hi > lo ? [lo, hi] : null
}

/** Faixas [0,1] mantidas de UM segmento, depois de descontar todos os círculos. */
function faixasDoSegmento(
  indiceSegmento: number,
  a: PontoLinha,
  b: PontoLinha,
  circulos: CirculoBorracha[],
): { faixas: FaixaMantida[]; foiCortado: boolean } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const segLen = Math.sqrt(lenSq)

  // segmento degenerado (dois pontos iguais): não há o que cortar, mantém inteiro.
  if (lenSq < 1e-12) return { faixas: [{ segmento: indiceSegmento, t0: 0, t1: 1 }], foiCortado: false }

  const cobertos: Array<[number, number]> = []
  for (const circulo of circulos) {
    const intervalo = intervaloCobertoPeloCirculo(a, dx, dy, lenSq, circulo)
    if (intervalo) cobertos.push(intervalo)
  }
  if (cobertos.length === 0) return { faixas: [{ segmento: indiceSegmento, t0: 0, t1: 1 }], foiCortado: false }

  const mesclados = mesclarIntervalos(cobertos)
  const faixas: FaixaMantida[] = []
  let cursor = 0
  for (const [lo, hi] of mesclados) {
    if ((lo - cursor) * segLen > LARGURA_FISICA_MINIMA) faixas.push({ segmento: indiceSegmento, t0: cursor, t1: lo })
    cursor = Math.max(cursor, hi)
  }
  if ((1 - cursor) * segLen > LARGURA_FISICA_MINIMA) faixas.push({ segmento: indiceSegmento, t0: cursor, t1: 1 })
  return { faixas, foiCortado: true }
}

function lerpPonto(a: PontoLinha, b: PontoLinha, t: number): PontoLinha {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/**
 * Apaga, de `pontos`, tudo que caiu dentro de algum dos `circulos`.
 *
 * @returns lista de polilinhas restantes. `[]` = a linha inteira foi consumida.
 *   `[pontos]` (mesma referência) = a borracha não encostou em nada.
 */
export function apagarTrechoDaLinha(pontos: PontoLinha[], circulos: CirculoBorracha[]): PontoLinha[][] {
  if (pontos.length < 2 || circulos.length === 0) return [pontos]

  const todasAsFaixas: FaixaMantida[] = []
  let houveCorte = false
  for (let i = 0; i < pontos.length - 1; i++) {
    const { faixas, foiCortado } = faixasDoSegmento(i, pontos[i], pontos[i + 1], circulos)
    if (foiCortado) houveCorte = true
    todasAsFaixas.push(...faixas)
  }
  if (!houveCorte) return [pontos]

  const cadeias: PontoLinha[][] = []
  let cadeiaAtual: PontoLinha[] | null = null
  let faixaAnterior: FaixaMantida | null = null

  for (const faixa of todasAsFaixas) {
    const a = pontos[faixa.segmento]
    const b = pontos[faixa.segmento + 1]
    const inicio = faixa.t0 <= EPS_T ? a : lerpPonto(a, b, faixa.t0)
    const fim = faixa.t1 >= 1 - EPS_T ? b : lerpPonto(a, b, faixa.t1)

    // conecta com a cadeia em andamento só se as duas faixas se tocam exatamente no
    // vértice compartilhado — senão há um buraco ali (mesmo dentro do mesmo segmento,
    // quando um segmento tem duas faixas mantidas separadas por um corte no meio dele).
    const conecta =
      cadeiaAtual !== null &&
      faixaAnterior !== null &&
      faixa.segmento === faixaAnterior.segmento + 1 &&
      faixaAnterior.t1 >= 1 - EPS_T &&
      faixa.t0 <= EPS_T

    if (conecta && cadeiaAtual) {
      cadeiaAtual.push(fim)
    } else {
      if (cadeiaAtual && cadeiaAtual.length >= 2) cadeias.push(cadeiaAtual)
      cadeiaAtual = [inicio, fim]
    }
    faixaAnterior = faixa
  }
  if (cadeiaAtual && cadeiaAtual.length >= 2) cadeias.push(cadeiaAtual)

  return cadeias
}
