// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createShapeId, type TLLineShape } from 'tldraw'
import {
  CANTO_PADRAO,
  cantoDeMeta,
  ehCantoMapa,
  OPCOES_CANTO,
  aceitaCanto,
  cantoDaPeca,
  raioDoCanto,
  RAIO_CANTO_ARREDONDADO,
  tracadoDoCanto,
} from '../lib/cantosMapa'
import { aplicarCanto, getCantoAtivo, setCantoAtivo } from '../lib/cantoAtivo'
import { clicar, criarEditorDeTeste } from './ajudaEditorMapa'
import { registrarBeforeCreateMapa } from '../lib/montagemMapa'
import type { RetanguloMapaShapeType } from '../components/RetanguloMapaShape'

/**
 * Pedido do usuário: "quero poder fazer linhas e retângulos, e escolher se fica arredondado
 * ou reto". A linha do tldraw só desenhava com ponta redonda (a captura do usuário mostra o
 * traço de ponta bolha) e o retângulo `geo` nativo não tem raio de canto nenhum.
 */

describe('cantosMapa (lib pura)', () => {
  it('o padrão é arredondado — é o que a linha já fazia antes da opção existir', () => {
    expect(CANTO_PADRAO).toBe('arredondado')
  })

  it('reto vira quina seca no SVG; arredondado mantém a ponta bolha', () => {
    expect(tracadoDoCanto('reto')).toEqual({ strokeLinecap: 'butt', strokeLinejoin: 'miter' })
    expect(tracadoDoCanto('arredondado')).toEqual({ strokeLinecap: 'round', strokeLinejoin: 'round' })
  })

  it('canto reto no retângulo é raio zero', () => {
    expect(raioDoCanto('reto', 200, 100)).toBe(0)
  })

  it('canto arredondado usa o raio cheio quando a peça é grande o bastante', () => {
    expect(raioDoCanto('arredondado', 200, 100)).toBe(RAIO_CANTO_ARREDONDADO)
  })

  it('peça baixa não vira cápsula: o raio é limitado à metade do lado menor', () => {
    expect(raioDoCanto('arredondado', 200, 10)).toBe(5)
    expect(raioDoCanto('arredondado', 8, 200)).toBe(4)
  })

  it('peça de lado zero não gera raio negativo', () => {
    expect(raioDoCanto('arredondado', 0, 100)).toBe(0)
  })

  it('meta sem canto, com lixo, ou nula cai no padrão', () => {
    expect(cantoDeMeta(undefined)).toBe(CANTO_PADRAO)
    expect(cantoDeMeta(null)).toBe(CANTO_PADRAO)
    expect(cantoDeMeta({})).toBe(CANTO_PADRAO)
    expect(cantoDeMeta({ cantos: 'chanfrado' })).toBe(CANTO_PADRAO)
    expect(cantoDeMeta({ cantos: 42 })).toBe(CANTO_PADRAO)
  })

  it('meta com canto válido é respeitada', () => {
    expect(cantoDeMeta({ cantos: 'reto' })).toBe('reto')
    expect(cantoDeMeta({ cantos: 'arredondado' })).toBe('arredondado')
  })

  it('ehCantoMapa só aceita os dois valores conhecidos', () => {
    expect(ehCantoMapa('reto')).toBe(true)
    expect(ehCantoMapa('arredondado')).toBe(true)
    expect(ehCantoMapa('bisel')).toBe(false)
    expect(ehCantoMapa(undefined)).toBe(false)
  })

  it('a barra e o painel oferecem exatamente as duas opções, na mesma ordem', () => {
    expect(OPCOES_CANTO.map((o) => o.id)).toEqual(['reto', 'arredondado'])
  })

  it('só linha e retângulo do mapa têm canto', () => {
    expect(aceitaCanto('line')).toBe(true)
    expect(aceitaCanto('retangulo-mapa')).toBe(true)
    // `geo` é a parede da paleta e todo retângulo de mapa ANTIGO: não tem raio de canto
    expect(aceitaCanto('geo')).toBe(false)
    expect(aceitaCanto('sala-mapa')).toBe(false)
    expect(aceitaCanto('porta-mapa')).toBe(false)
  })

  it('cantoDaPeca lê do lugar certo em cada tipo, e devolve null para quem não tem', () => {
    expect(cantoDaPeca({ type: 'line', meta: { cantos: 'reto' } })).toBe('reto')
    expect(cantoDaPeca({ type: 'retangulo-mapa', props: { cantos: 'reto' } })).toBe('reto')
    // a linha NÃO guarda em props e o retângulo NÃO guarda em meta — trocado, cai no padrão
    expect(cantoDaPeca({ type: 'line', props: { cantos: 'reto' } })).toBe(CANTO_PADRAO)
    expect(cantoDaPeca({ type: 'retangulo-mapa', meta: { cantos: 'reto' } })).toBe(CANTO_PADRAO)
    expect(cantoDaPeca({ type: 'geo', props: { geo: 'rectangle' } })).toBeNull()
    expect(cantoDaPeca({ type: 'sala-mapa' })).toBeNull()
  })
})

