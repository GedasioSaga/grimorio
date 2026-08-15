import { describe, it, expect } from 'vitest'
import {
  CONTROLE_BASE_PX, CONTROLE_PISO_PX, CONTROLE_TETO,
  FONTE_MIN, FONTE_MAX, escalaDosControles, proximaEscala,
} from '../lib/escalaFonte'

/** O que o olho vê: px do CSS × escala do card × zoom da câmera × a correção. */
function tamanhoNaTela(cardFe: number, zoom: number): number {
  return CONTROLE_BASE_PX * cardFe * zoom * escalaDosControles(cardFe, zoom)
}

describe('proximaEscala', () => {
  it('aumenta em passo de 0.1', () => {
    expect(proximaEscala(1, 0.1)).toBe(1.1)
  })
  it('diminui em passo de 0.1', () => {
    expect(proximaEscala(1, -0.1)).toBe(0.9)
  })
  it('trava no mínimo', () => {
    expect(proximaEscala(FONTE_MIN, -0.1)).toBe(FONTE_MIN)
  })
  it('trava no máximo', () => {
    expect(proximaEscala(FONTE_MAX, 0.1)).toBe(FONTE_MAX)
  })
  it('arredonda para 1 casa (sem erro de ponto flutuante)', () => {
    expect(proximaEscala(1.1, 0.1)).toBe(1.2)
  })
})

describe('escalaDosControles', () => {
  it('não encolhe nada quando o controle já passa do piso', () => {
    // card grande, câmera parada: 12 × 2 × 1 = 24px na tela, bem acima do piso
    expect(escalaDosControles(2, 1)).toBe(1)
  })

  it('nunca devolve menos que 1 — corrigir não pode piorar o caso bom', () => {
    for (const cardFe of [0.4, 1, 2]) {
      for (const zoom of [0.1, 0.5, 1, 4]) {
        expect(escalaDosControles(cardFe, zoom)).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('alcança o piso quando o teto permite', () => {
    // câmera a 70%: natural = 12 × 1 × 0.7 = 8.4px, abaixo do piso; o fator necessário
    // (14/8.4 = 1.67) cabe dentro do teto, então o controle chega ao tamanho pedido
    expect(CONTROLE_BASE_PX * 1 * 0.7).toBeLessThan(CONTROLE_PISO_PX)
    expect(tamanhoNaTela(1, 0.7)).toBeGreaterThanOrEqual(CONTROLE_PISO_PX)
  })

  /**
   * O contrato honesto: piso e teto CONFLITAM, e o teto ganha.
   *
   * `escalaDoCartao(100, 1) = 0.417` é um card estreitado à mão pelo usuário. Chegar ao piso
   * ali exigiria fator 2.8, e o controle passaria de duas vezes o texto do próprio card —
   * dentro do card, onde o zoom não entra na conta, isso quebra o layout da ficha. Entre um
   * botão legível num card ilegível e um card legível com botão apertado, o card ganha: ler a
   * ficha é a função dele. O ganho fica em 2,2× (de ~5px para ~11px), não no piso cheio.
   */
  it('quando piso e teto brigam, o teto ganha — e o ganho ainda é de 2,2×', () => {
    const antes = CONTROLE_BASE_PX * 0.417 * 1
    expect(escalaDosControles(0.417, 1)).toBe(CONTROLE_TETO)
    expect(tamanhoNaTela(0.417, 1)).toBeCloseTo(antes * CONTROLE_TETO, 5)
    expect(tamanhoNaTela(0.417, 1)).toBeLessThan(CONTROLE_PISO_PX)
  })

  it('respeita o teto: em zoom muito afastado o botão não engole o card', () => {
    expect(escalaDosControles(1, 0.05)).toBe(CONTROLE_TETO)
  })

  it('quantiza para a variável CSS não mudar a cada quadro do zoom', () => {
    // dois zooms quase iguais têm de cair no mesmo passo, senão todo card visível remonta
    expect(escalaDosControles(1, 0.7)).toBe(escalaDosControles(1, 0.701))
    expect(escalaDosControles(1, 0.7) * 20 % 1).toBe(0)
  })

  it('zoom ou escala inválidos caem em 1 em vez de quebrar o card', () => {
    for (const ruim of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(escalaDosControles(1, ruim)).toBe(1)
      expect(escalaDosControles(ruim, 1)).toBe(1)
    }
  })
})
