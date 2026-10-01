import type { Movimento, Plano, PortasOrganizar, Reescrita, Remocao } from './tipos'
import { chaveDoCofre } from './ultima'

/**
 * Impressão do cofre que um plano descreve: o conteúdo de TODO arquivo que o plano vai tocar
 * (imagem que se muda, imagem que sai, texto que é reescrito), no momento em que foi planejado.
 *
 * Planejador e executor calculam com esta mesma função, então os dois nunca discordam da regra.
 * Se o usuário editou uma ficha ou trocou um retrato entre a prévia e o clique em "Organizar", a
 * impressão muda e o executor recusa — o plano revisado já não descreve o cofre.
 *
 * Um arquivo que o plano NÃO toca e que passe a citar uma imagem depois da prévia não entra nesta
 * conta. Quem cobre esse caso é o executor: antes de apagar cada original ele pergunta à checagem
 * de citação (`citacoes.ts`), e o original que alguém ainda cita fica no lugar, com aviso.
 */

/** SHA-256 hex minúsculo de bytes. Web Crypto: existe no WebView e no Node da suíte. */
export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 hex minúsculo de um texto (UTF-8). */
export function sha256Texto(texto: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(texto))
}

type PartesDoPlano = { movimentos: Movimento[]; remocoes: Remocao[]; reescritas: Reescrita[] }

/**
 * Linhas `tipo\trel\thash`, ordenadas. `hashDoTexto` recebe o `rel` de cada arquivo reescrito —
 * o planejador já leu esses arquivos e o executor lê de novo, pelo mesmo `portas.hash`.
 */
export async function calcularHashEntrada(
  raiz: string,
  partes: PartesDoPlano,
  portas: PortasOrganizar,
): Promise<string> {
  const abs = (rel: string) => `${raiz}/${rel}`
  const linhas: string[] = []
  for (const m of partes.movimentos) linhas.push(`m\t${m.de}\t${await portas.hash(abs(m.de))}`)
  for (const r of partes.remocoes) linhas.push(`r\t${r.rel}\t${await portas.hash(abs(r.rel))}`)
  for (const t of partes.reescritas) linhas.push(`t\t${t.arquivo}\t${await portas.hash(abs(t.arquivo))}`)
  return sha256Texto(linhas.sort().join('\n'))
}

/**
 * Id determinístico: mesmo cofre + mesmo plano = mesmo id (e a mesma pasta de diário). O cofre entra
 * na conta: duas cópias idênticas do cofre, em pastas diferentes, geram o mesmo plano, e sem isso
 * dividiriam o diário — desfazer uma desfaria a outra.
 */
export async function idDoPlano(plano: Omit<Plano, 'id'>, raiz: string): Promise<string> {
  const { versao, hashEntrada, movimentos, reescritas, remocoes } = plano
  const conteudo = { cofre: chaveDoCofre(raiz), versao, hashEntrada, movimentos, reescritas, remocoes }
  return (await sha256Texto(JSON.stringify(conteudo))).slice(0, 16)
}
