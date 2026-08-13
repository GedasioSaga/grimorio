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

/**
 * O aninhamento sai da indentação RELATIVA porque o modelo não é consistente: a mesma
 * conversa manda 2 espaços numa resposta e 4 na seguinte. Contar espaço fixo faria a
 * sublista virar item irmão em metade dos casos — que era o comportamento antigo.
 */
describe('markdownParaHtml — listas aninhadas', () => {
  it('aninha sublista com 2 espaços', () => {
    expect(markdownParaHtml('- pai\n  - filho')).toBe('<ul><li>pai<ul><li>filho</li></ul></li></ul>')
  })

  it('aninha igual com 4 espaços', () => {
    expect(markdownParaHtml('- pai\n    - filho')).toBe('<ul><li>pai<ul><li>filho</li></ul></li></ul>')
  })

  it('aninha com tab', () => {
    expect(markdownParaHtml('- pai\n\t- filho')).toBe('<ul><li>pai<ul><li>filho</li></ul></li></ul>')
  })

  it('volta ao nível do pai depois da sublista', () => {
    expect(markdownParaHtml('- a\n  - a1\n- b')).toBe(
      '<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul>',
    )
  })

  it('aninha três níveis', () => {
    expect(markdownParaHtml('- a\n  - b\n    - c')).toBe(
      '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>',
    )
  })

  it('sublista numerada dentro de lista com marcador', () => {
    expect(markdownParaHtml('- equipamento\n  1. espada\n  2. escudo')).toBe(
      '<ul><li>equipamento<ol><li>espada</li><li>escudo</li></ol></li></ul>',
    )
  })

  it('lista plana continua plana (nada de aninhamento acidental)', () => {
    expect(markdownParaHtml('- a\n- b\n- c')).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>')
  })

  it('bloco inteiro indentado por igual não vira aninhamento', () => {
    expect(markdownParaHtml('  - a\n  - b')).toBe('<ul><li>a</li><li>b</li></ul>')
  })

  it('aplica ênfase dentro do item aninhado', () => {
    expect(markdownParaHtml('- pai\n  - **forte**')).toBe(
      '<ul><li>pai<ul><li><strong>forte</strong></li></ul></li></ul>',
    )
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

/**
 * A saída deste módulo é injetada como HTML em duas telas (NotasEditor e as bolhas do
 * chat), e o texto vem do modelo — ou seja, de fora. A segurança disso não está em
 * escapar bem: está em o gerador ser incapaz de emitir ATRIBUTO. Sem atributo não há
 * `onerror`, não há `href="javascript:"`, não há `src`. Estes testes prendem essa
 * propriedade para que dar suporte a links um dia seja uma decisão consciente, e não uma
 * brecha aberta sem querer.
 */
describe('markdownParaHtml — invariante de injeção', () => {
  /** Só estas tags podem sair daqui, e nenhuma com atributo. */
  const PERMITIDAS = new Set(['p', 'br', 'hr', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'strong', 'em'])

  const HOSTIS = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '# <img src=x onerror=alert(1)>',
    '- <iframe src="javascript:alert(1)"></iframe>',
    '- ok\n  - <iframe src="javascript:alert(1)"></iframe>', // item aninhado passa por outro caminho
    '> <svg onload=alert(1)>',
    '[clique](javascript:alert(1))',
    '**<a href="javascript:alert(1)">x</a>**',
    '<p onclick="roubar()">texto</p>',
    '<!-- <script>alert(1)</script> -->',
    '<style>body{display:none}</style>',
  ]

  it.each(HOSTIS)('não emite tag com atributo para %j', (entrada) => {
    const html = markdownParaHtml(entrada)
    for (const [, nome, resto] of html.matchAll(/<\/?([a-z0-9]+)([^>]*)>/gi)) {
      expect(PERMITIDAS).toContain(nome.toLowerCase())
      expect(resto.trim()).toBe('') // nenhum atributo, nunca
    }
  })

  it.each(HOSTIS.filter((h) => h.includes('<')))('neutraliza o < da marcação hostil em %j', (entrada) => {
    // todo '<' que sobrou abre uma das tags permitidas; o do texto virou &lt;
    expect(markdownParaHtml(entrada)).toContain('&lt;')
  })

  it('sintaxe de link do Markdown fica literal — nenhum href chega ao DOM', () => {
    expect(markdownParaHtml('[clique](javascript:alert(1))')).toBe('<p>[clique](javascript:alert(1))</p>')
    expect(markdownParaHtml('[site](https://exemplo.com)')).toBe('<p>[site](https://exemplo.com)</p>')
  })

  it('não deixa passar tag mesmo quebrada entre linhas do mesmo parágrafo', () => {
    const html = markdownParaHtml('<img\nsrc=x onerror=alert(1)>')
    expect(html).toBe('<p>&lt;img<br>src=x onerror=alert(1)&gt;</p>')
  })
})
