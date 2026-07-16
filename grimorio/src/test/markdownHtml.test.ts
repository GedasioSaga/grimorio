import { describe, it, expect } from 'vitest'
import { markdownParaHtml } from '../lib/markdownHtml'

describe('markdownParaHtml — blocos', () => {
  it('títulos # ## ### viram h1 h2 h3', () => {
    expect(markdownParaHtml('# Olá')).toBe('<h1>Olá</h1>')
    expect(markdownParaHtml('## Sub')).toBe('<h2>Sub</h2>')
    expect(markdownParaHtml('### Menor')).toBe('<h3>Menor</h3>')
  })

  it('títulos além de H3 são rebaixados para h3 (limite do StarterKit)', () => {
    expect(markdownParaHtml('#### Fundo')).toBe('<h3>Fundo</h3>')
    expect(markdownParaHtml('###### Muito fundo')).toBe('<h3>Muito fundo</h3>')
  })

  it('linha vazia separa parágrafos', () => {
    expect(markdownParaHtml('um\n\ndois')).toBe('<p>um</p><p>dois</p>')
  })

  it('linhas coladas no mesmo parágrafo viram <br>', () => {
    expect(markdownParaHtml('linha1\nlinha2')).toBe('<p>linha1<br>linha2</p>')
  })

  it('lista não ordenada (-, *, +)', () => {
    expect(markdownParaHtml('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>')
    expect(markdownParaHtml('* a\n+ b')).toBe('<ul><li>a</li><li>b</li></ul>')
  })

  it('lista ordenada', () => {
    expect(markdownParaHtml('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>')
  })

  it('citação com > vira blockquote com parágrafo', () => {
    expect(markdownParaHtml('> pense nisso')).toBe('<blockquote><p>pense nisso</p></blockquote>')
  })

  it('régua horizontal --- ou ***', () => {
    expect(markdownParaHtml('---')).toBe('<hr>')
    expect(markdownParaHtml('***')).toBe('<hr>')
  })

  it('documento misto mantém a ordem dos blocos', () => {
    const md = '# Sangue\n\nIntro do sistema.\n\n## Tipos\n\n- Raiva\n- Medo'
    expect(markdownParaHtml(md)).toBe(
      '<h1>Sangue</h1><p>Intro do sistema.</p><h2>Tipos</h2><ul><li>Raiva</li><li>Medo</li></ul>',
    )
  })
})

describe('markdownParaHtml — inline', () => {
  it('negrito e itálico', () => {
    expect(markdownParaHtml('a **b** c')).toBe('<p>a <strong>b</strong> c</p>')
    expect(markdownParaHtml('a *b* c')).toBe('<p>a <em>b</em> c</p>')
    expect(markdownParaHtml('a _b_ c')).toBe('<p>a <em>b</em> c</p>')
  })

  it('inline funciona dentro de título e item de lista', () => {
    expect(markdownParaHtml('# **Forte**')).toBe('<h1><strong>Forte</strong></h1>')
    expect(markdownParaHtml('- **x**')).toBe('<ul><li><strong>x</strong></li></ul>')
  })
})

describe('markdownParaHtml — segurança e marcadores', () => {
  it('escapa &, < e > do texto', () => {
    expect(markdownParaHtml('a < b & c > d')).toBe('<p>a &lt; b &amp; c &gt; d</p>')
  })

  it('preserva marcadores de imagem {{IMG:n}} intactos', () => {
    expect(markdownParaHtml('{{IMG:0}}')).toBe('<p>{{IMG:0}}</p>')
    expect(markdownParaHtml('antes\n\n{{IMG:2}}\n\ndepois')).toBe(
      '<p>antes</p><p>{{IMG:2}}</p><p>depois</p>',
    )
  })
})
