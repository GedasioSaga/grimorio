import { describe, it, expect } from 'vitest'
import { apagarTrechoDaLinha, type PontoLinha } from '../lib/borrachaTrecho'

describe('apagarTrechoDaLinha', () => {
  it('borracha que não encosta: devolve os MESMOS pontos, por referência', () => {
    const pontos: PontoLinha[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const resultado = apagarTrechoDaLinha(pontos, [{ x: 500, y: 500, raio: 10 }])
    expect(resultado).toHaveLength(1)
    expect(resultado[0]).toBe(pontos) // mesma referência: nada foi tocado
  })

  it('sem círculo nenhum, devolve os pontos intactos', () => {
    const pontos: PontoLinha[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    expect(apagarTrechoDaLinha(pontos, [])[0]).toBe(pontos)
  })

  it('corte na ponta: encurta a linha (continua uma peça só)', () => {
    const pontos: PontoLinha[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    // círculo de raio 10 centrado bem na ponta inicial
    const resultado = apagarTrechoDaLinha(pontos, [{ x: 0, y: 0, raio: 10 }])
    expect(resultado).toHaveLength(1)
    const [linha] = resultado
    expect(linha[0].x).toBeCloseTo(10, 5)
    expect(linha[0].y).toBeCloseTo(0, 5)
    expect(linha[linha.length - 1]).toEqual({ x: 100, y: 0 })
  })

  it('corte no meio: vira duas peças', () => {
    const pontos: PontoLinha[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const resultado = apagarTrechoDaLinha(pontos, [{ x: 50, y: 0, raio: 10 }])
    expect(resultado).toHaveLength(2)
    const [esquerda, direita] = resultado
    expect(esquerda[0]).toEqual({ x: 0, y: 0 })
    expect(esquerda[esquerda.length - 1].x).toBeCloseTo(40, 5)
    expect(direita[0].x).toBeCloseTo(60, 5)
    expect(direita[direita.length - 1]).toEqual({ x: 100, y: 0 })
  })

  it('corte que consome tudo: a linha some (array vazio)', () => {
    const pontos: PontoLinha[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const resultado = apagarTrechoDaLinha(pontos, [{ x: 50, y: 0, raio: 200 }])
    expect(resultado).toEqual([])
  })

  it('vários cortes na mesma passada: cada um abre um buraco', () => {
    const pontos: PontoLinha[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const resultado = apagarTrechoDaLinha(pontos, [
      { x: 25, y: 0, raio: 5 },
      { x: 75, y: 0, raio: 5 },
    ])
    expect(resultado).toHaveLength(3)
    expect(resultado[0][0]).toEqual({ x: 0, y: 0 })
    expect(resultado[0][resultado[0].length - 1].x).toBeCloseTo(20, 5)
    expect(resultado[1][0].x).toBeCloseTo(30, 5)
    expect(resultado[1][resultado[1].length - 1].x).toBeCloseTo(70, 5)
    expect(resultado[2][0].x).toBeCloseTo(80, 5)
    expect(resultado[2][resultado[2].length - 1]).toEqual({ x: 100, y: 0 })
  })

  it('linha de dois pontos: corte no meio ainda vira duas peças de 2 pontos cada', () => {
    const pontos: PontoLinha[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }]
    const resultado = apagarTrechoDaLinha(pontos, [{ x: 5, y: 0, raio: 1 }])
    expect(resultado).toHaveLength(2)
    expect(resultado[0]).toHaveLength(2)
    expect(resultado[1]).toHaveLength(2)
  })

  it('linha de muitos pontos: corte que atravessa um vértice preserva os pontos intactos dos dois lados', () => {
    const pontos: PontoLinha[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 150, y: 0 },
      { x: 200, y: 0 },
    ]
    // corte cobre de x=90 a x=110 — engole o vértice (100,0) inteiro
    const resultado = apagarTrechoDaLinha(pontos, [{ x: 100, y: 0, raio: 10 }])
    expect(resultado).toHaveLength(2)
    const [esquerda, direita] = resultado
    // pontos originais preservados exatamente (sem drift de ponto flutuante)
    expect(esquerda).toContainEqual({ x: 0, y: 0 })
    expect(esquerda).toContainEqual({ x: 50, y: 0 })
    expect(esquerda[esquerda.length - 1].x).toBeCloseTo(90, 5)
    expect(direita[0].x).toBeCloseTo(110, 5)
    expect(direita).toContainEqual({ x: 150, y: 0 })
    expect(direita).toContainEqual({ x: 200, y: 0 })
  })

  it('linha de muitos pontos: borracha longe de todos os segmentos não mexe em nada', () => {
    const pontos: PontoLinha[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 150, y: 50 },
    ]
    const resultado = apagarTrechoDaLinha(pontos, [{ x: 500, y: 500, raio: 5 }])
    expect(resultado[0]).toBe(pontos)
  })

  it('círculo tangente (encosta raspando) não corta nada de verdade', () => {
    const pontos: PontoLinha[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    // círculo centrado bem acima da linha, raio exatamente igual à distância: toca só
    // num ponto (discriminante ~0) — não deve abrir buraco perceptível.
    const resultado = apagarTrechoDaLinha(pontos, [{ x: 50, y: 10, raio: 10 }])
    expect(resultado).toHaveLength(1)
    // ou ficou intacto, ou o "corte" é imperceptível (largura ~0) — nunca vira 0 ou 2+ peças
  })

  it('círculo cobre exatamente as duas pontas: sobra só o miolo', () => {
    const pontos: PontoLinha[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const resultado = apagarTrechoDaLinha(pontos, [
      { x: 0, y: 0, raio: 10 },
      { x: 100, y: 0, raio: 10 },
    ])
    expect(resultado).toHaveLength(1)
    expect(resultado[0][0].x).toBeCloseTo(10, 5)
    expect(resultado[0][resultado[0].length - 1].x).toBeCloseTo(90, 5)
  })
})
