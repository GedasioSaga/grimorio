// @vitest-environment jsdom
// (`htmlParaMarkdown` lê o HTML com `DOMParser`; a metade `markdownParaHtml` roda sem DOM
//  e continua testada em markdownHtml.test.ts)
import { describe, expect, it } from 'vitest'
import { htmlParaMarkdown, markdownParaHtml } from '../lib/markdownHtml'

describe('htmlParaMarkdown — blocos', () => {
  it('parágrafos separados por linha em branco', () => {
    expect(htmlParaMarkdown('<p>um</p><p>dois</p>')).toBe('um\n\ndois')
  })

  it('títulos viram # ## ###', () => {
    expect(htmlParaMarkdown('<h1>A</h1>')).toBe('# A')
    expect(htmlParaMarkdown('<h2>B</h2>')).toBe('## B')
    expect(htmlParaMarkdown('<h3>C</h3>')).toBe('### C')
  })

  it('título mais fundo que H3 desce para ### (o editor não vai além)', () => {
    expect(htmlParaMarkdown('<h5>D</h5>')).toBe('### D')
  })

  it('<br> vira quebra de linha dentro do parágrafo', () => {
    expect(htmlParaMarkdown('<p>l1<br>l2</p>')).toBe('l1\nl2')
  })

  it('citação prefixa cada linha com >', () => {
    expect(htmlParaMarkdown('<blockquote><p>pense</p></blockquote>')).toBe('> pense')
    expect(htmlParaMarkdown('<blockquote><p>a</p><p>b</p></blockquote>')).toBe('> a\n> b')
  })

  it('régua vira ---', () => {
    expect(htmlParaMarkdown('<hr>')).toBe('---')
  })

  it('desce em wrapper desconhecido em vez de perder o texto', () => {
    expect(htmlParaMarkdown('<div><p>dentro</p></div>')).toBe('dentro')
  })
})

describe('htmlParaMarkdown — inline', () => {
  it('negrito e itálico viram ** e *', () => {
    expect(htmlParaMarkdown('<p>a <strong>b</strong> c</p>')).toBe('a **b** c')
    expect(htmlParaMarkdown('<p>a <em>b</em> c</p>')).toBe('a *b* c')
  })

  it('aceita <b> e <i> (HTML colado de fora)', () => {
    expect(htmlParaMarkdown('<p><b>x</b> <i>y</i></p>')).toBe('**x** *y*')
  })

  /** `<strong></strong>` viraria `****`, que polui o prompt sem marcar nada. */
  it('ênfase vazia não emite asteriscos soltos', () => {
    expect(htmlParaMarkdown('<p>a<strong></strong>b</p>')).toBe('ab')
  })

  it('decodifica as entidades do serializador do TipTap', () => {
    expect(htmlParaMarkdown('<p>a &amp; b &lt;c&gt;</p>')).toBe('a & b <c>')
  })
})

describe('htmlParaMarkdown — listas', () => {
  it('lista do TipTap (<li> com <p> dentro)', () => {
    expect(htmlParaMarkdown('<ul><li><p>a</p></li><li><p>b</p></li></ul>')).toBe('- a\n- b')
  })

  it('lista sem <p> dentro do <li>', () => {
    expect(htmlParaMarkdown('<ul><li>a</li><li>b</li></ul>')).toBe('- a\n- b')
  })

  it('lista numerada conta a partir de 1', () => {
    expect(htmlParaMarkdown('<ol><li><p>a</p></li><li><p>b</p></li></ol>')).toBe('1. a\n2. b')
  })

  it('sublista recua dois espaços', () => {
    expect(htmlParaMarkdown('<ul><li><p>pai</p><ul><li><p>filho</p></li></ul></li></ul>')).toBe(
      '- pai\n  - filho',
    )
  })

  it('três níveis', () => {
    const html = '<ul><li><p>a</p><ul><li><p>b</p><ul><li><p>c</p></li></ul></li></ul></li></ul>'
    expect(htmlParaMarkdown(html)).toBe('- a\n  - b\n    - c')
  })
})

describe('htmlParaMarkdown — entradas de borda', () => {
  it('vazio, null e undefined dão string vazia', () => {
    expect(htmlParaMarkdown('')).toBe('')
    expect(htmlParaMarkdown(null)).toBe('')
    expect(htmlParaMarkdown(undefined)).toBe('')
  })

  it('parágrafo vazio do editor não vira linha em branco solta', () => {
    expect(htmlParaMarkdown('<p></p><p>texto</p><p></p>')).toBe('texto')
  })

  it('preserva marcadores de imagem {{IMG:n}}', () => {
    expect(htmlParaMarkdown('<p>antes</p><p>{{IMG:0}}</p><p>depois</p>')).toBe(
      'antes\n\n{{IMG:0}}\n\ndepois',
    )
  })
})

/**
 * O par existe para o texto sobreviver ao ciclo "manda pra IA → IA devolve → grava".
 * Sem isto, cada rodada de "Melhorar" achatava um pouco mais a estrutura: era o que
 * acontecia quando a ida usava `htmlParaTexto`.
 */
describe('ida e volta', () => {
  const CASOS = [
    '## Aparência',
    'um parágrafo simples',
    'a **forte** e *leve*',
    '- a\n- b',
    '1. a\n2. b',
    '- pai\n  - filho',
    '- a\n  - a1\n- b',
    '> citação',
    '---',
    '## Aparência\n\n- alto\n  - cicatriz no rosto\n\nTexto de fecho com **peso**.',
  ]

  it.each(CASOS)('markdown → html → markdown é estável para %j', (md) => {
    expect(htmlParaMarkdown(markdownParaHtml(md))).toBe(md)
  })
})
