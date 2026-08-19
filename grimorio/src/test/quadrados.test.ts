import { describe, expect, it } from 'vitest'
import {
  distanciaEntreCaixas,
  emQuadrados,
  medidaDeCaixa,
  parseQuadrados,
  passoDaRegua,
  quadradosParaPx,
  type Caixa,
} from '../lib/quadrados'

describe('emQuadrados', () => {
  it('converte px inteiro em quadrados inteiros', () => {
    expect(emQuadrados(192, 32)).toBe('6')
  })

  it('converte px em quadrados com meio quadrado', () => {
    expect(emQuadrados(208, 32)).toBe('6,5')
  })

  it('arredonda a 1 casa decimal usando vírgula', () => {
    expect(emQuadrados(40, 32)).toBe('1,3')
  })

  it('trata zero', () => {
    expect(emQuadrados(0, 32)).toBe('0')
  })

  it('mantém o zero antes da vírgula em frações menores que 1', () => {
    expect(emQuadrados(9, 32)).toBe('0,3')
  })

  it('não formata "6,0" quando o arredondamento cai em valor inteiro', () => {
    expect(emQuadrados(191, 32)).toBe('6')
  })
})

describe('medidaDeCaixa', () => {
  it('combina largura e altura em quadrados no formato L×A', () => {
    expect(medidaDeCaixa(192, 128, 32)).toBe('6×4')
  })

  it('combina largura e altura quando um dos lados não é inteiro', () => {
    expect(medidaDeCaixa(208, 128, 32)).toBe('6,5×4')
  })
})

describe('distanciaEntreCaixas', () => {
  it('retorna 0 quando as caixas se sobrepõem', () => {
    const a: Caixa = { x: 0, y: 0, w: 10, h: 10 }
    const b: Caixa = { x: 5, y: 5, w: 10, h: 10 }
    expect(distanciaEntreCaixas(a, b)).toBe(0)
  })

  it('retorna 0 quando as caixas se encostam', () => {
    const a: Caixa = { x: 0, y: 0, w: 10, h: 10 }
    const b: Caixa = { x: 10, y: 0, w: 10, h: 10 }
    expect(distanciaEntreCaixas(a, b)).toBe(0)
  })

  it('mede a folga quando as caixas estão lado a lado no eixo x', () => {
    const a: Caixa = { x: 0, y: 0, w: 10, h: 10 }
    const b: Caixa = { x: 17, y: 0, w: 10, h: 10 }
    expect(distanciaEntreCaixas(a, b)).toBe(7)
  })

  it('mede a hipotenusa dos gaps quando as caixas estão separadas na diagonal', () => {
    const a: Caixa = { x: 0, y: 0, w: 10, h: 10 }
    const b: Caixa = { x: 13, y: 14, w: 10, h: 10 }
    expect(distanciaEntreCaixas(a, b)).toBe(5)
  })

  it('é simétrica (a→b igual a b→a)', () => {
    const a: Caixa = { x: 0, y: 0, w: 10, h: 10 }
    const b: Caixa = { x: 13, y: 14, w: 10, h: 10 }
    expect(distanciaEntreCaixas(a, b)).toBe(distanciaEntreCaixas(b, a))
  })
})

