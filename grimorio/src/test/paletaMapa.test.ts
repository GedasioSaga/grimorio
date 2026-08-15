import { describe, expect, it } from 'vitest'
import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultSizeStyle,
  GeoShapeGeoStyle,
} from 'tldraw'
import { ELEMENTOS_PALETA, type ElementoPaleta } from '../lib/paletaMapa'

// Listas de valores válidos direto do tlschema real (StyleProp.defineEnum expõe `.values`,
// verificado em node_modules/@tldraw/tlschema/src/styles/StyleProp.ts:112-121 — EnumStyleProp
// guarda o array passado em `values` como propriedade pública readonly).
const CORES_VALIDAS = new Set<string>(DefaultColorStyle.values)
const FILLS_VALIDOS = new Set<string>(DefaultFillStyle.values)
const DASHES_VALIDOS = new Set<string>(DefaultDashStyle.values)
const SIZES_VALIDOS = new Set<string>(DefaultSizeStyle.values)
const GEOS_VALIDOS = new Set<string>(GeoShapeGeoStyle.values)

describe('ELEMENTOS_PALETA', () => {
  // leva 4a: catálogo cresceu de 5 pra 10 peças (móvel, secreta, armadilha, marcador, rótulo) — ver describe abaixo
  it('tem os 10 elementos da paleta RPG', () => {
    expect(ELEMENTOS_PALETA).toHaveLength(10)
    expect(ELEMENTOS_PALETA.map((e) => e.id)).toEqual([
      'sala', 'parede', 'porta', 'janela', 'escada',
      'movel', 'secreta', 'armadilha', 'marcador', 'rotulo',
    ])
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

  it('sala: geo rectangle, verde sólida — a base dos mapas de referência', () => {
    const sala = ELEMENTOS_PALETA.find((e) => e.id === 'sala')!
    expect(sala.geo).toBe('rectangle')
    expect(sala.estilos.color).toBe('green')
    expect(sala.estilos.fill).toBe('solid')
    expect(sala.estilos.size).toBe('s')
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

  it('janela: geo rectangle, cor light-blue, sem fill, tamanho s', () => {
    const janela = ELEMENTOS_PALETA.find((e) => e.id === 'janela')!
    expect(janela.geo).toBe('rectangle')
    expect(janela.estilos.color).toBe('light-blue')
    expect(janela.estilos.fill).toBe('none')
    expect(janela.estilos.size).toBe('s')
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

    expect(porTipo('geo')).toEqual(['sala', 'parede', 'janela', 'movel', 'secreta', 'armadilha'])
    expect(porTipo('texto')).toEqual(['rotulo'])
    expect(porTipo('acao')).toEqual(['porta', 'escada', 'marcador'])
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
