/** True se o HTML do TipTap tem texto de verdade (ignora tags, `&nbsp;` e espaços). */
export function temConteudo(html: string | null | undefined): boolean {
  if (!html) return false
  const texto = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  return texto.length > 0
}
