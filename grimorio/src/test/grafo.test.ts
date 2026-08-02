import { describe, expect, it } from 'vitest'
import { calcularLayout, type ArestaGrafo, type NoGrafo } from '../lib/grafoLayout'
import { montarTeia, vizinhos, type DepsTeia } from '../lib/grafoVinculos'
import type { Vinculo } from '../lib/types'

// ---------- layout ----------

const nos = (...ids: string[]): NoGrafo[] => ids.map((id) => ({ id, nome: id }))
const aresta = (de: string, para: string): ArestaGrafo => ({ de, para })

/** Distância entre dois nós no resultado do layout. */
function dist(pos: Record<string, { x: number; y: number }>, a: string, b: string): number {
  return Math.hypot(pos[a].x - pos[b].x, pos[a].y - pos[b].y)
}

describe('calcularLayout', () => {
  it('grafo vazio devolve nada', () => {
    expect(calcularLayout([], [])).toEqual({})
  })

  it('nó único vai para o centro', () => {
    expect(calcularLayout(nos('a'), [], { largura: 100, altura: 60 })).toEqual({ a: { x: 50, y: 30 } })
  })

  it('é DETERMINÍSTICO — abrir a teia de novo tem que dar o mesmo desenho', () => {
    const n = nos('a', 'b', 'c', 'd')
    const e = [aresta('a', 'b'), aresta('c', 'd')]
    expect(calcularLayout(n, e)).toEqual(calcularLayout(n, e))
  })

  it('quem está ligado termina mais perto do que quem não está', () => {
    // a-b ligados; c solto. É a propriedade que faz o desenho significar alguma coisa.
    const pos = calcularLayout(nos('a', 'b', 'c'), [aresta('a', 'b')])
    expect(dist(pos, 'a', 'b')).toBeLessThan(dist(pos, 'a', 'c'))
    expect(dist(pos, 'a', 'b')).toBeLessThan(dist(pos, 'b', 'c'))
  })

  it('dois grupos que não se falam ficam separados', () => {
    const pos = calcularLayout(
      nos('a1', 'a2', 'b1', 'b2'),
      [aresta('a1', 'a2'), aresta('b1', 'b2')],
    )
    const dentroDeA = dist(pos, 'a1', 'a2')
    const entreGrupos = Math.min(dist(pos, 'a1', 'b1'), dist(pos, 'a2', 'b2'))
    expect(dentroDeA).toBeLessThan(entreGrupos)
  })

  it('nenhuma posição vira NaN, nem com todo mundo ligado a todo mundo', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const todas = ids.flatMap((x, i) => ids.slice(i + 1).map((y) => aresta(x, y)))
    const pos = calcularLayout(nos(...ids), todas)
    for (const id of ids) {
      expect(Number.isFinite(pos[id].x)).toBe(true)
      expect(Number.isFinite(pos[id].y)).toBe(true)
    }
  })

  it('nós isolados ficam DENTRO da moldura (a repulsão sozinha os jogaria pra fora)', () => {
    const pos = calcularLayout(nos('a', 'b', 'c', 'd', 'e', 'f'), [], { largura: 400, altura: 300 })
    for (const p of Object.values(pos)) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(400)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(300)
    }
  })

  it('não empilha dois nós exatamente no mesmo ponto', () => {
    const pos = calcularLayout(nos('a', 'b', 'c'), [])
    expect(dist(pos, 'a', 'b')).toBeGreaterThan(0)
    expect(dist(pos, 'b', 'c')).toBeGreaterThan(0)
  })

  it('usa a moldura toda em vez de amontoar num canto', () => {
    const pos = calcularLayout(nos('a', 'b', 'c', 'd', 'e'), [aresta('a', 'b'), aresta('c', 'd')], { largura: 1000, altura: 800 })
    const xs = Object.values(pos).map((p) => p.x)
    const ys = Object.values(pos).map((p) => p.y)
    // pelo menos um eixo tem que estar esticado até a margem — é o eixo limitante
    const usoX = (Math.max(...xs) - Math.min(...xs)) / 1000
    const usoY = (Math.max(...ys) - Math.min(...ys)) / 800
    expect(Math.max(usoX, usoY)).toBeGreaterThan(0.8)
  })

  it('o reenquadramento não distorce: mantém a PROPORÇÃO entre as distâncias', () => {
    // escala única nos dois eixos, senão "perto" e "longe" deixariam de significar o mesmo
    const n = nos('a', 'b', 'c', 'd')
    const e = [aresta('a', 'b')]
    const pos = calcularLayout(n, e, { largura: 1000, altura: 800 })
    const largo = calcularLayout(n, e, { largura: 2000, altura: 1600 })
    const razao = dist(pos, 'a', 'b') / dist(pos, 'c', 'd')
    const razaoLarga = dist(largo, 'a', 'b') / dist(largo, 'c', 'd')
    expect(razaoLarga).toBeCloseTo(razao, 5)
  })

  it('todos colineares não geram divisão por zero no reenquadramento', () => {
    // 2 nós sempre acabam numa linha; o eixo sem extensão não pode virar NaN
    const pos = calcularLayout(nos('a', 'b'), [aresta('a', 'b')], { largura: 500, altura: 400 })
    expect(Number.isFinite(pos.a.x) && Number.isFinite(pos.a.y)).toBe(true)
    expect(Number.isFinite(pos.b.x) && Number.isFinite(pos.b.y)).toBe(true)
  })

  it('aresta apontando para nó inexistente não quebra o cálculo', () => {
    const pos = calcularLayout(nos('a', 'b'), [aresta('a', 'fantasma')])
    expect(Number.isFinite(pos.a.x)).toBe(true)
    expect(pos.fantasma).toBeUndefined()
  })
})

