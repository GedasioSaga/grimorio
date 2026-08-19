import { describe, expect, it } from 'vitest'
import {
  FONTE_ROTULO_PADRAO,
  MARGEM_TOPO_ROTULO,
  TAMANHOS_ROTULO,
  ehAncoraRotulo,
  layoutDoRotulo,
} from '../lib/salaMapa'

/**
 * Tamanho, posição e orientação do nome do cômodo — regra pura, exercitada sem editor.
 *
 * O que importa aqui não é "a função devolve um número", é que as três escolhas do mestre
 * sejam INDEPENDENTES e que o padrão continue sendo o que a sala sempre desenhou. Um mapa
 * antigo que reabre com o nome em outro lugar é uma edição em massa que ninguém pediu.
 */
const CAIXA = { x0: 0, y0: 0, w: 160, h: 112 }

describe('padrão do rótulo', () => {
  it('sem estilo nenhum, desenha como a sala sempre desenhou: topo, corpo 12, deitado', () => {
    const l = layoutDoRotulo(CAIXA, 'Cozinha')
    expect(l.fonte).toBe(FONTE_ROTULO_PADRAO)
    expect(l.transform).toBe('')
    expect(l.x).toBe(80)
    // uma linha só: o centro do bloco é a própria linha, encostada na margem do topo
    expect(l.y).toBeCloseTo(MARGEM_TOPO_ROTULO + l.entrelinha / 2, 5)
  })

  it('rótulo vazio não produz linha nem quebra a conta', () => {
    for (const texto of ['', '   ']) {
      const l = layoutDoRotulo(CAIXA, texto)
      expect(l.linhas).toEqual([])
      expect(Number.isFinite(l.x)).toBe(true)
      expect(Number.isFinite(l.y)).toBe(true)
    }
  })
})

describe('tamanho', () => {
  it('corpo maior aumenta fonte E entrelinha, para as linhas não colarem', () => {
    const pequeno = layoutDoRotulo(CAIXA, 'Salão de Armas', { tamanho: 10 })
    const grande = layoutDoRotulo(CAIXA, 'Salão de Armas', { tamanho: 28 })
    expect(grande.fonte).toBe(28)
    expect(grande.entrelinha).toBeGreaterThan(pequeno.entrelinha)
  })

  it('corpo maior quebra em mais linhas na mesma sala', () => {
    const pequeno = layoutDoRotulo(CAIXA, 'Salão de Armas Antigo', { tamanho: 10 })
    const grande = layoutDoRotulo(CAIXA, 'Salão de Armas Antigo', { tamanho: 28 })
    expect(grande.linhas.length).toBeGreaterThan(pequeno.linhas.length)
  })

  it('tamanho zero ou negativo cai no padrão em vez de sumir com o nome', () => {
    expect(layoutDoRotulo(CAIXA, 'Cozinha', { tamanho: 0 }).fonte).toBe(FONTE_ROTULO_PADRAO)
    expect(layoutDoRotulo(CAIXA, 'Cozinha', { tamanho: -5 }).fonte).toBe(FONTE_ROTULO_PADRAO)
  })

  it('todos os tamanhos oferecidos são usáveis', () => {
    for (const px of TAMANHOS_ROTULO) {
      expect(layoutDoRotulo(CAIXA, 'Cripta', { tamanho: px }).fonte).toBe(px)
    }
  })
})

