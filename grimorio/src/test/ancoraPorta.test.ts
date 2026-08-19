import { describe, expect, it } from 'vitest'
import {
  anguloDaAresta,
  arestasDeCaixa,
  arestasDePoligono,
  melhorAncora,
  projetarNaAresta,
  reprojetarAncora,
  trechosSemVao,
} from '../lib/ancoraPorta'

const CAIXA = arestasDeCaixa(200, 100)

describe('arestas', () => {
  it('caixa tem quatro, em sentido horário', () => {
    expect(CAIXA).toHaveLength(4)
    expect(CAIXA[0]).toEqual({ a: { x: 0, y: 0 }, b: { x: 200, y: 0 } })
    expect(CAIXA[3]).toEqual({ a: { x: 0, y: 100 }, b: { x: 0, y: 0 } })
  })

  it('polígono fecha o circuito', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ]
    const a = arestasDePoligono(p)
    expect(a).toHaveLength(3)
    expect(a[2]).toEqual({ a: { x: 0, y: 10 }, b: { x: 0, y: 0 } })
  })

  it('polígono degenerado não tem aresta', () => {
    expect(arestasDePoligono([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([])
  })
})

describe('projetar na aresta', () => {
  it('acha o pé da perpendicular e a distância', () => {
    const r = projetarNaAresta({ x: 100, y: 25 }, CAIXA[0])
    expect(r.ponto).toEqual({ x: 100, y: 0 })
    expect(r.t).toBeCloseTo(0.5, 5)
    expect(r.distancia).toBeCloseTo(25, 5)
  })

  it('LIMITA nas pontas: não encaixa no prolongamento da parede', () => {
    // sem o clamp, um ponto muito além do canto ainda daria distância pequena até a RETA
    // infinita, e a porta grudaria no vazio, alinhada a uma parede que acabou antes.
    const r = projetarNaAresta({ x: 900, y: 0 }, CAIXA[0])
    expect(r.t).toBe(1)
    expect(r.ponto).toEqual({ x: 200, y: 0 })
    expect(r.distancia).toBeCloseTo(700, 5)
  })

  it('aresta degenerada não vira NaN', () => {
    const r = projetarNaAresta({ x: 5, y: 5 }, { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } })
    expect(Number.isFinite(r.distancia)).toBe(true)
    expect(r.t).toBe(0)
  })
})

describe('ângulo', () => {
  it('parede horizontal é 0, vertical é 90°', () => {
    expect(anguloDaAresta(CAIXA[0])).toBeCloseTo(0, 5)
    expect(anguloDaAresta(CAIXA[1])).toBeCloseTo(Math.PI / 2, 5)
  })
})

describe('melhor âncora', () => {
  const candidatos = [{ id: 'sala', arestas: CAIXA }]

  it('pega a parede mais próxima e devolve o ângulo dela', () => {
    const a = melhorAncora({ x: 100, y: 8 }, candidatos, 20)!
    expect(a.hospedeiroId).toBe('sala')
    expect(a.indiceAresta).toBe(0)
    expect(a.ponto).toEqual({ x: 100, y: 0 })
    expect(a.angulo).toBeCloseTo(0, 5)
  })

  it('parede VERTICAL orienta a porta sozinha — zero rotação à mão', () => {
    const a = melhorAncora({ x: 194, y: 50 }, candidatos, 20)!
    expect(a.indiceAresta).toBe(1)
    expect(a.angulo).toBeCloseTo(Math.PI / 2, 5)
  })

  it('fora do alcance não ancora: a porta continua solta e livre', () => {
    // ímã que o usuário não pediu é pior que nenhum encaixe
    expect(melhorAncora({ x: 100, y: 60 }, candidatos, 20)).toBeNull()
  })

  it('escolhe entre peças diferentes pela menor distância', () => {
    const dois = [
      { id: 'longe', arestas: arestasDePoligono([{ x: 0, y: 500 }, { x: 100, y: 500 }, { x: 0, y: 600 }]) },
      { id: 'perto', arestas: CAIXA },
    ]
    expect(melhorAncora({ x: 100, y: 5 }, dois, 30)!.hospedeiroId).toBe('perto')
  })

  it('sem candidato nenhum devolve null', () => {
    expect(melhorAncora({ x: 0, y: 0 }, [], 20)).toBeNull()
  })
})

describe('reprojetar depois que a parede mudou', () => {
  it('mesma fração, parede maior: a porta acompanha', () => {
    const antes = reprojetarAncora(arestasDeCaixa(200, 100), 0, 0.25)!
    const depois = reprojetarAncora(arestasDeCaixa(400, 100), 0, 0.25)!
    expect(antes.ponto).toEqual({ x: 50, y: 0 })
    // guardar `t` e não coordenada é o que faz isto funcionar: a porta fica no mesmo ponto
    // RELATIVO da parede quando o cômodo cresce.
    expect(depois.ponto).toEqual({ x: 100, y: 0 })
  })

  it('aresta que sumiu devolve null — quem chama desancora com aviso', () => {
    // é a armadilha pela qual a referência é criticada: lá, editar a parede APAGA as portas
    expect(reprojetarAncora(arestasDeCaixa(10, 10), 9, 0.5)).toBeNull()
  })
})

describe('vão no contorno', () => {
  it('sem porta, o traço é inteiro', () => {
    expect(trechosSemVao([])).toEqual([{ inicio: 0, fim: 1 }])
  })

  it('uma porta no meio parte o traço em dois', () => {
    expect(trechosSemVao([{ inicio: 0.4, fim: 0.6 }])).toEqual([
      { inicio: 0, fim: 0.4 },
      { inicio: 0.6, fim: 1 },
    ])
  })

  it('porta encostada na ponta não deixa traço de comprimento zero', () => {
    expect(trechosSemVao([{ inicio: 0, fim: 0.3 }])).toEqual([{ inicio: 0.3, fim: 1 }])
    expect(trechosSemVao([{ inicio: 0.7, fim: 1 }])).toEqual([{ inicio: 0, fim: 0.7 }])
  })

  it('vãos sobrepostos são fundidos antes de recortar', () => {
    // recortar em sequência sem fundir deixaria um traço fantasma de comprimento negativo
    expect(trechosSemVao([{ inicio: 0.2, fim: 0.5 }, { inicio: 0.4, fim: 0.7 }])).toEqual([
      { inicio: 0, fim: 0.2 },
      { inicio: 0.7, fim: 1 },
    ])
  })

  it('duas portas separadas deixam três trechos', () => {
    expect(trechosSemVao([{ inicio: 0.2, fim: 0.3 }, { inicio: 0.6, fim: 0.8 }])).toHaveLength(3)
  })

  it('porta do tamanho da parede não deixa traço nenhum', () => {
    expect(trechosSemVao([{ inicio: 0, fim: 1 }])).toEqual([])
  })

  it('vão invertido ou fora da faixa é normalizado', () => {
    expect(trechosSemVao([{ inicio: 0.6, fim: 0.4 }])).toEqual([
      { inicio: 0, fim: 0.4 },
      { inicio: 0.6, fim: 1 },
    ])
    expect(trechosSemVao([{ inicio: -1, fim: 0.2 }])).toEqual([{ inicio: 0.2, fim: 1 }])
  })
})
