import { describe, expect, it } from 'vitest'
import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultSizeStyle,
  GeoShapeGeoStyle,
} from 'tldraw'
import { ELEMENTOS_PALETA, pecaDaFormaCriada, type ElementoPaleta } from '../lib/paletaMapa'

// Listas de valores válidos direto do tlschema real (StyleProp.defineEnum expõe `.values`,
// verificado em node_modules/@tldraw/tlschema/src/styles/StyleProp.ts:112-121 — EnumStyleProp
// guarda o array passado em `values` como propriedade pública readonly).
const CORES_VALIDAS = new Set<string>(DefaultColorStyle.values)
const FILLS_VALIDOS = new Set<string>(DefaultFillStyle.values)
const DASHES_VALIDOS = new Set<string>(DefaultDashStyle.values)
const SIZES_VALIDOS = new Set<string>(DefaultSizeStyle.values)
const GEOS_VALIDOS = new Set<string>(GeoShapeGeoStyle.values)

describe('ELEMENTOS_PALETA', () => {
  // catálogo em duas famílias: o que CONSTRÓI o mapa e o que é ACHADO nele
  it('tem as peças de construção seguidas dos itens', () => {
    const construcao = ELEMENTOS_PALETA.filter((e) => !e.item).map((e) => e.id)
    const itens = ELEMENTOS_PALETA.filter((e) => e.item).map((e) => e.id)

    expect(construcao).toEqual([
      'sala', 'parede', 'porta', 'divisoria', 'janela', 'escada',
      'mesa', 'cama', 'bau', 'secreta', 'armadilha', 'marcador', 'rotulo', 'andar',
    ])
    expect(itens).toEqual([
      'pocao', 'erva', 'chave', 'documento', 'moeda',
      'espada', 'municao', 'livro', 'tocha', 'comida',
    ])
  })

  it('todo item é um símbolo desenhado, criado por ação', () => {
    for (const item of ELEMENTOS_PALETA.filter((e) => e.item)) {
      expect(item.tipo, `${item.id}`).toBe('acao')
      expect(item.simbolo, `${item.id}`).toBe(item.id)
    }
  })

  it('cada elemento tem rótulo pt-BR e glifo não vazios', () => {
    for (const el of ELEMENTOS_PALETA) {
      expect(el.rotulo.length).toBeGreaterThan(0)
      expect(el.glifo.length).toBeGreaterThan(0)
    }
  })

  it('todo elemento com geo define estilos não-vazios', () => {
    for (const el of ELEMENTOS_PALETA) {
      if (el.geo) {
        expect(Object.keys(el.estilos).length).toBeGreaterThan(0)
      }
    }
  })

  // sala deixou de ser retângulo verde do tldraw: virou shape próprio com ESTADO
  // (vermelho pendente / azul limpa / escuro sem info), porque essas cores não existem
  // na paleta do tldraw e ela precisa carregar o nome do cômodo dentro
  it('sala: shape próprio, sem geo nem estilo pré-aplicado', () => {
    const sala = ELEMENTOS_PALETA.find((e) => e.id === 'sala')!
    expect(sala.tipo).toBe('acao')
    expect(sala.geo).toBeUndefined()
    expect(Object.keys(sala.estilos)).toHaveLength(0)
  })

  it('parede: geo rectangle, cor branca, fill sólido, traço sólido, tamanho m', () => {
    const parede = ELEMENTOS_PALETA.find((e) => e.id === 'parede')!
    expect(parede.geo).toBe('rectangle')
    expect(parede.estilos.color).toBe('white')
    expect(parede.estilos.fill).toBe('solid')
    expect(parede.estilos.dash).toBe('solid')
    expect(parede.estilos.size).toBe('m')
  })

  // leva 4a: porta virou shape próprio (PortaShape.tsx), não mais geo pré-estilado
  it('porta: tipo ação, sem geo nem estilo — o desenho é o PortaShape', () => {
    const porta = ELEMENTOS_PALETA.find((e) => e.id === 'porta')!
    expect(porta.tipo).toBe('acao')
    expect(porta.geo).toBeUndefined()
    expect(Object.keys(porta.estilos)).toHaveLength(0)
  })

  // janela deixou de ser retângulo azul vazio e virou símbolo desenhado (moldura + vidro)
  it('janela: símbolo desenhado, sem geo nem estilo', () => {
    const janela = ELEMENTOS_PALETA.find((e) => e.id === 'janela')!
    expect(janela.tipo).toBe('acao')
    expect(janela.simbolo).toBe('janela')
    expect(janela.geo).toBeUndefined()
  })

  it('escada não pré-estila geo (mecânica é criar formas na hora)', () => {
    const escada = ELEMENTOS_PALETA.find((e) => e.id === 'escada')!
    expect(escada.geo).toBeUndefined()
  })

  it('todo valor de cor usado pertence à lista real do tlschema (DefaultColorStyle.values)', () => {
    for (const el of ELEMENTOS_PALETA) {
      if (el.estilos.color) {
        expect(CORES_VALIDAS.has(el.estilos.color)).toBe(true)
      }
    }
  })

  it('todo valor de fill usado pertence à lista real do tlschema (DefaultFillStyle.values)', () => {
    for (const el of ELEMENTOS_PALETA) {
      if (el.estilos.fill) {
        expect(FILLS_VALIDOS.has(el.estilos.fill)).toBe(true)
      }
    }
  })

  it('todo valor de dash usado pertence à lista real do tlschema (DefaultDashStyle.values)', () => {
    for (const el of ELEMENTOS_PALETA) {
      if (el.estilos.dash) {
        expect(DASHES_VALIDOS.has(el.estilos.dash)).toBe(true)
      }
    }
  })

  it('todo valor de size usado pertence à lista real do tlschema (DefaultSizeStyle.values)', () => {
    for (const el of ELEMENTOS_PALETA) {
      if (el.estilos.size) {
        expect(SIZES_VALIDOS.has(el.estilos.size)).toBe(true)
      }
    }
  })

  // Fix de review: MapaToolbar.tsx aplicarElementoPaleta() precisa setar
  // GeoShapeGeoStyle (elemento.geo), não só os estilos — o bug era o loop cobrir
  // só `estilos` e nunca aplicar `elemento.geo`. Aqui validamos o dado (todo `geo`
  // usado é um valor real de GeoShapeGeoStyle.values, node_modules/@tldraw/tlschema/
  // src/shapes/TLGeoShape.ts:40-51); a APLICAÇÃO em si (`editor.setStyleForNextShapes
  // (GeoShapeGeoStyle, elemento.geo)`) só existe como efeito num `Editor` real do
  // tldraw, sem harness de componente com editor no projeto — não coberto aqui.
  it('todo valor de geo usado pertence à lista real do tlschema (GeoShapeGeoStyle.values)', () => {
    for (const el of ELEMENTOS_PALETA) {
      if (el.geo) {
        expect(GEOS_VALIDOS.has(el.geo)).toBe(true)
      }
    }
  })
})

