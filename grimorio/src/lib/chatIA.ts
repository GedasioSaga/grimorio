/** Tipos e normalização do chat de IA salvo por sessão (chat-ia.json). */

export interface MensagemChat {
  papel: 'user' | 'model'
  texto: string
  em: string // ISO-8601 ('' em registros antigos)
}

/**
 * Quantas mensagens do fim do histórico vão ao modelo. O resto continua na tela e no
 * arquivo — só não é enviado. Escolha do usuário (Opções → IA), porque o custo é dele:
 * janela maior é conversa mais coerente e conta mais cara.
 */
const CHAVE_JANELA = 'grimorio.janelaIA'

/** Padrão histórico do app; era uma constante fixa antes de virar opção. */
export const JANELA_PADRAO = 20

/** Valores oferecidos nas Opções. 0 = manda a conversa inteira. */
export const JANELAS = [10, 20, 40, 80, 0] as const

/**
 * Janela escolhida nesta máquina (o padrão quando não há escolha válida).
 *
 * A chave ausente é testada ANTES da conversão: `Number(null)` é 0, que aqui significa
 * "manda a conversa inteira" — quem nunca abriu as Opções começaria pagando pelo
 * histórico completo sem ter pedido nada.
 */
export function janelaSalva(): number {
  const bruto = localStorage.getItem(CHAVE_JANELA)
  if (bruto === null) return JANELA_PADRAO
  const n = Number(bruto)
  return JANELAS.includes(n as (typeof JANELAS)[number]) ? n : JANELA_PADRAO
}

export function salvarJanela(n: number): void {
  if (n === JANELA_PADRAO) localStorage.removeItem(CHAVE_JANELA)
  else localStorage.setItem(CHAVE_JANELA, String(n))
}

/**
 * Divide a conversa no que vai à IA e no que ficou de fora.
 *
 * Existe para a UI poder DIZER que cortou. Antes o corte era um `slice` mudo no meio do
 * envio: a IA "esquecia" o começo e o usuário não tinha como saber que isso aconteceu —
 * parecia burrice do modelo, não limite de janela.
 */
export function recortarJanela<T>(mensagens: T[], janela: number): { enviadas: T[]; cortadas: number } {
  if (janela <= 0 || mensagens.length <= janela) return { enviadas: mensagens, cortadas: 0 }
  return { enviadas: mensagens.slice(-janela), cortadas: mensagens.length - janela }
}

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
