import { fundirIntervalos, type Aresta, type Ponto } from './ancoraPorta'

/**
 * Recorte de aresta contra polígono — a geometria de "que pedaço desta parede está dentro
 * daquela peça".
 *
 * ## Uma nota sobre a história disto
 *
 * Este código nasceu tentando dissolver parede AUTOMATICAMENTE onde duas peças de massa se
 * tocavam, e foi revertido: a premissa estava errada. Compor planta com salas sobrepostas é
 * legítimo — salão de piso ao fundo, cômodos por cima —, e a regra apagava o contorno de
 * plantas inteiras em que a sobreposição era de propósito. Heurística não distingue "encostei
 * duas salas para virar um ambiente" de "desenhei um cômodo dentro do salão".
 *
 * A GEOMETRIA, porém, estava certa e testada. O que estava errado era quem mandava nela. Aqui
 * ela volta a serviço de um comando EXPLÍCITO — o mestre seleciona as salas e manda unir —,
 * onde a intenção é dele e não de um palpite do editor.
 */

/** Tolerância de encosto, em px de página. Abaixo disto duas bordas contam como a mesma. */
const TOLERANCIA = 0.5

/**
 * O ponto está dentro do polígono? Ray casting padrão.
 *
 * Ponto exatamente na borda é indefinido aqui de propósito — o caso "borda com borda" é
 * tratado antes, por `sobreposicaoColinear`, onde a resposta é exata em vez de depender de
 * qual lado do épsilon o ponto caiu.
 */
function dentroDoPoligono(ponto: Ponto, poligono: Ponto[]): boolean {
  let dentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i]
    const b = poligono[j]
    const cruza = a.y > ponto.y !== b.y > ponto.y
    if (!cruza) continue
    const x = ((b.x - a.x) * (ponto.y - a.y)) / (b.y - a.y) + a.x
    if (ponto.x < x) dentro = !dentro
  }
  return dentro
}

/**
 * Onde `aresta` se apoia numa aresta COLINEAR de `poligono`, em fração de `aresta`.
 *
 * É o caso que o ray casting não resolve: duas salas coladas parede com parede têm bordas
 * exatamente coincidentes, e o meio de um trecho dessas fica na FRONTEIRA do vizinho, onde
 * "está dentro?" não tem resposta estável. Aqui a resposta é geométrica: se os dois segmentos
 * são colineares e se sobrepõem, aquele pedaço é junção.
 */
function sobreposicaoColinear(aresta: Aresta, poligono: Ponto[]): Array<{ inicio: number; fim: number }> {
  const dx = aresta.b.x - aresta.a.x
  const dy = aresta.b.y - aresta.a.y
  const comprimento2 = dx * dx + dy * dy
  if (comprimento2 === 0) return []

  const saida: Array<{ inicio: number; fim: number }> = []

  for (let i = 0; i < poligono.length; i++) {
    const c = poligono[i]
    const d = poligono[(i + 1) % poligono.length]

    // colinear: as duas pontas do segmento vizinho caem sobre a reta desta aresta
    const distC = Math.abs((d.x - c.x) * (aresta.a.y - c.y) - (d.y - c.y) * (aresta.a.x - c.x))
    const compVizinho = Math.hypot(d.x - c.x, d.y - c.y)
    if (compVizinho === 0) continue
    if (distC / compVizinho > TOLERANCIA) continue

    const cruzado = dx * (d.y - c.y) - dy * (d.x - c.x)
    if (Math.abs(cruzado) / Math.sqrt(comprimento2) / compVizinho > 1e-6) continue

    const tC = ((c.x - aresta.a.x) * dx + (c.y - aresta.a.y) * dy) / comprimento2
    const tD = ((d.x - aresta.a.x) * dx + (d.y - aresta.a.y) * dy) / comprimento2
    const inicio = Math.max(0, Math.min(tC, tD))
    const fim = Math.min(1, Math.max(tC, tD))
    if (fim - inicio > 1e-6) saida.push({ inicio, fim })
  }

  return saida
}

/** Frações de `aresta` em que ela cruza a borda de `poligono`, para partir em sub-trechos. */
function cortesDaAresta(aresta: Aresta, poligono: Ponto[]): number[] {
  const cortes: number[] = [0, 1]
  const dx = aresta.b.x - aresta.a.x
  const dy = aresta.b.y - aresta.a.y

  for (let i = 0; i < poligono.length; i++) {
    const c = poligono[i]
    const d = poligono[(i + 1) % poligono.length]
    const ex = d.x - c.x
    const ey = d.y - c.y
    const denom = dx * ey - dy * ex
    if (Math.abs(denom) < 1e-9) continue // paralelas: o colinear já cuidou

    const t = ((c.x - aresta.a.x) * ey - (c.y - aresta.a.y) * ex) / denom
    const u = ((c.x - aresta.a.x) * dy - (c.y - aresta.a.y) * dx) / denom
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cortes.push(t)
  }

  return [...new Set(cortes)].sort((a, b) => a - b)
}

/**
 * Trechos de `aresta` cobertos por `poligono` — o que NÃO deve ser desenhado como parede.
 *
 * Cobre os dois jeitos de duas peças se encontrarem: encostadas (bordas coincidentes) e
 * sobrepostas (uma invade a outra). No primeiro caso a resposta vem da colinearidade; no
 * segundo, de partir a aresta nos cruzamentos e perguntar se cada pedacinho está dentro.
 */