describe('canto aplicado no editor', () => {
  it('na LINHA a escolha vai para meta (o tipo nativo não aceita prop nova)', () => {
    const editor = criarEditorDeTeste()
    const id = createShapeId()
    editor.createShape({ id, type: 'line', x: 0, y: 0 })

    aplicarCanto(editor, [id], 'reto')

    expect(cantoDeMeta(editor.getShape(id)!.meta)).toBe('reto')
  })

  it('no RETÂNGULO a escolha vai para props, como qualquer peça própria do mapa', () => {
    const editor = criarEditorDeTeste()
    const id = createShapeId()
    editor.createShape({ id, type: 'retangulo-mapa', x: 0, y: 0 })

    aplicarCanto(editor, [id], 'reto')

    expect((editor.getShape(id) as RetanguloMapaShapeType).props.cantos).toBe('reto')
  })

  it('peça sem canto (sala) é ignorada em silêncio: o botão serve a seleção mista', () => {
    const editor = criarEditorDeTeste()
    const sala = createShapeId()
    const linha = createShapeId()
    editor.createShape({ sala: undefined, id: sala, type: 'sala-mapa', x: 0, y: 0 } as Parameters<
      typeof editor.createShape
    >[0])
    editor.createShape({ id: linha, type: 'line', x: 0, y: 0 })

    expect(aplicarCanto(editor, [sala, linha], 'reto')).toBe(1)
    expect(cantoDeMeta(editor.getShape(linha)!.meta)).toBe('reto')
  })

  it('o canto ativo começa no padrão e é lembrado por editor', () => {
    const editorA = criarEditorDeTeste()
    const editorB = criarEditorDeTeste()
    expect(getCantoAtivo(editorA)).toBe(CANTO_PADRAO)

    setCantoAtivo(editorA, 'reto')

    expect(getCantoAtivo(editorA)).toBe('reto')
    expect(getCantoAtivo(editorB)).toBe(CANTO_PADRAO)
  })

  it('peça nova nasce com o canto escolhido na barra — linha', () => {
    const editor = criarEditorDeTeste()
    const cancelar = registrarBeforeCreateMapa(editor, {
      getCamadaAtivaId: () => 'base',
      getCamadaTravada: () => false,
      getCantoPadrao: () => getCantoAtivo(editor),
    })
    setCantoAtivo(editor, 'reto')

    editor.setCurrentTool('line')
    clicar(editor, 120, 120)

    const linha = editor.getCurrentPageShapes().find((s) => s.type === 'line')!
    expect(cantoDeMeta(linha.meta)).toBe('reto')
    cancelar()
  })

  it('peça nova nasce com o canto escolhido na barra — retângulo', () => {
    const editor = criarEditorDeTeste()
    const cancelar = registrarBeforeCreateMapa(editor, {
      getCamadaAtivaId: () => 'base',
      getCamadaTravada: () => false,
      getCantoPadrao: () => getCantoAtivo(editor),
    })
    setCantoAtivo(editor, 'reto')

    editor.setCurrentTool('retangulo-mapa')
    clicar(editor, 120, 120)

    const r = editor.getCurrentPageShapes().find((s) => s.type === 'retangulo-mapa') as RetanguloMapaShapeType
    expect(r.props.cantos).toBe('reto')
    cancelar()
  })

  it('o traço da linha sai no SVG com a ponta escolhida (é o que a exportação PNG/SVG usa)', () => {
    const editor = criarEditorDeTeste()
    const id = createShapeId()
    editor.createShape({ id, type: 'line', x: 0, y: 0, meta: { cantos: 'reto' } })

    const util = editor.getShapeUtil('line')
    const svg = util.toSvg?.(editor.getShape<TLLineShape>(id)!, {} as never) as { props: Record<string, unknown> }

    expect(svg.props.strokeLinecap).toBe('butt')
    expect(svg.props.strokeLinejoin).toBe('miter')
  })
})

