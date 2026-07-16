/** True se o HTML do TipTap tem texto de verdade (ignora tags, `&nbsp;` e espaços). */
export function temConteudo(html: string | null | undefined): boolean {
  if (!html) return false
  const texto = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  return texto.length > 0
}

/** HTML do TipTap → texto plano (parágrafos e <br> viram quebras de linha). */
export function htmlParaTexto(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<\/(p|div|li|h[1-6]|pre|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    // decodifica só as entidades que o serializador do TipTap gera
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Texto plano da IA → HTML simples (um <p> por linha não-vazia; conteúdo escapado). */
export function textoParaHtml(texto: string): string {
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('')
}
