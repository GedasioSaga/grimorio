// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { generateJSON, generateHTML } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ImagemCofre } from '../components/ImagemCofre'
import { calcularLarguraPct } from '../lib/imagem'

const extensions = [StarterKit, ImagemCofre]
const roundTrip = (html: string) => generateHTML(generateJSON(html, extensions), extensions)

describe('ImagemCofre round-trip HTML', () => {
  it('preserva data-largura, data-align e data-legenda', () => {
    const out = roundTrip(
      '<img data-rel="imagens-notas/ab12.png" data-largura="50" data-align="center" data-legenda="Mapa da cidade">',
    )
    expect(out).toContain('data-rel="imagens-notas/ab12.png"')
    expect(out).toContain('data-largura="50"')
    expect(out).toContain('data-align="center"')
    expect(out).toContain('data-legenda="Mapa da cidade"')
  })
  it('imagem antiga sem novos attrs continua válida (retrocompat)', () => {
    const out = roundTrip('<img data-rel="imagens-notas/old.png">')
    expect(out).toContain('data-rel="imagens-notas/old.png"')
    expect(out).not.toContain('data-largura')
    expect(out).not.toContain('data-align')
    expect(out).not.toContain('data-legenda')
  })
  it('nunca serializa src', () => {
    expect(roundTrip('<img data-rel="imagens-notas/ab12.png">')).not.toContain('src=')
  })
})

describe('calcularLarguraPct', () => {
  it('converte px para % da coluna', () => {
    expect(calcularLarguraPct(400, 0, 800)).toBe(50)
  })
  it('arrastar pra fora aumenta a largura', () => {
    expect(calcularLarguraPct(400, 400, 800)).toBe(100)
  })
  it('trava no mínimo (10%)', () => {
    expect(calcularLarguraPct(400, -1000, 800)).toBe(10)
  })
  it('trava no teto (100%)', () => {
    expect(calcularLarguraPct(700, 400, 800)).toBe(100)
  })
  it('container inválido retorna 100', () => {
    expect(calcularLarguraPct(400, 0, 0)).toBe(100)
  })
})
