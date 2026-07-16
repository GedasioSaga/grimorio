/**
 * Conversor Markdown → HTML, subset do que o TipTap StarterKit entende:
 * H1–H3, listas, negrito/itálico, citação, régua e parágrafos. A IA da escrita
 * responde em Markdown e isto vira as tags do editor (o `textoParaHtml` só faz
 * `<p>`, então não serviria pra títulos/listas).
 *
 * Marcadores `{{IMG:n}}` passam intactos: as imagens são reinseridas depois
 * (ver `imagensMarcador.ts`), preservando a posição no texto.
 */

const RE_HR = /^(-{3,}|\*{3,})$/
const RE_HEADING = /^(#{1,6})\s+(.*)$/
const RE_UL = /^[-*+]\s+/
const RE_OL = /^\d+\.\s+/
const RE_QUOTE = /^>\s?/
/** Início de qualquer bloco não-parágrafo — corta a captura de um parágrafo. */
const RE_BLOCO = /^(#{1,6}\s|>\s?|[-*+]\s|\d+\.\s|-{3,}$|\*{3,}$)/

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

    if (RE_UL.test(t)) {
      const buf: string[] = []
      while (i < linhas.length && RE_UL.test(linhas[i].trim())) {
        buf.push(linhas[i].trim().replace(RE_UL, ''))
        i++
      }
      out.push(`<ul>${buf.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`)
      continue
    }

    if (RE_OL.test(t)) {
      const buf: string[] = []
      while (i < linhas.length && RE_OL.test(linhas[i].trim())) {
        buf.push(linhas[i].trim().replace(RE_OL, ''))
        i++
      }
      out.push(`<ol>${buf.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`)
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
