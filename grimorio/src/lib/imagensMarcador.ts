/**
 * Marcadores de imagem para a IA da escrita. A IA recebe só texto, então as
 * imagens inline (`<img data-rel …>`) viram marcadores `{{IMG:n}}` antes do envio
 * e voltam depois — mantendo a posição no texto reorganizado.
 *
 * Token ASCII de propósito: LLM reproduz `{{IMG:0}}` com mais fidelidade que um
 * caractere unicode raro. Qualquer imagem cujo marcador a IA perca é anexada no
 * fim (nunca some).
 */

export const TOKEN_IMG = (n: number): string => `{{IMG:${n}}}`

const RE_IMG = /<img\b[^>]*>/gi

/** Substitui cada `<img>` por `{{IMG:n}}` (em linha própria) e devolve as tags em ordem. */
export function extrairImagens(html: string): { html: string; imagens: string[] } {
  const imagens: string[] = []
  const novo = (html ?? '').replace(RE_IMG, (tag) => {
    const n = imagens.length
    imagens.push(tag)
    return `\n${TOKEN_IMG(n)}\n`
  })
  return { html: novo, imagens }
}

/** Volta os marcadores para as tags; índices não usados vão para o fim. */
export function reinserirImagens(html: string, imagens: string[]): string {
  const usados = new Set<number>()
  const trocar = (m: string, d: string): string => {
    const n = Number(d)
    if (n < imagens.length) {
      usados.add(n)
      return imagens[n]
    }
    return m // índice inventado pela IA: deixa o marcador visível em vez de sumir
  }

  let out = html ?? ''
  // marcador sozinho num parágrafo (como o markdownParaHtml o envolve) → só a imagem
  out = out.replace(/<p>\s*\{\{IMG:(\d+)\}\}\s*<\/p>/g, trocar)
  // marcador inline restante
  out = out.replace(/\{\{IMG:(\d+)\}\}/g, trocar)

  const sobras = imagens.filter((_, n) => !usados.has(n))
  return sobras.length ? out + sobras.join('') : out
}