describe('posição', () => {
  it('topo, centro e base ficam em alturas distintas e crescentes', () => {
    const topo = layoutDoRotulo(CAIXA, 'Cozinha', { ancora: 'topo' }).y
    const centro = layoutDoRotulo(CAIXA, 'Cozinha', { ancora: 'centro' }).y
    const base = layoutDoRotulo(CAIXA, 'Cozinha', { ancora: 'base' }).y
    expect(topo).toBeLessThan(centro)
    expect(centro).toBeLessThan(base)
    expect(centro).toBeCloseTo(CAIXA.h / 2, 5)
  })

  it('o nome cabe dentro da sala nas três posições', () => {
    for (const ancora of ['topo', 'centro', 'base'] as const) {
      const l = layoutDoRotulo(CAIXA, 'Salão de Armas Antigo do Castelo', { ancora, tamanho: 16 })
      const topoBloco = l.y - l.entrelinha / 2
      const baseBloco = l.y + (l.linhas.length - 1) * l.entrelinha + l.entrelinha / 2
      expect(topoBloco).toBeGreaterThanOrEqual(0)
      expect(baseBloco).toBeLessThanOrEqual(CAIXA.h)
    }
  })

  it('âncora inválida (prop corrompida) cai no topo, não em NaN', () => {
    const l = layoutDoRotulo(CAIXA, 'Cozinha', { ancora: 'meio-do-nada' })
    expect(l.y).toBeCloseTo(layoutDoRotulo(CAIXA, 'Cozinha', { ancora: 'topo' }).y, 5)
  })

  it('`ehAncoraRotulo` aceita só as três', () => {
    expect(ehAncoraRotulo('topo')).toBe(true)
    expect(ehAncoraRotulo('centro')).toBe(true)
    expect(ehAncoraRotulo('base')).toBe(true)
    expect(ehAncoraRotulo('esquerda')).toBe(false)
    expect(ehAncoraRotulo(undefined)).toBe(false)
  })
})

describe('orientação', () => {
  it('em pé gira -90° em torno do centro do bloco', () => {
    const l = layoutDoRotulo(CAIXA, 'Cozinha', { vertical: true })
    expect(l.transform).toMatch(/^rotate\(-90 /)
    expect(l.transform).not.toContain('NaN')
  })

  it('em pé mede a quebra contra a ALTURA, não a largura', () => {
    // sala estreita e alta: é o caso que o "em pé" existe para resolver. Deitado, o nome
    // quebra em várias linhas na largura curta; em pé, corre inteiro pela altura.
    const estreita = { x0: 0, y0: 0, w: 60, h: 260 }
    const deitado = layoutDoRotulo(estreita, 'Salão de Armas', {})
    const emPe = layoutDoRotulo(estreita, 'Salão de Armas', { vertical: true })
    expect(emPe.linhas.length).toBeLessThan(deitado.linhas.length)
    expect(emPe.linhas).toEqual(['Salão de Armas'])
  })

  it('em pé, a posição desliza no eixo X (não no Y)', () => {
    const topo = layoutDoRotulo(CAIXA, 'Cozinha', { vertical: true, ancora: 'topo' })
    const base = layoutDoRotulo(CAIXA, 'Cozinha', { vertical: true, ancora: 'base' })
    expect(topo.x).toBeLessThan(base.x)
    expect(topo.y).toBeCloseTo(base.y, 5)
  })
})

describe('sala em polígono', () => {
  it('centraliza pelo CENTROIDE, não pelo meio da caixa', () => {
    // num cômodo em L o meio da caixa delimitadora cai no recorte, fora da peça — o nome
    // apareceria boiando no vazio ao lado da sala.
    const caixa = { x0: 0, y0: 0, w: 200, h: 180, centro: { x: 75, y: 70 } }
    const l = layoutDoRotulo(caixa, 'Capela', { ancora: 'centro' })
    expect(l.x).toBe(75)
    expect(l.y).toBeCloseTo(70, 5)
  })

  it('respeita origem negativa (vértice arrastado para fora)', () => {
    const caixa = { x0: -60, y0: -40, w: 200, h: 180 }
    const l = layoutDoRotulo(caixa, 'Capela', { ancora: 'topo' })
    expect(l.y).toBeCloseTo(-40 + MARGEM_TOPO_ROTULO + l.entrelinha / 2, 5)
    expect(l.x).toBeCloseTo(-60 + 100, 5)
  })
})
