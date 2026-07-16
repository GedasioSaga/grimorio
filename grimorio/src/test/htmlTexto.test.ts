import { describe, expect, it } from 'vitest'
import { htmlParaTexto, temConteudo, textoParaHtml } from '../lib/htmlTexto'

describe('temConteudo', () => {
  it('vazio/null/undefined → false', () => {
    expect(temConteudo('')).toBe(false)
    expect(temConteudo(null)).toBe(false)
    expect(temConteudo(undefined)).toBe(false)
  })

  it('parágrafo vazio do TipTap → false', () => {
    expect(temConteudo('<p></p>')).toBe(false)
  })

  it('só espaços / nbsp / br → false', () => {
    expect(temConteudo('<p>  </p>')).toBe(false)
    expect(temConteudo('<p>&nbsp;</p>')).toBe(false)
    expect(temConteudo('<p><br></p>')).toBe(false)
  })

  it('texto real → true', () => {
    expect(temConteudo('<p>Um homem velho</p>')).toBe(true)
  })

  it('lista com itens → true', () => {
    expect(temConteudo('<ul><li>Cabelos brancos</li></ul>')).toBe(true)
  })
})

describe('htmlParaTexto', () => {
  it('converte parágrafos/br em quebras e remove tags', () => {
    expect(htmlParaTexto('<p>Oi <b>mestre</b></p><p>linha 2</p>')).toBe('Oi mestre\nlinha 2')
  })
  it('vazio/null → ""', () => {
    expect(htmlParaTexto(null)).toBe('')
    expect(htmlParaTexto('<p></p>')).toBe('')
  })
  it('separa blocos <pre>/<blockquote> do texto seguinte', () => {
    expect(htmlParaTexto('<blockquote>cita</blockquote><p>depois</p>')).toBe('cita\ndepois')
    expect(htmlParaTexto('<pre>code</pre><p>fim</p>')).toBe('code\nfim')
  })
})

describe('textoParaHtml', () => {
  it('parágrafos por linha, escapando HTML', () => {
    expect(textoParaHtml('linha 1\n\nlinha <2> & fim')).toBe('<p>linha 1</p><p>linha &lt;2&gt; &amp; fim</p>')
  })
  it('vazio → ""', () => {
    expect(textoParaHtml('  \n ')).toBe('')
  })
})
