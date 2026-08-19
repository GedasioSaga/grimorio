import { fundirIntervalos, type Aresta, type Ponto } from './ancoraPorta'

/**
 * Parede interna some quando dois cômodos se encostam.
 *
 * ## O problema
 *
 * Duas salas encostadas desenham DUAS paredes na junção, uma de cada peça. Na tela isso vira
 * um traço duplo com uma fresta entre eles, e os jogadores leem a fresta como alguma coisa —
 * um vão, uma passagem, um corredor de um dedo de largura. O contorno mente sobre a ficção:
 * ali não há parede nenhuma, é o mesmo ambiente.
 *
 * O mesmo vale para o corredor encostado na sala, que é o gesto mais comum de todos: cada
 * junção ganha uma parede que não existe.
 *
 * ## A abordagem
 *
 * Não se funde SHAPE, funde-se CONTORNO. As peças continuam independentes — cada uma com seu
 * nome, estado, cor, vínculo e linha no painel de camadas —, mas cada uma para de desenhar os
 * trechos de parede que caem dentro (ou em cima da borda) de uma peça vizinha de massa.
 *
 * Isso reaproveita inteira a máquina que a porta ancorada já construiu: o contorno do cômodo
 * é uma lista de trechos com buracos (`trechosSemVao`), e aqui só se acrescentam mais buracos
 * à mesma lista. Fundir shape de verdade exigiria um recortador de polígonos genérico — outra
 * ordem de risco, e sem ganho visual sobre isto.
 *
 * O que ISTO NÃO faz, e é honesto dizer: duas salas encostadas continuam sendo duas peças
 * (duas seleções, duas linhas de camada), e não existe subtração de área. O que se resolve é
 * a parede dupla, que é o que aparece na mesa.
 */

/** Peças que contam como massa construída — as que "engolem" a parede da vizinha. */
export const TIPOS_MASSA = new Set(['sala-mapa', 'sala-poligono-mapa', 'corredor-mapa'])

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
