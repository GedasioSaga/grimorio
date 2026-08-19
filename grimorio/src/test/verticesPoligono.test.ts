import { describe, expect, it } from 'vitest'
import {
  MINIMO_DE_VERTICES,
  PONTOS_SALA_POLIGONO_PADRAO,
  inserirVertice,
  meiosDasArestas,
  pontosDeRetangulo,
  removerVertice,
  verticeMaisProximo,
} from '../lib/salaPoligonoMapa'

/**
 * Inserir e remover canto na sala em polígono — a regra pura.
 *
 * É o par que faltava para "Converter ▸ Sala (polígono)" deixar de ser meia promessa: a
 * conversão entrega 4 vértices, e sem poder acrescentar canto não há como chegar num L.
 */
const QUADRADO = pontosDeRetangulo(100, 100)

describe('meios das arestas', () => {
  it('há um meio por ARESTA, não por vértice — o fechamento conta', () => {
    // um polígono fechado de n vértices tem n arestas; uma linha aberta teria n-1. Sem a
    // aresta de fechamento, o único lado que não aceitaria canto novo seria o que fecha a
    // silhueta, e o usuário descobriria isso tentando.
    expect(meiosDasArestas(QUADRADO)).toHaveLength(4)
    expect(meiosDasArestas(PONTOS_SALA_POLIGONO_PADRAO)).toHaveLength(
      PONTOS_SALA_POLIGONO_PADRAO.length,
    )
  })

  it('o meio fica no meio, inclusive na aresta de fechamento', () => {
    const meios = meiosDasArestas(QUADRADO)
    expect(meios[0].ponto).toEqual({ x: 50, y: 0 })
    // último vértice (0,100) → primeiro (0,0)
    expect(meios[3].ponto).toEqual({ x: 0, y: 50 })
  })

  it('polígono degenerado não oferece meio nenhum', () => {
    expect(meiosDasArestas([])).toEqual([])
    expect(meiosDasArestas([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([])
  })
})

describe('inserir vértice', () => {
  it('entra logo DEPOIS da aresta escolhida, sem mexer nos outros', () => {
    const novo = inserirVertice(QUADRADO, 0, { x: 50, y: -30 })
    expect(novo).toHaveLength(5)
    expect(novo[1]).toEqual({ x: 50, y: -30 })
    // os originais continuam na mesma ordem relativa
    expect(novo.filter((_, i) => i !== 1)).toEqual(QUADRADO)
  })

  it('inserir na aresta de fechamento acrescenta no fim', () => {
    const novo = inserirVertice(QUADRADO, 3, { x: -30, y: 50 })
    expect(novo).toHaveLength(5)
    expect(novo[4]).toEqual({ x: -30, y: 50 })
  })

  it('aresta inexistente devolve a lista intacta', () => {
    for (const i of [-1, 4, 99, 1.5, Number.NaN]) {
      expect(inserirVertice(QUADRADO, i, { x: 0, y: 0 })).toEqual(QUADRADO)
    }
  })

  it('quatro cantos viram um L com dois cantos novos — o caso que a conversão prometia', () => {
    let p = pontosDeRetangulo(200, 200)
    p = inserirVertice(p, 1, { x: 200, y: 100 })
    p = inserirVertice(p, 2, { x: 100, y: 100 })
    expect(p).toHaveLength(6)
    expect(p.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y))).toBe(true)
  })
})

describe('remover vértice', () => {
  it('tira o canto pedido', () => {
    const cinco = inserirVertice(QUADRADO, 0, { x: 50, y: -30 })
    expect(removerVertice(cinco, 1)).toEqual(QUADRADO)
  })

  it('PARA no piso de 3: o quarto Delete não faz nada', () => {
    // Deixar cair para 2 faria `new Polygon2d` lançar dentro do `getGeometry`, que roda ao
    // LER o documento — o mapa cairia no LimiteDeErro numa sessão futura, longe do gesto.
    let p = [...QUADRADO]
    p = removerVertice(p, 0)
    expect(p).toHaveLength(MINIMO_DE_VERTICES)
    expect(removerVertice(p, 0)).toHaveLength(MINIMO_DE_VERTICES)
    expect(removerVertice(p, 0)).toEqual(p)
  })

  it('índice inválido devolve a lista intacta', () => {
    const cinco = inserirVertice(QUADRADO, 0, { x: 50, y: -30 })
    for (const i of [-1, 5, 99, 1.5, Number.NaN]) {
      expect(removerVertice(cinco, i)).toEqual(cinco)
    }
  })
})

describe('qual canto o Delete pega', () => {
  it('o mais próximo, quando está dentro do alcance', () => {
    expect(verticeMaisProximo(QUADRADO, { x: 3, y: 3 }, 14)).toBe(0)
    expect(verticeMaisProximo(QUADRADO, { x: 98, y: 99 }, 14)).toBe(2)
  })

  it('nenhum, quando o cursor está longe — aí o Delete apaga a peça, como sempre', () => {
    // trocar "apagar a peça" por "apagar um canto" em toda a área da sala tiraria do
    // usuário um gesto que ele já tem.
    expect(verticeMaisProximo(QUADRADO, { x: 50, y: 50 }, 14)).toBeNull()
  })

  it('lista vazia não quebra', () => {
    expect(verticeMaisProximo([], { x: 0, y: 0 }, 14)).toBeNull()
  })
})
