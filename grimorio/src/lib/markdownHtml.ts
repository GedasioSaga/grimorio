/**
 * Markdown ↔ HTML, no subset que o TipTap StarterKit entende:
 * H1–H3, listas (com aninhamento), negrito/itálico, citação, régua e parágrafos.
 *
 * `markdownParaHtml` é a VOLTA: a IA responde em Markdown e isto vira as tags do editor
 * (o `textoParaHtml` só faz `<p>`, então gravaria `## Título` e `**negrito**` como texto).
 *
 * `htmlParaMarkdown` é a IDA: o que já está escrito no editor volta a ser Markdown antes
 * de ir para a IA. Com `htmlParaTexto` no lugar dela, a IA recebia o texto achatado — não
 * enxergava os títulos e listas que o usuário montou, e "Melhorar" corroía a estrutura a
 * cada rodada.
 *
 * Marcadores `{{IMG:n}}` passam intactos nos dois sentidos: as imagens são reinseridas
 * depois (ver `imagensMarcador.ts`), preservando a posição no texto.
 */

const RE_HR = /^(-{3,}|\*{3,})$/
const RE_HEADING = /^(#{1,6})\s+(.*)$/
/** Item de lista com a indentação preservada (o grupo 1 é quem define o aninhamento). */
const RE_ITEM = /^(\s*)([-*+]|\d+\.)\s+(.*)$/
const RE_QUOTE = /^>\s?/
/** Início de qualquer bloco não-parágrafo — corta a captura de um parágrafo. */
const RE_BLOCO = /^(#{1,6}\s|>\s?|[-*+]\s|\d+\.\s|-{3,}$|\*{3,}$)/

/** Um nível de aninhamento de lista, na ida e na volta. */
const RECUO_LISTA = '  '
/** Tab conta como 4 colunas ao medir indentação (só a comparação relativa importa). */
const COLUNAS_POR_TAB = 4

const NO_ELEMENTO = 1
const NO_TEXTO = 3

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Ênfase inline após escapar; `**` antes de `*` para não quebrar o negrito. */
function inline(s: string): string {
  return escapar(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
}

interface ItemLista {
  /** Colunas de indentação; comparado só com os irmãos do mesmo bloco. */
  indent: number
  ordenada: boolean
  texto: string
}

function colunasDeIndentacao(espacos: string): number {
  return espacos.replace(/\t/g, ' '.repeat(COLUNAS_POR_TAB)).length
}

/**
 * Itens contíguos → `<ul>`/`<ol>` aninhados.
 *
 * A profundidade sai da indentação RELATIVA, não de uma contagem fixa de espaços: a IA
 * às vezes indenta com 2, às vezes com 4, e o que importa é só quem está mais fundo que
 * o pai. Um item com filhos vira `<li>texto<ul>…</ul></li>`, que é como o StarterKit
 * representa sublista.
 */
function listaHtml(itens: ItemLista[]): string {
  const base = Math.min(...itens.map((x) => x.indent))
  const tag = itens[0].ordenada ? 'ol' : 'ul'
  const partes: string[] = []
  let i = 0
  while (i < itens.length) {
    let fim = i + 1
    while (fim < itens.length && itens[fim].indent > base) fim++
    const filhos = itens.slice(i + 1, fim)
    partes.push(`<li>${inline(itens[i].texto)}${filhos.length ? listaHtml(filhos) : ''}</li>`)
    i = fim
  }
  return `<${tag}>${partes.join('')}</${tag}>`
}

export function markdownParaHtml(md: string): string {
  const linhas = (md ?? '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < linhas.length) {
    const t = linhas[i].trim()
    if (t === '') {
      i++
      continue
    }

    if (RE_HR.test(t)) {
      out.push('<hr>')
      i++
      continue
    }

    const h = t.match(RE_HEADING)
    if (h) {
      const nivel = Math.min(h[1].length, 3) // StarterKit vai só até H3
      out.push(`<h${nivel}>${inline(h[2].trim())}</h${nivel}>`)
      i++
      continue
    }

    if (RE_QUOTE.test(t)) {
      const buf: string[] = []
      while (i < linhas.length && RE_QUOTE.test(linhas[i].trim())) {
        buf.push(linhas[i].trim().replace(RE_QUOTE, ''))
        i++
      }
      out.push(`<blockquote><p>${buf.map(inline).join('<br>')}</p></blockquote>`)
      continue
    }

    // lista: acumula o bloco inteiro (todos os níveis) e monta o aninhamento de uma vez
    if (RE_ITEM.test(linhas[i])) {
      const itens: ItemLista[] = []
      while (i < linhas.length) {
        const m = linhas[i].match(RE_ITEM)
        if (!m) break
        itens.push({
          indent: colunasDeIndentacao(m[1]),
          ordenada: /^\d/.test(m[2]),
          texto: m[3].trim(),
        })
        i++
      }
      out.push(listaHtml(itens))
      continue
    }

    // parágrafo: acumula até linha vazia ou início de outro bloco
    const buf: string[] = []
    while (i < linhas.length) {
      const ll = linhas[i].trim()
      if (ll === '' || RE_BLOCO.test(ll)) break
      buf.push(ll)
      i++
    }
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`)
  }

  return out.join('')
}

/** Texto de um nó com a ênfase virando Markdown. Tag desconhecida: só desce nos filhos. */
function inlineMarkdown(no: Node): string {
  if (no.nodeType === NO_TEXTO) return no.textContent ?? ''
  if (no.nodeType !== NO_ELEMENTO) return ''
  const el = no as Element
  const dentro = Array.from(el.childNodes).map(inlineMarkdown).join('')
  if (el.tagName === 'BR') return '\n'
  // ênfase vazia não vira `****`: um par de asteriscos solto viraria lixo no prompt
  if (!dentro.trim()) return dentro
  if (el.tagName === 'STRONG' || el.tagName === 'B') return `**${dentro}**`
  if (el.tagName === 'EM' || el.tagName === 'I') return `*${dentro}*`
  return dentro
}

/** `<ul>`/`<ol>` → linhas de item, com `RECUO_LISTA` por nível de profundidade. */
function listaMarkdown(el: Element, recuo: string): string {
  const ordenada = el.tagName === 'OL'
  const linhas: string[] = []
  let n = 1
  for (const li of Array.from(el.children)) {
    if (li.tagName !== 'LI') continue
    const proprio: string[] = []
    const sublistas: string[] = []
    for (const filho of Array.from(li.childNodes)) {
      const tag = filho.nodeType === NO_ELEMENTO ? (filho as Element).tagName : ''
      // sublista é irmã do parágrafo dentro do <li>, não parte do texto do item
      if (tag === 'UL' || tag === 'OL') sublistas.push(listaMarkdown(filho as Element, recuo + RECUO_LISTA))
      else proprio.push(inlineMarkdown(filho))
    }
    linhas.push(`${recuo}${ordenada ? `${n++}. ` : '- '}${proprio.join('').trim()}`)
    linhas.push(...sublistas)
  }
  return linhas.join('\n')
}

/** Um bloco de topo → Markdown (string multi-linha). '' quando não sobra texto. */
function blocoMarkdown(no: Node): string {
  if (no.nodeType === NO_TEXTO) return (no.textContent ?? '').trim()
  if (no.nodeType !== NO_ELEMENTO) return ''
  const el = no as Element
  switch (el.tagName) {
    case 'H1':
      return `# ${inlineMarkdown(el).trim()}`
    case 'H2':
      return `## ${inlineMarkdown(el).trim()}`
    // StarterKit só emite até H3, mas HTML colado pode trazer mais fundo
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
      return `### ${inlineMarkdown(el).trim()}`
    case 'UL':
    case 'OL':
      return listaMarkdown(el, '')
    case 'BLOCKQUOTE':
      return Array.from(el.childNodes)
        .map(blocoMarkdown)
        .filter(Boolean)
        .join('\n')
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')
    case 'HR':
      return '---'
    case 'PRE':
    case 'P':
      return inlineMarkdown(el).trim()
    default:
      // wrapper (div, section…): desce e trata os filhos como blocos de topo
      return Array.from(el.childNodes).map(blocoMarkdown).filter(Boolean).join('\n\n')
  }
}

/**
 * HTML do TipTap → Markdown, para o texto que vai à IA chegar com a estrutura de pé.
 *
 * O texto NÃO é escapado: o destino é o prompt de um modelo, não um parser estrito, e
 * encher a descrição de `\*` atrapalharia mais a leitura do que um asterisco solto.
 */
export function htmlParaMarkdown(html: string | null | undefined): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return Array.from(doc.body.childNodes)
    .map(blocoMarkdown)
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
