import { describe, expect, it } from 'vitest'
import { arestasDeCaixa } from '../lib/ancoraPorta'
import { contornoDaUniao, poligonoDeCaixa, trechosCobertos } from '../lib/recorteGeometria'

/**
 * Recorte de aresta contra polígono: que pedaço desta parede cai dentro daquela peça.
 *
 * A geometria é a mesma que a fusão automática usava antes de ser revertida — ela estava
 * certa; errado era quem mandava nela. Agora serve ao comando explícito de unir salas.
 */

/** Desloca um polígono, para simular a peça vizinha em outra posição de página. */
function em(poligono: Array<{ x: number; y: number }>, dx: number, dy: number) {
  return poligono.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

const SALA = arestasDeCaixa(200, 100)

describe('salas encostadas parede com parede', () => {
  it('a parede da JUNÇÃO é coberta inteira', () => {
    // vizinha colada à direita: a aresta 1 (x = 200) coincide com a borda esquerda dela
    const vizinha = em(poligonoDeCaixa(200, 100), 200, 0)
    const cobertos = trechosCobertos(SALA[1], vizinha)
    expect(cobertos.length).toBeGreaterThan(0)
    const total = cobertos.reduce((s, c) => s + (c.fim - c.inicio), 0)
    expect(total).toBeCloseTo(1, 2)
  })

  it('as outras três paredes continuam inteiras', () => {
    const vizinha = em(poligonoDeCaixa(200, 100), 200, 0)
    for (const i of [0, 2, 3]) {
      const total = trechosCobertos(SALA[i], vizinha).reduce((s, c) => s + (c.fim - c.inicio), 0)
      expect(total, `aresta ${i}`).toBeCloseTo(0, 3)
    }
  })

  it('encosto PARCIAL cobre só o pedaço encostado', () => {
    // corredor de meia altura encostado no meio da parede direita — o caso mais comum de
    // todos: o corredor que liga dois cômodos.
    const corredor = em(poligonoDeCaixa(120, 40), 200, 30)
    const cobertos = trechosCobertos(SALA[1], corredor)
    const total = cobertos.reduce((s, c) => s + (c.fim - c.inicio), 0)
    // 40 de 100 px de parede
    expect(total).toBeCloseTo(0.4, 2)
  })
})

describe('salas sobrepostas', () => {
  it('o pedaço da parede que entra na vizinha é coberto', () => {
    // vizinha invadindo 60px pela direita, cobrindo metade da altura
    const vizinha = em(poligonoDeCaixa(200, 50), 140, 0)
    const cobertos = trechosCobertos(SALA[0], vizinha)
    const total = cobertos.reduce((s, c) => s + (c.fim - c.inicio), 0)
    // a aresta de cima (200px) tem 60px dentro da vizinha
    expect(total).toBeCloseTo(60 / 200, 2)
  })

  it('peça longe não cobre nada', () => {
    const longe = em(poligonoDeCaixa(50, 50), 900, 900)
    for (const aresta of SALA) {
      expect(trechosCobertos(aresta, longe)).toEqual([])
    }
  })

  it('peça inteiramente DENTRO não corta a parede externa', () => {
    // um pilar desenhado no miolo do cômodo não deve abrir buraco no contorno de fora
    const pilar = em(poligonoDeCaixa(20, 20), 90, 40)
    for (const aresta of SALA) {
      const total = trechosCobertos(aresta, pilar).reduce((s, c) => s + (c.fim - c.inicio), 0)
      expect(total).toBeCloseTo(0, 3)
    }
  })
})

describe('bordas do algoritmo', () => {
  it('polígono degenerado não cobre nada', () => {
    expect(trechosCobertos(SALA[0], [])).toEqual([])
    expect(trechosCobertos(SALA[0], [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([])
  })

  it('aresta de comprimento zero não vira NaN', () => {
    const degenerada = { a: { x: 5, y: 5 }, b: { x: 5, y: 5 } }
    const r = trechosCobertos(degenerada, poligonoDeCaixa(100, 100))
    expect(r.every((c) => Number.isFinite(c.inicio) && Number.isFinite(c.fim))).toBe(true)
  })

  it('as frações devolvidas ficam dentro de 0..1', () => {
    const vizinha = em(poligonoDeCaixa(400, 400), 100, -100)
    for (const aresta of SALA) {
      for (const c of trechosCobertos(aresta, vizinha)) {
        expect(c.inicio).toBeGreaterThanOrEqual(0)
        expect(c.fim).toBeLessThanOrEqual(1)
        expect(c.fim).toBeGreaterThan(c.inicio)
      }
    }
  })
})

describe('contorno da união', () => {
  const desloca = (p: Array<{ x: number; y: number }>, dx: number, dy: number) =>
    p.map((v) => ({ x: v.x + dx, y: v.y + dy }))

  /** Área do polígono pela fórmula do laço (shoelace), em valor absoluto. */
  function area(pontos: Array<{ x: number; y: number }>) {
    let s = 0
    for (let i = 0; i < pontos.length; i++) {
      const a = pontos[i]
      const b = pontos[(i + 1) % pontos.length]
      s += a.x * b.y - b.x * a.y
    }
    return Math.abs(s) / 2
  }

  it('duas salas coladas viram um retângulo só', () => {
    const uniao = contornoDaUniao([poligonoDeCaixa(200, 100), desloca(poligonoDeCaixa(200, 100), 200, 0)])!
    expect(uniao).not.toBeNull()
    // 400×100: a parede da junção não entra, e a área é a soma
    expect(area(uniao)).toBeCloseTo(400 * 100, 0)
  })

  it('duas salas em L viram um polígono em L, com a área da união', () => {
    const uniao = contornoDaUniao([poligonoDeCaixa(200, 100), desloca(poligonoDeCaixa(100, 200), 0, 100)])!
    expect(uniao).not.toBeNull()
    expect(area(uniao)).toBeCloseTo(200 * 100 + 100 * 200, 0)
    expect(uniao.length).toBeGreaterThanOrEqual(6)
  })

  it('sobrepostas não contam a área duas vezes', () => {
    const uniao = contornoDaUniao([poligonoDeCaixa(200, 200), desloca(poligonoDeCaixa(200, 200), 100, 100)])!
    expect(uniao).not.toBeNull()
    // 2 × 40000 menos a interseção de 100×100
    expect(area(uniao)).toBeCloseTo(2 * 40000 - 10000, 0)
  })

  it('RECUSA peças que não se tocam — seriam duas ilhas', () => {
    // um polígono só não representa duas ilhas; unir errado tiraria as peças originais do
    // mestre e devolveria uma forma que ele não desenhou
    expect(contornoDaUniao([poligonoDeCaixa(100, 100), desloca(poligonoDeCaixa(100, 100), 500, 500)])).toBeNull()
  })

  it('RECUSA uma peça só', () => {
    expect(contornoDaUniao([poligonoDeCaixa(100, 100)])).toBeNull()
    expect(contornoDaUniao([])).toBeNull()
  })

  it('peça inteiramente dentro da outra devolve o contorno da maior', () => {
    const uniao = contornoDaUniao([poligonoDeCaixa(400, 400), desloca(poligonoDeCaixa(80, 80), 100, 100)])
    // a de dentro não contribui aresta nenhuma; o resultado é a de fora
    if (uniao) expect(area(uniao)).toBeCloseTo(400 * 400, 0)
  })

  it('nenhum vértice sai NaN', () => {
    const uniao = contornoDaUniao([poligonoDeCaixa(200, 100), desloca(poligonoDeCaixa(200, 100), 200, 0)])!
    expect(uniao.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y))).toBe(true)
  })
})
