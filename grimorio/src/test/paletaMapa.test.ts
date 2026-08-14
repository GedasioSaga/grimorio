import { describe, expect, it } from 'vitest'
import { DefaultColorStyle, DefaultDashStyle, DefaultFillStyle, DefaultSizeStyle } from 'tldraw'
import { ELEMENTOS_PALETA } from '../lib/paletaMapa'

// Listas de valores válidos direto do tlschema real (StyleProp.defineEnum expõe `.values`,
// verificado em node_modules/@tldraw/tlschema/src/styles/StyleProp.ts:112-121 — EnumStyleProp
// guarda o array passado em `values` como propriedade pública readonly).
const CORES_VALIDAS = new Set<string>(DefaultColorStyle.values)
const FILLS_VALIDOS = new Set<string>(DefaultFillStyle.values)
const DASHES_VALIDOS = new Set<string>(DefaultDashStyle.values)
const SIZES_VALIDOS = new Set<string>(DefaultSizeStyle.values)

describe('ELEMENTOS_PALETA', () => {
  it('tem os 4 elementos da paleta RPG', () => {
    expect(ELEMENTOS_PALETA).toHaveLength(4)
    expect(ELEMENTOS_PALETA.map((e) => e.id)).toEqual(['parede', 'porta', 'janela', 'escada'])
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

  it('parede: geo rectangle, cor branca, fill sólido, traço sólido, tamanho m', () => {
    const parede = ELEMENTOS_PALETA.find((e) => e.id === 'parede')!
    expect(parede.geo).toBe('rectangle')
    expect(parede.estilos.color).toBe('white')
    expect(parede.estilos.fill).toBe('solid')
    expect(parede.estilos.dash).toBe('solid')
    expect(parede.estilos.size).toBe('m')
  })

  it('porta: geo rectangle, cor laranja, fill sólido, tamanho s', () => {
    const porta = ELEMENTOS_PALETA.find((e) => e.id === 'porta')!
    expect(porta.geo).toBe('rectangle')
    expect(porta.estilos.color).toBe('orange')
    expect(porta.estilos.fill).toBe('solid')
    expect(porta.estilos.size).toBe('s')
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
})
