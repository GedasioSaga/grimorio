import { describe, expect, it } from 'vitest'
import { arestasDeCaixa } from '../lib/ancoraPorta'
import { poligonoDeCaixa, trechosCobertos } from '../lib/fusaoParedes'

/**
 * Parede interna somindo entre cômodos encostados.
 *
 * O que se protege aqui é o caso da mesa: duas salas coladas desenhavam DUAS paredes na
 * junção, e a fresta entre elas era lida pelos jogadores como um vão que não existe na
 * ficção.
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