export function trechosCobertos(
  aresta: Aresta,
  poligono: Ponto[],
): Array<{ inicio: number; fim: number }> {
  if (poligono.length < 3) return []

  const cobertos = sobreposicaoColinear(aresta, poligono)

  const cortes = cortesDaAresta(aresta, poligono)
  for (let i = 0; i < cortes.length - 1; i++) {
    const inicio = cortes[i]
    const fim = cortes[i + 1]
    if (fim - inicio <= 1e-6) continue
    const meio = (inicio + fim) / 2
    const ponto = {
      x: aresta.a.x + (aresta.b.x - aresta.a.x) * meio,
      y: aresta.a.y + (aresta.b.y - aresta.a.y) * meio,
    }
    if (dentroDoPoligono(ponto, poligono)) cobertos.push({ inicio, fim })
  }

  // FUNDIDO antes de sair: os dois caminhos acima (colinear e ray casting) acham o mesmo
  // pedaço quando as peças estão coladas E sobrepostas, e devolver duplicata faria qualquer
  // soma dar o dobro. Quem chama não deve precisar saber disso.
  return fundirIntervalos(cobertos)
}

/** Retângulo `w`×`h` como polígono de quatro pontos — atalho para as peças de caixa. */
export function poligonoDeCaixa(w: number, h: number): Ponto[] {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]
}

/**
 * Contorno da UNIÃO de várias peças: as arestas de cada uma, sem os pedaços que caem dentro
 * das outras, costurados num anel fechado.
 *
 * ## Como funciona
 *
 * É boolean por classificação de aresta, não por recortador genérico de polígonos. Cada
 * parede é cortada nos pontos em que cruza as vizinhas; o que sobra do lado de FORA de todas
 * é, por definição, o contorno da união. Depois os pedaços soltos são costurados ponta a
 * ponta.
 *
 * Isso cobre o que uma planta precisa — retângulos e polígonos simples encostados ou
 * sobrepostos — sem carregar um clipper completo. E, importante, ele SE RECUSA a inventar:
 * quando a costura não fecha, devolve `null` em vez de um anel torto.
 *
 * ## Quando devolve `null`, e por quê isso importa
 *
 * - peças que não se tocam: a união seriam duas ilhas, e um polígono só não representa isso
 * - união com buraco no meio (uma sala cercando outra): o anel externo não conta o furo, e
 *   desenhar só o externo apagaria o pátio interno da planta
 *
 * Nos dois casos o certo é não fazer nada e dizer por quê. Unir errado é pior que não unir:
 * o mestre perde as peças originais e recebe uma forma que ele não desenhou.
 */
export function contornoDaUniao(pecas: Ponto[][]): Ponto[] | null {
  if (pecas.length < 2) return null

  const sobreviventes: Array<{ a: Ponto; b: Ponto }> = []

  pecas.forEach((peca, indice) => {
    const outras = pecas.filter((_, i) => i !== indice)
    for (const aresta of arestasDoAnel(peca)) {
      const cobertos = fundirIntervalos(outras.flatMap((o) => trechosCobertos(aresta, o)))
      for (const trecho of complementoDe(cobertos)) {
        const inicio = pontoEm(aresta, trecho.inicio)
        const fim = pontoEm(aresta, trecho.fim)
        if (Math.hypot(fim.x - inicio.x, fim.y - inicio.y) > TOLERANCIA) {
          sobreviventes.push({ a: inicio, b: fim })
        }
      }
    }
  })

  return costurarAnel(sobreviventes)
}

function arestasDoAnel(pontos: Ponto[]): Aresta[] {
  return pontos.map((p, i) => ({ a: p, b: pontos[(i + 1) % pontos.length] }))
}

function pontoEm(aresta: Aresta, t: number): Ponto {
  return {
    x: aresta.a.x + (aresta.b.x - aresta.a.x) * t,
    y: aresta.a.y + (aresta.b.y - aresta.a.y) * t,
  }
}

/** O que sobra de 0..1 depois de tirar os intervalos cobertos (já fundidos). */
function complementoDe(cobertos: Array<{ inicio: number; fim: number }>) {
  const saida: Array<{ inicio: number; fim: number }> = []
  let cursor = 0
  for (const c of cobertos) {
    if (c.inicio > cursor) saida.push({ inicio: cursor, fim: c.inicio })
    cursor = Math.max(cursor, c.fim)
  }
  if (cursor < 1) saida.push({ inicio: cursor, fim: 1 })
  return saida
}

/**
 * Costura segmentos soltos num anel fechado, seguindo ponta com ponta.
 *
 * Devolve `null` se sobrar segmento sem par, se a corrente não voltar ao começo, ou se o anel
 * fechar antes de consumir tudo — os três significam que a união não é um polígono simples, e
 * é aí que este código tem que desistir em vez de inventar.
 */
function costurarAnel(segmentos: Array<{ a: Ponto; b: Ponto }>): Ponto[] | null {
  if (segmentos.length < 3) return null

  const restantes = [...segmentos]
  const primeiro = restantes.shift()!
  const anel: Ponto[] = [primeiro.a]
  let ponta = primeiro.b

  while (restantes.length > 0) {
    const i = restantes.findIndex(
      (s) => perto(s.a, ponta) || perto(s.b, ponta),
    )
    if (i === -1) return null // corrente quebrada: a união não é um anel só

    const [seguinte] = restantes.splice(i, 1)
    const proximaPonta = perto(seguinte.a, ponta) ? seguinte.b : seguinte.a
    // vértice repetido não acrescenta forma e engorda a peça à toa
    if (!perto(ponta, anel[anel.length - 1])) anel.push(ponta)
    ponta = proximaPonta
  }

  if (!perto(ponta, anel[0])) return null // não voltou ao começo
  if (anel.length < 3) return null
  return anel
}

function perto(a: Ponto, b: Ponto): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= TOLERANCIA * 4
}
