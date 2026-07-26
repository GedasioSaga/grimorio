/**
 * Registro dos cofres já abertos nesta máquina (localStorage). O caminho NORMALIZADO
 * (\ → /) é a identidade do cofre: serve de chave do registro e de prefixo das
 * configurações por-cofre, então 'C:\x' e 'C:/x' nunca viram dois cofres diferentes.
 */

const CHAVE_REGISTRO = 'grimorio.cofres'
const CHAVE_VAULT = 'grimorio.vault'
/** Prefixo da chave por cofre do filtro de campanha. Exportado para o store não duplicar o literal. */
export const CHAVE_FILTRO = 'grimorio.campanhaFiltro'

export interface CofreRegistrado {
  caminho: string
  nome: string
  ultimoAcesso: number
}

/** Identidade do cofre: sempre com '/', igual ao que o store guarda em vaultPath. */
export function normalizarCaminho(caminho: string): string {
  return caminho.replace(/\\/g, '/')
}

/** Rótulo inicial = último segmento do caminho ('C:/x/RPG' → 'RPG'). */
export function nomePadrao(caminho: string): string {
  const partes = normalizarCaminho(caminho).split('/').filter(Boolean)
  return partes[partes.length - 1] ?? caminho
}

/** Chave de configuração por cofre (ex.: 'grimorio.campanhaFiltro.C:/x/RPG'). */
export function chaveDeCofre(prefixo: string, caminho: string): string {
  return `${prefixo}.${normalizarCaminho(caminho)}`
}

function ehCofreRegistrado(c: any): c is CofreRegistrado {
  return !!c && typeof c.caminho === 'string' && typeof c.nome === 'string' && typeof c.ultimoAcesso === 'number'
}

/** Cofres registrados, mais recente primeiro. JSON inválido ou entrada torta → descartado. */
export function listar(): CofreRegistrado[] {
  try {
    const raw = localStorage.getItem(CHAVE_REGISTRO)
    if (!raw) return []
    const lista: unknown = JSON.parse(raw)
    if (!Array.isArray(lista)) return []
    return lista.filter(ehCofreRegistrado).sort((a, b) => b.ultimoAcesso - a.ultimoAcesso)
  } catch {
    return []
  }
}

function gravar(lista: CofreRegistrado[]): CofreRegistrado[] {
  localStorage.setItem(CHAVE_REGISTRO, JSON.stringify(lista))
  return lista
}

/** Insere ou atualiza o acesso, preservando um rótulo já renomeado. `agora` injetável para teste. */
export function registrar(caminho: string, agora = Date.now()): CofreRegistrado[] {
  const norm = normalizarCaminho(caminho)
  const atual = listar()
  const anterior = atual.find((c) => normalizarCaminho(c.caminho) === norm)
  const resto = atual.filter((c) => normalizarCaminho(c.caminho) !== norm)
  return gravar([{ caminho: norm, nome: anterior?.nome ?? nomePadrao(norm), ultimoAcesso: agora }, ...resto])
}

export function renomear(caminho: string, nome: string): CofreRegistrado[] {
  const norm = normalizarCaminho(caminho)
  return gravar(listar().map((c) => (normalizarCaminho(c.caminho) === norm ? { ...c, nome } : c)))
}

/** Tira do registro. NUNCA toca no disco. */
export function remover(caminho: string): CofreRegistrado[] {
  const norm = normalizarCaminho(caminho)
  return gravar(listar().filter((c) => normalizarCaminho(c.caminho) !== norm))
}

/** Semeia o registro a partir da chave antiga de cofre único. Idempotente. */
export function migrarDoLegado(): void {
  if (localStorage.getItem(CHAVE_REGISTRO)) return
  const antigo = localStorage.getItem(CHAVE_VAULT)
  if (antigo) registrar(antigo)
}

/**
 * Move o filtro de campanha da chave global (compartilhada entre cofres, e portanto
 * capaz de aplicar um id de campanha que não existe no outro cofre) para a chave
 * por-cofre. Idempotente.
 */
export function migrarFiltroLegado(): void {
  const antigo = localStorage.getItem(CHAVE_FILTRO)
  if (!antigo) return
  const vault = localStorage.getItem(CHAVE_VAULT)
  if (vault) localStorage.setItem(chaveDeCofre(CHAVE_FILTRO, vault), antigo)
  localStorage.removeItem(CHAVE_FILTRO)
}
