import { describe, it, expect } from 'vitest'
import { entradasDaLegenda } from '../lib/legendaMapa'
import { pecasConversiveis, planoDeConversao } from '../lib/conversaoMapa'

describe('entradasDaLegenda', () => {
  it('mapa vazio não gera legenda', () => {
    expect(entradasDaLegenda([])).toEqual([])
  })

  it('lista na ordem da paleta, não na ordem em que o usuário desenhou', () => {
    const entradas = entradasDaLegenda(['armadilha', 'sala', 'porta'])
    expect(entradas.map((e) => e.peca)).toEqual(['sala', 'porta', 'armadilha'])
  })

  it('peça repetida aparece uma vez só', () => {
    const entradas = entradasDaLegenda(['mesa', 'mesa', 'mesa'])
    expect(entradas).toHaveLength(1)
    expect(entradas[0].rotulo).toBe('Mesa')
  })

  it('leva o símbolo junto, para a legenda poder desenhá-lo', () => {
    const [entrada] = entradasDaLegenda(['armadilha'])
    expect(entrada.simbolo).toBe('armadilha')
  })

  it('peça de estilo entra sem símbolo', () => {
    const [entrada] = entradasDaLegenda(['sala'])
    expect(entrada.simbolo).toBeUndefined()
  })

  it('rótulo de cômodo não entra na legenda (texto se explica sozinho)', () => {
    expect(entradasDaLegenda(['rotulo'])).toEqual([])
  })

  it('ignora peça desconhecida em vez de quebrar', () => {
    const entradas = entradasDaLegenda(['trono', 'sala'])
    expect(entradas.map((e) => e.peca)).toEqual(['sala'])
  })
})

describe('planoDeConversao', () => {
  it('peça de estilo mantém a forma e repinta', () => {
    const plano = planoDeConversao('parede')
    expect(plano.tipo).toBe('estilo')
    if (plano.tipo !== 'estilo') throw new Error('tipo errado')
    expect(plano.geo).toBe('rectangle')
    expect(plano.estilos.color).toBe('white')
  })

  // converter em sala é o caso que mais importa: é o que o mapa antigo tem de sobra
  it('sala vira shape próprio, no estado pendente', () => {
    const plano = planoDeConversao('sala')
    expect(plano.tipo).toBe('substituir')
    if (plano.tipo !== 'substituir') throw new Error('tipo errado')
    expect(plano.novoTipo).toBe('sala-mapa')
    expect(plano.props.estado).toBe('pendente')
  })

  // a sala RETANGULAR aceitava conversão desde sempre e a em polígono não — a última
  // desigualdade entre os dois formatos, e justo no caminho do mapa antigo, que é onde
  // converter serve para alguma coisa.
  it('sala em polígono também é alvo de conversão, dimensionada por vértices', () => {
    const plano = planoDeConversao('sala-poligono')
    expect(plano.tipo).toBe('substituir')
    if (plano.tipo !== 'substituir') throw new Error('tipo errado')
    expect(plano.novoTipo).toBe('sala-poligono-mapa')
    // `caixa` mandaria w/h para um shape que não declara w/h: o schema do tldraw RECUSA o
    // update, não ignora o campo — a peça simplesmente não nasceria.
    expect(plano.dimensionar).toBe('poligono')
    expect(plano.props.estado).toBe('pendente')
  })

  it('os dois formatos de sala aparecem no menu "Converter em ▸"', () => {
    const ids = pecasConversiveis().map((e) => e.id)
    expect(ids).toContain('sala')
    expect(ids).toContain('sala-poligono')
  })

  it('peça desenhada troca a forma por um símbolo', () => {
    const plano = planoDeConversao('armadilha')
    expect(plano.tipo).toBe('substituir')
    if (plano.tipo !== 'substituir') throw new Error('tipo errado')
    expect(plano.novoTipo).toBe('simbolo-mapa')
    expect(plano.props.simbolo).toBe('armadilha')
  })

  it('porta não é convertível: o vão depende da parede sob ela', () => {
    expect(planoDeConversao('porta').tipo).toBe('impossivel')
  })

  it('escada não é convertível: é um grupo de formas, não uma forma', () => {
    expect(planoDeConversao('escada').tipo).toBe('impossivel')
  })

  it('peça inexistente não vira plano', () => {
    expect(planoDeConversao('trono').tipo).toBe('impossivel')
  })

  it('o menu de conversão não oferece o que não dá para converter', () => {
    const ids = pecasConversiveis().map((e) => e.id)
    expect(ids).toContain('sala')
    expect(ids).toContain('armadilha')
    expect(ids).not.toContain('porta')
    expect(ids).not.toContain('escada')
  })
})