/**
 * A geometria do retângulo é conferida pelo SVG que a EXPORTAÇÃO usa (`toSvg`), não por uma
 * função interna: trocar o `rx` por um número fixo manteria todo teste puro de `raioDoCanto`
 * verde e ainda assim quebraria a peça na tela e no PNG exportado.
 */
describe('geometria do retângulo do mapa', () => {
  function svgDoRetangulo(editor: ReturnType<typeof criarEditorDeTeste>, props: Record<string, unknown>) {
    const id = createShapeId()
    editor.createShape({ id, type: 'retangulo-mapa', x: 0, y: 0, props } as Parameters<typeof editor.createShape>[0])
    const shape = editor.getShape(id)!
    const util = editor.getShapeUtil('retangulo-mapa')
    return util.toSvg!(shape as never, {} as never) as { props: Record<string, number | string> }
  }

  it('canto reto sai com raio zero; arredondado sai com raio', () => {
    const editor = criarEditorDeTeste()
    expect(svgDoRetangulo(editor, { w: 200, h: 120, cantos: 'reto', espessura: 2 }).props.rx).toBe(0)
    expect(svgDoRetangulo(editor, { w: 200, h: 120, cantos: 'arredondado', espessura: 2 }).props.rx).toBe(
      RAIO_CANTO_ARREDONDADO,
    )
  })

  it('o raio é o mesmo nos dois eixos — canto redondo, nunca elíptico', () => {
    const editor = criarEditorDeTeste()
    // caso que produzia elipse: traço grosso numa peça baixa, com o raio medido por fora
    const svg = svgDoRetangulo(editor, { w: 200, h: 30, cantos: 'arredondado', espessura: 10 })
    expect(svg.props.rx).toBe(svg.props.ry)
  })

  /**
   * `width`/`height` = 0 DESABILITA a renderização do `<rect>` pela spec do SVG: a peça
   * sumia da tela e da exportação, mas continuava selecionável — com cara de defeito de
   * render, não de espessura escolhida.
   */
  it('espessura maior que a peça não faz o retângulo sumir', () => {
    const editor = criarEditorDeTeste()
    const svg = svgDoRetangulo(editor, { w: 40, h: 10, cantos: 'reto', espessura: 10 })
    expect(Number(svg.props.width)).toBeGreaterThan(0)
    expect(Number(svg.props.height)).toBeGreaterThan(0)
  })

  it('o traço fica DENTRO da caixa da peça, para o contorno bater com as alças', () => {
    const editor = criarEditorDeTeste()
    const svg = svgDoRetangulo(editor, { w: 200, h: 120, cantos: 'reto', espessura: 6 })
    expect(Number(svg.props.x)).toBe(3)
    expect(Number(svg.props.width) + 2 * Number(svg.props.x)).toBe(200)
  })

  it('sem preenchimento por padrão, para não tampar a planta por baixo', () => {
    const editor = criarEditorDeTeste()
    const svg = svgDoRetangulo(editor, { w: 200, h: 120, cantos: 'reto', espessura: 2, preenchido: false })
    expect(svg.props.fill).toBe('none')
  })
})