// ---------- montagem da teia ----------

function vinculo(deId: string, paraId: string, tipo: string, over: Partial<Vinculo> = {}): Vinculo {
  return {
    id: `v-${deId}-${paraId}-${tipo}`, deTipo: 'personagem', deId,
    paraTipo: 'personagem', paraId, tipo, notas: '', criadoEm: '', ...over,
  }
}

const deps = (over: Partial<DepsTeia> = {}): DepsTeia => ({
  personagens: { p1: { id: 'p1', nome: 'Alice' }, p2: { id: 'p2', nome: 'Bruno' } },
  cenarios: { c1: { id: 'c1', nome: 'Taverna' } },
  itens: { i1: { id: 'i1', nome: 'Espada', resumo: 'lâmina que canta' } },
  vinculos: [],
  ...over,
})

describe('montarTeia', () => {
  it('põe personagens, cenários e itens como nós tipados', () => {
    const { nos } = montarTeia(deps())
    expect(nos.map((n) => [n.id, n.tipo])).toEqual([
      ['p1', 'personagem'], ['p2', 'personagem'], ['c1', 'cenario'], ['i1', 'item'],
    ])
  })

  it('leva o resumo do item para o nó (é o que o tooltip mostra)', () => {
    expect(montarTeia(deps()).nos.find((n) => n.id === 'i1')?.resumo).toBe('lâmina que canta')
  })

  it('funde as relações do mesmo par numa aresta só, somando os tipos', () => {
    const { arestas } = montarTeia(deps({
      vinculos: [vinculo('p1', 'p2', 'conhece'), vinculo('p2', 'p1', 'deve favor a')],
    }))
    expect(arestas).toHaveLength(1)
    expect(arestas[0].rotulo).toBe('conhece, deve favor a')
  })

  it('não repete o tipo quando os dois lados cadastraram a mesma relação', () => {
    const { arestas } = montarTeia(deps({
      vinculos: [vinculo('p1', 'p2', 'conhece'), vinculo('p2', 'p1', 'conhece')],
    }))
    expect(arestas[0].rotulo).toBe('conhece')
  })

  it('participação em campanha não vira aresta', () => {
    const { arestas } = montarTeia(deps({
      vinculos: [vinculo('p1', 'camp', 'participa', { paraTipo: 'campanha' })],
    }))
    expect(arestas).toEqual([])
  })

  it('relação com ponta que não existe mais é contada como órfã, não desenhada', () => {
    const teia = montarTeia(deps({ vinculos: [vinculo('p1', 'sumiu', 'conhece')] }))
    expect(teia.arestas).toEqual([])
    expect(teia.orfas).toBe(1)
  })

  it('laço da entidade nela mesma é ignorado', () => {
    expect(montarTeia(deps({ vinculos: [vinculo('p1', 'p1', 'conhece')] })).arestas).toEqual([])
  })

  it('sob filtro de campanha entram só os participantes', () => {
    const participa = (id: string) => vinculo(id, 'camp1', 'participa', { paraTipo: 'campanha' })
    const teia = montarTeia(deps({
      vinculos: [participa('p1'), participa('c1'), vinculo('p1', 'c1', 'mora em')],
      campanhaId: 'camp1',
    }))
    expect(teia.nos.map((n) => n.id)).toEqual(['p1', 'c1'])
    expect(teia.arestas).toHaveLength(1)
  })

  it('relação com uma ponta FORA da campanha não é desenhada nem contada como órfã', () => {
    const participa = (id: string) => vinculo(id, 'camp1', 'participa', { paraTipo: 'campanha' })
    const teia = montarTeia(deps({
      vinculos: [participa('p1'), vinculo('p1', 'p2', 'conhece')],
      campanhaId: 'camp1',
    }))
    expect(teia.arestas).toEqual([])
    expect(teia.orfas).toBe(0) // p2 existe, só não está nesta campanha
  })

  it('usa o resumo injetado para personagem e cenário', () => {
    const teia = montarTeia(deps({ resumoDe: (id) => (id === 'p1' ? 'maga' : '') }))
    expect(teia.nos.find((n) => n.id === 'p1')?.resumo).toBe('maga')
  })

  it('leva o retrato injetado para o nó, com o enquadramento junto', () => {
    const teia = montarTeia(deps({
      retratoDe: (id) => (id === 'p1' ? { rel: 'assets/alice.png', foco: { x: 50, y: 0 } } : null),
    }))
    expect(teia.nos.find((n) => n.id === 'p1')?.retrato).toEqual({ rel: 'assets/alice.png', foco: { x: 50, y: 0 } })
  })

  it('entidade sem retrato fica com null — a tela cai no ícone do tipo', () => {
    const teia = montarTeia(deps({ retratoDe: () => null }))
    expect(teia.nos.every((n) => n.retrato === null)).toBe(true)
  })

  it('sem o injetor, nenhum nó tem retrato (a lib não sabe ler versão ativa)', () => {
    expect(montarTeia(deps()).nos.every((n) => n.retrato === null)).toBe(true)
  })
})

describe('vizinhos', () => {
  it('acha os ligados nas duas direções', () => {
    const arestas = [
      { de: 'a', para: 'b', rotulo: 'x' },
      { de: 'c', para: 'a', rotulo: 'y' },
      { de: 'd', para: 'e', rotulo: 'z' },
    ]
    expect([...vizinhos(arestas, 'a')].sort()).toEqual(['b', 'c'])
    expect([...vizinhos(arestas, 'z')]).toEqual([])
  })
})
