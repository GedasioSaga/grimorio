/**
 * Posições dos nós do grafo de vínculos, por força dirigida (Fruchterman-Reingold).
 *
 * Ligação puxa, todo mundo empurra todo mundo, e a agitação esfria a cada rodada até o
 * desenho assentar. É o algoritmo clássico porque ele produz exatamente a leitura que
 * interessa aqui: quem se relaciona fica perto, e grupos que não se falam se separam
 * sozinhos na tela — sem ninguém declarar grupo nenhum.
 *
 * DETERMINÍSTICO de propósito: o começo é um círculo calculado a partir do índice, não
 * sorteado. Abrir a teia duas vezes tem que dar o mesmo desenho, senão o usuário perde a
 * memória espacial que acabou de construir (e o teste não teria como afirmar nada).
 *
 * Lógica pura: sem React, sem store, sem DOM.
 */

export interface NoGrafo {
  id: string
  nome: string
}

export interface ArestaGrafo {
  de: string
  para: string
}

export interface Posicao {
  x: number
  y: number
}

export interface OpcoesLayout {
  largura?: number
  altura?: number
  /** Mais rodadas = desenho mais assentado e mais lento. 300 já converge no tamanho de um cofre. */
  rodadas?: number
}

const LARGURA_PADRAO = 1200
const ALTURA_PADRAO = 800
const RODADAS_PADRAO = 300

/** Distância mínima considerada entre dois nós: evita divisão por zero e força infinita. */
const EPSILON = 0.01

/**
 * Dois nós exatamente na mesma posição não têm direção de repulsão. Em vez de sortear
 * (o que quebraria o determinismo), desempata pelo índice: um vai para a direita do outro.
 */
function separar(i: number, j: number): { dx: number; dy: number; dist: number } {
  const dx = (i - j) * EPSILON
  return { dx, dy: EPSILON, dist: Math.hypot(dx, EPSILON) }
}

export function calcularLayout(
  nos: NoGrafo[],
  arestas: ArestaGrafo[],
  opts: OpcoesLayout = {},
): Record<string, Posicao> {
  const largura = opts.largura ?? LARGURA_PADRAO
  const altura = opts.altura ?? ALTURA_PADRAO
  const rodadas = opts.rodadas ?? RODADAS_PADRAO

  if (nos.length === 0) return {}
  if (nos.length === 1) return { [nos[0].id]: { x: largura / 2, y: altura / 2 } }

  // distância de repouso ideal entre dois nós: reparte a área disponível entre eles
  const k = Math.sqrt((largura * altura) / nos.length)

  // começo em círculo, pelo índice — determinístico e já bem espalhado
  const raio = Math.min(largura, altura) / 3
  const pos = nos.map((_, i) => {
    const ang = (2 * Math.PI * i) / nos.length
    return { x: largura / 2 + raio * Math.cos(ang), y: altura / 2 + raio * Math.sin(ang) }
  })

  const indice = new Map(nos.map((n, i) => [n.id, i]))
  // arestas resolvidas uma vez em pares de índice: o laço interno roda rodadas × arestas
  const pares = arestas
    .map((a) => [indice.get(a.de), indice.get(a.para)] as const)
    .filter((p): p is readonly [number, number] => p[0] !== undefined && p[1] !== undefined && p[0] !== p[1])

  // agitação inicial: cai linearmente até ~0, congelando o desenho no fim
  let temperatura = Math.min(largura, altura) / 10

  const desloc = nos.map(() => ({ x: 0, y: 0 }))

  for (let rodada = 0; rodada < rodadas; rodada++) {
    for (const d of desloc) { d.x = 0; d.y = 0 }

    // repulsão: todo par se empurra, com força k²/d
    for (let i = 0; i < nos.length; i++) {
      for (let j = i + 1; j < nos.length; j++) {
        let dx = pos[i].x - pos[j].x
        let dy = pos[i].y - pos[j].y
        let dist = Math.hypot(dx, dy)
        if (dist < EPSILON) ({ dx, dy, dist } = separar(i, j))
        const forca = (k * k) / dist
        const fx = (dx / dist) * forca
        const fy = (dy / dist) * forca
        desloc[i].x += fx; desloc[i].y += fy
        desloc[j].x -= fx; desloc[j].y -= fy
      }
    }

    // atração: quem está ligado se puxa, com força d²/k
    for (const [a, b] of pares) {
      let dx = pos[a].x - pos[b].x
      let dy = pos[a].y - pos[b].y
      let dist = Math.hypot(dx, dy)
      if (dist < EPSILON) ({ dx, dy, dist } = separar(a, b))
      const forca = (dist * dist) / k
      const fx = (dx / dist) * forca
      const fy = (dy / dist) * forca
      desloc[a].x -= fx; desloc[a].y -= fy
      desloc[b].x += fx; desloc[b].y += fy
    }

    for (let i = 0; i < nos.length; i++) {
      const d = desloc[i]
      const tamanho = Math.hypot(d.x, d.y)
      if (tamanho > EPSILON) {
        // o passo nunca passa da temperatura: sem isso o desenho oscila em vez de assentar
        const passo = Math.min(tamanho, temperatura) / tamanho
        pos[i].x += d.x * passo
        pos[i].y += d.y * passo
      }
      // preso na moldura: nó isolado (sem nenhuma ligação) só sofre repulsão e sairia da tela
      pos[i].x = Math.min(largura, Math.max(0, pos[i].x))
      pos[i].y = Math.min(altura, Math.max(0, pos[i].y))
    }

    temperatura = Math.max(0, temperatura * (1 - (rodada + 1) / rodadas))
  }

  enquadrar(pos, largura, altura)

  const out: Record<string, Posicao> = {}
  nos.forEach((n, i) => { out[n.id] = pos[i] })
  return out
}

/** Margem para o nome do nó não encostar na borda (o texto fica abaixo do círculo). */
const MARGEM = 60

/**
 * Estica o resultado para preencher a moldura, no lugar (muta `pos`).
 *
 * A simulação para onde a temperatura acabar, e o quanto ela ocupa depende do número de
 * nós: com poucos, a repulsão joga todo mundo contra as bordas e sobra um buraco no meio;
 * com muitos, tudo se aperta num canto. Reenquadrar no fim faz o desenho usar a tela toda
 * em qualquer tamanho de cofre.
 *
 * A escala é ÚNICA para os dois eixos de propósito: esticar x e y de forma independente
 * encheria melhor a tela, mas distorceria as distâncias — e é justamente a distância que
 * carrega o significado aqui ("estes dois se relacionam, aqueles não").
 */
function enquadrar(pos: Posicao[], largura: number, altura: number): void {
  const xs = pos.map((p) => p.x)
  const ys = pos.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const larguraUsada = maxX - minX
  const alturaUsada = maxY - minY

  const alvoL = Math.max(1, largura - 2 * MARGEM)
  const alvoA = Math.max(1, altura - 2 * MARGEM)
  // span zero num eixo (todos alinhados) não tem o que escalar: mantém 1 e centraliza
  const escala = Math.min(
    larguraUsada > 1 ? alvoL / larguraUsada : Infinity,
    alturaUsada > 1 ? alvoA / alturaUsada : Infinity,
  )
  const fator = Number.isFinite(escala) ? escala : 1

  // centraliza o que sobrar do eixo que não foi o limitante
  const sobraX = (largura - larguraUsada * fator) / 2
  const sobraY = (altura - alturaUsada * fator) / 2
  for (const p of pos) {
    p.x = (p.x - minX) * fator + sobraX
    p.y = (p.y - minY) * fator + sobraY
  }
}