describe('parseQuadrados', () => {
  it('aceita número inteiro', () => {
    expect(parseQuadrados('6')).toBe(6)
  })

  it('aceita vírgula como separador decimal', () => {
    expect(parseQuadrados('6,5')).toBe(6.5)
  })

  it('aceita ponto como separador decimal', () => {
    expect(parseQuadrados('6.5')).toBe(6.5)
  })

  it('aceita zero', () => {
    expect(parseQuadrados('0')).toBe(0)
  })

  it('ignora espaços nas pontas', () => {
    expect(parseQuadrados('  6,5  ')).toBe(6.5)
  })

  it('rejeita string vazia', () => {
    expect(parseQuadrados('')).toBeNull()
  })

  it('rejeita string só com espaços', () => {
    expect(parseQuadrados('   ')).toBeNull()
  })

  /**
   * Este teste dizia o contrário — `expect(parseQuadrados('-2')).toBeNull()` — e estava
   * fixando um defeito no lugar de uma regra. A origem do mapa fica no MEIO do plano, não
   * num canto: metade da planta cresce para cima e para a esquerda dela, e `emQuadrados`
   * sempre formatou negativo sem reclamar. O campo X exibia `-5` e recusava `-4` de volta,
   * calado — o usuário via o número, digitava o vizinho, e o campo revertia sozinho.
   *
   * Largura e altura continuam sem aceitar zero ou negativo. Quem barra é o `minimoPositivo`
   * do `CampoQuadrado`, que sabe qual campo está sendo editado; o parser, que serve aos
   * quatro, não sabe e não deve chutar.
   */
  it('aceita coordenada negativa: X e Y existem dos dois lados da origem', () => {
    expect(parseQuadrados('-2')).toBe(-2)
    expect(parseQuadrados('-6,5')).toBe(-6.5)
    expect(parseQuadrados('  -0.5 ')).toBe(-0.5)
  })

  it('aceita o menos tipográfico (−, U+2212), que é o que chega ao colar de fora', () => {
    expect(parseQuadrados('−4')).toBe(-4)
    expect(parseQuadrados('−6,5')).toBe(-6.5)
  })

  it('continua rejeitando sinal solto ou duplicado', () => {
    expect(parseQuadrados('-')).toBeNull()
    expect(parseQuadrados('--2')).toBeNull()
    expect(parseQuadrados('2-')).toBeNull()
    expect(parseQuadrados('+2')).toBeNull()
  })

  it('rejeita texto que não é número', () => {
    expect(parseQuadrados('abc')).toBeNull()
  })

  it('aceita mais de uma casa decimal (arredondamento é responsabilidade de exibição, não do parser)', () => {
    expect(parseQuadrados('6,55')).toBe(6.55)
  })

  it('rejeita duas vírgulas', () => {
    expect(parseQuadrados('6,5,5')).toBeNull()
  })

  it('rejeita NaN literal', () => {
    expect(parseQuadrados('NaN')).toBeNull()
  })
})

describe('quadradosParaPx', () => {
  it('converte quadrados inteiros em px', () => {
    expect(quadradosParaPx(6, 32)).toBe(192)
  })

  it('converte quadrados fracionários em px', () => {
    expect(quadradosParaPx(6.5, 32)).toBe(208)
  })

  it('converte zero', () => {
    expect(quadradosParaPx(0, 32)).toBe(0)
  })
})

describe('passoDaRegua', () => {
  it('zoom 100%: tique por quadrado, rótulo a cada 5', () => {
    expect(passoDaRegua(1)).toEqual({ tique: 1, rotulo: 5 })
  })

  it('zoom alto (400%): continua por quadrado', () => {
    expect(passoDaRegua(4)).toEqual({ tique: 1, rotulo: 5 })
  })

  it('no limiar exato onde 1 quadrado ainda cabe (zoom = 0.25 → 8px/quadrado)', () => {
    expect(passoDaRegua(0.25)).toEqual({ tique: 1, rotulo: 5 })
  })

  it('logo abaixo do limiar, passa a agrupar de 2 em 2', () => {
    expect(passoDaRegua(0.24)).toEqual({ tique: 2, rotulo: 10 })
  })

  it('zoom baixo (10%): passos mais esparsos, sem sobrepor rótulo', () => {
    expect(passoDaRegua(0.1)).toEqual({ tique: 5, rotulo: 25 })
  })

  it('zoom bem baixo (5%): passo ainda maior', () => {
    expect(passoDaRegua(0.05)).toEqual({ tique: 5, rotulo: 25 })
  })

  it('zoom extremo (1%): usa o maior passo antes de virar borrão', () => {
    expect(passoDaRegua(0.01)).toEqual({ tique: 50, rotulo: 250 })
  })

  it('nunca deixa o rótulo mais denso que o tique (rótulo é sempre múltiplo de 5×tique)', () => {
    for (const zoom of [8, 2, 1, 0.5, 0.25, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005]) {
      const { tique, rotulo } = passoDaRegua(zoom)
      expect(rotulo).toBe(tique * 5)
    }
  })
})
