/** Tipos e normalização do chat de IA salvo por sessão (chat-ia.json). */

export interface MensagemChat {
  papel: 'user' | 'model'
  texto: string
  em: string // ISO-8601 ('' em registros antigos)
}

/** Quantas mensagens do fim do histórico vão ao modelo (tier gratuito: janela curta). */
export const JANELA_HISTORICO = 20

/** Persona do assistente (system instruction). */
export const SYSTEM_MESTRE = [
  'Você é um assistente de mestre de RPG, em português do Brasil.',
  'Você recebe o contexto da campanha (personagens, cenários, vínculos, notas da sessão).',
  'Seja criativo em sugestões (reviravoltas, descrições de cena, ganchos), mas NUNCA contradiga fatos do contexto.',
  'O mestre está no meio da sessão: respostas curtas e diretas por padrão; detalhe só quando pedirem.',
].join(' ')

export function normalizarChat(raw: unknown): MensagemChat[] {
  const lista = (raw as { mensagens?: unknown })?.mensagens
  if (!Array.isArray(lista)) return []
  const out: MensagemChat[] = []
  for (const x of lista) {
    const m = x as Partial<MensagemChat> | null
    if (!m) continue
    if (m.papel !== 'user' && m.papel !== 'model') continue
    if (typeof m.texto !== 'string' || !m.texto) continue
    out.push({ papel: m.papel, texto: m.texto, em: typeof m.em === 'string' ? m.em : '' })
  }
  return out
}