describe('peças da leva 4a', () => {
  it('classifica cada peça pelo jeito que ela entra no mapa', () => {
    const porTipo = (tipo: ElementoPaleta['tipo']) =>
      ELEMENTOS_PALETA.filter((e) => e.tipo === tipo).map((e) => e.id)

    expect(porTipo('geo')).toEqual(['parede'])
    expect(porTipo('texto')).toEqual(['rotulo'])
    // divisória usa a ferramenta de linha do tldraw, pré-estilada como o contorno da sala
    expect(porTipo('linha')).toEqual(['divisoria'])
    // só as de construção: os itens também são 'acao' e são conferidos no teste próprio
    expect(porTipo('acao').filter((id) => !ELEMENTOS_PALETA.find((e) => e.id === id)?.item)).toEqual([
      'sala', 'porta', 'janela', 'escada', 'mesa', 'cama', 'bau', 'secreta',
      'armadilha', 'marcador', 'andar',
    ])
  })

  it('toda peça geo declara a forma tldraw e ao menos um estilo', () => {
    for (const e of ELEMENTOS_PALETA.filter((el) => el.tipo === 'geo')) {
      expect(e.geo, `peça ${e.id} sem geo`).toBeTruthy()
      expect(Object.keys(e.estilos).length, `peça ${e.id} sem estilo`).toBeGreaterThan(0)
    }
  })

  it('todo estilo usa valor que existe no tlschema do tldraw', () => {
    // valores conferidos em node_modules/@tldraw/tlschema/src/styles/:
    // TLColorStyle.ts:23-37, TLFillStyle.ts:39, TLDashStyle.ts:38, TLSizeStyle.ts:38
    const validos: Record<string, string[]> = {
      color: ['black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue', 'yellow',
              'orange', 'green', 'light-green', 'light-red', 'red', 'white'],
      fill: ['none', 'semi', 'solid', 'pattern', 'fill', 'lined-fill'],
      dash: ['draw', 'solid', 'dashed', 'dotted'],
      size: ['s', 'm', 'l', 'xl'],
    }
    for (const e of ELEMENTOS_PALETA) {
      for (const [nome, valor] of Object.entries(e.estilos)) {
        expect(validos[nome], `estilo desconhecido: ${nome}`).toBeTruthy()
        expect(validos[nome], `${e.id}.${nome} = ${valor}`).toContain(valor)
      }
    }
  })

  it('cada peça tem id único', () => {
    const ids = ELEMENTOS_PALETA.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('pecaDaFormaCriada — identidade deduzida da própria forma', () => {
  it('reconhece a sala pelo tipo do shape próprio', () => {
    const sala = { type: 'sala-mapa', props: { w: 160, h: 112, estado: 'pendente', rotulo: 'Salão' } }
    expect(pecaDaFormaCriada(sala)).toBe('sala')
  })

  it('amostra decorativa da legenda não conta como peça do mapa', () => {
    const amostra = { type: 'sala-mapa', meta: { decorativo: true }, props: { estado: 'limpa' } }
    expect(pecaDaFormaCriada(amostra)).toBeNull()
  })

  it('reconhece símbolo desenhado pela prop `simbolo`', () => {
    const cama = { type: 'simbolo-mapa', props: { w: 40, h: 56, simbolo: 'cama', rotulo: '' } }
    expect(pecaDaFormaCriada(cama)).toBe('cama')
  })

  it('símbolo desconhecido não vira peça', () => {
    const estranho = { type: 'simbolo-mapa', props: { w: 40, h: 40, simbolo: 'trono', rotulo: '' } }
    expect(pecaDaFormaCriada(estranho)).toBeNull()
  })

  it('forma comum, que não bate com peça nenhuma, fica sem identidade', () => {
    const solta = { type: 'geo', props: { geo: 'rectangle', color: 'blue', fill: 'none', dash: 'draw', size: 'l' } }
    expect(pecaDaFormaCriada(solta)).toBeNull()
  })

  it('a porta é reconhecida pelo tipo do shape, não por estilo', () => {
    expect(pecaDaFormaCriada({ type: 'porta-mapa', props: { w: 32, h: 14, cor: 'green' } })).toBe('porta')
  })

  it('respeita identidade já carimbada por quem criou a forma', () => {
    const marcador = { type: 'geo', meta: { peca: 'marcador' }, props: { geo: 'ellipse', color: 'yellow' } }
    expect(pecaDaFormaCriada(marcador)).toBe('marcador')
  })

  it('reconhece o rótulo pelo estilo de texto', () => {
    expect(pecaDaFormaCriada({ type: 'text', props: { color: 'white', size: 's' } })).toBe('rotulo')
  })

  it('card de entidade solto no mapa não vira peça', () => {
    expect(pecaDaFormaCriada({ type: 'character-card', props: { w: 240, h: 320 } })).toBeNull()
  })

  it('forma sem props não quebra', () => {
    expect(pecaDaFormaCriada({ type: 'geo' })).toBeNull()
  })
})
