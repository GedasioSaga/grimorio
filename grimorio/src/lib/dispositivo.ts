/**
 * Quem é ESTA máquina, para o sync. Guardado no `localStorage`, que é por instalação do app —
 * a mesma granularidade que a pergunta tem.
 *
 * Serve a uma coisa só: assinar a cópia de conflito ("Gandalf (conflito — PC Casa 26-07 14h32)").
 * O manifesto conhece o nome deste computador e de nenhum outro, então sem esta assinatura
 * metade dos conflitos não diria de onde veio a edição descartada — e é justamente essa metade
 * que o usuário precisa reconhecer para escolher qual cópia fica.
 *
 * Fora de `lib/sync/` de propósito, pela mesma razão de `painelSync.ts`: o motor é injetado e
 * testável sem navegador, e `localStorage` não é.
 */

const CHAVE_ID = 'grimorio.dispositivoId'
const CHAVE_NOME = 'grimorio.dispositivoNome'

/** Nome de partida. O pareamento oferece trocá-lo, porque dois PCs "Este computador" não assinam nada. */
export const NOME_PADRAO_DO_DISPOSITIVO = 'Este computador'

/**
 * Cache de sessão. Existe para o caso em que o `localStorage` recusa a gravação (cota, modo
 * restrito): sem ele, cada chamada geraria um id novo e duas cópias de conflito da mesma sessão
 * viriam assinadas por "computadores" diferentes.
 */
let idEmMemoria: string | null = null

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

/** Gravação de conveniência: perder o valor degrada a assinatura da cópia, nunca o sync. */
function gravar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    // sem persistência o nome volta ao padrão na próxima abertura; não há nada melhor a fazer
  }
}

/** UUID desta instalação. Nasce na primeira chamada e nunca muda. */
export function idDoDispositivo(): string {
  if (idEmMemoria !== null) return idEmMemoria
  const guardado = ler(CHAVE_ID)
  idEmMemoria = guardado ?? crypto.randomUUID()
  if (guardado === null) gravar(CHAVE_ID, idEmMemoria)
  return idEmMemoria
}

/** Como o usuário chama este computador. */
export function nomeDoDispositivo(): string {
  const guardado = ler(CHAVE_NOME)?.trim()
  return guardado ? guardado : NOME_PADRAO_DO_DISPOSITIVO
}

export function definirNomeDoDispositivo(nome: string): void {
  const limpo = nome.trim()
  if (!limpo) return
  gravar(CHAVE_NOME, limpo)
}
