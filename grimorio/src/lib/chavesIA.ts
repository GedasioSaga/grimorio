/**
 * Chaves do Gemini guardadas por máquina (localStorage), pedidas ao usuário na
 * primeira vez. NÃO vêm mais do .env: o Vite embutia GEMINI_API_KEYS no bundle
 * em build time, então um .exe distribuído carregaria a chave em texto puro.
 *
 * A lib não conhece a UI: `garantirChaves` recebe o pedidor injetado (a UI passa
 * `pedirTexto`), preservando a camada lib→(sem components/state) e o teste sem DOM.
 */

const CHAVE_STORAGE = 'grimorio.geminiKeys'

/** "k1, k2,k3" → ['k1','k2','k3'] (vazios fora). */
export function parsearChaves(raw: string | null | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

/** Chaves guardadas nesta máquina ([] se nenhuma). */
export function lerChaves(): string[] {
  return parsearChaves(localStorage.getItem(CHAVE_STORAGE))
}

/** Persiste as chaves; texto vazio/só espaços apaga o que havia. */
export function salvarChaves(raw: string): void {
  const chaves = parsearChaves(raw)
  if (chaves.length === 0) localStorage.removeItem(CHAVE_STORAGE)
  else localStorage.setItem(CHAVE_STORAGE, chaves.join(','))
}

/**
 * Chaves prontas para uso. Se já houver guardadas, devolve direto; senão pede uma
 * vez (via `pedir`, tipicamente `pedirTexto`), guarda e devolve. Cancelar → [].
 */
export async function garantirChaves(
  pedir: (titulo: string) => Promise<string | null>,
): Promise<string[]> {
  const salvas = lerChaves()
  if (salvas.length > 0) return salvas

  const digitado = await pedir('Cole sua chave da API do Gemini (várias separadas por vírgula):')
  if (!digitado) return []
  salvarChaves(digitado)
  return lerChaves()
}
