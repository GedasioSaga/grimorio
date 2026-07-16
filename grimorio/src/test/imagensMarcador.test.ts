import { describe, it, expect } from 'vitest'
import { extrairImagens, reinserirImagens, TOKEN_IMG } from '../lib/imagensMarcador'

describe('extrairImagens', () => {
  it('troca cada <img> por um marcador e guarda a tag em ordem', () => {
    const r = extrairImagens('<p>a</p><img data-rel="x.png"><p>b</p><img data-rel="y.png">')
    expect(r.imagens).toEqual(['<img data-rel="x.png">', '<img data-rel="y.png">'])
    expect(r.html).toContain(TOKEN_IMG(0))
    expect(r.html).toContain(TOKEN_IMG(1))
    expect(r.html).not.toContain('<img')
  })

  it('preserva todos os atributos da imagem na tag guardada', () => {
    const tag = '<img data-rel="a.png" data-largura="50" data-align="center" data-legenda="oi">'
    const r = extrairImagens(`<p>t</p>${tag}`)
    expect(r.imagens).toEqual([tag])
  })

  it('sem imagens: html inalterado e lista vazia', () => {
    const r = extrairImagens('<p>só texto</p>')
    expect(r.imagens).toEqual([])
    expect(r.html).toBe('<p>só texto</p>')
  })
})

describe('reinserirImagens', () => {
  it('marcador sozinho num parágrafo vira a imagem (sem <p> em volta)', () => {
    const out = reinserirImagens('<h1>T</h1><p>{{IMG:0}}</p><p>fim</p>', ['<img data-rel="a.png">'])
    expect(out).toBe('<h1>T</h1><img data-rel="a.png"><p>fim</p>')
  })

  it('marcador inline é substituído no lugar', () => {
    const out = reinserirImagens('<p>veja {{IMG:0}} aqui</p>', ['<img data-rel="a.png">'])
    expect(out).toBe('<p>veja <img data-rel="a.png"> aqui</p>')
  })

  it('imagem não referenciada pela IA é anexada no fim (nunca perde)', () => {
    const out = reinserirImagens('<p>texto</p>', ['<img data-rel="a.png">'])
    expect(out).toBe('<p>texto</p><img data-rel="a.png">')
  })

  it('mantém posição de uma e joga a sobra pro fim', () => {
    const out = reinserirImagens('<p>{{IMG:1}}</p>', ['<img data-rel="a.png">', '<img data-rel="b.png">'])
    expect(out).toBe('<img data-rel="b.png"><img data-rel="a.png">')
  })
})

describe('round-trip extrair → reinserir', () => {
  it('preserva a imagem na posição original', () => {
    const original = '<p>x</p><img data-rel="a.png"><p>y</p>'
    const { html, imagens } = extrairImagens(original)
    expect(reinserirImagens(html, imagens)).toContain('<img data-rel="a.png">')
  })
})
