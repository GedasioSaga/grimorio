import type { FsBridge } from './fsBridge'

export type ClassePasta = 'cofre' | 'vazia' | 'estranha'

/** Presença de qualquer um destes = cofre do Grimório já inicializado. */
const MARCADORES = ['campanhas', 'canvases-soltos', 'vinculos.json']

/**
 * Classifica a pasta escolhida pelo usuário. Existe porque `VaultRepo.inicializar()`
 * cria a estrutura do cofre em QUALQUER diretório sem avisar — escolher a pasta errada
 * plantaria um cofre vazio dentro dela em silêncio.
 */
export async function classificarPasta(caminho: string, fs: FsBridge): Promise<ClassePasta> {
  const norm = caminho.replace(/\\/g, '/')
  let entradas: { name: string; isDir: boolean }[]
  try {
    entradas = await fs.listDir(norm)
  } catch {
    return 'vazia' // não existe ainda: será criada, é um cofre novo
  }
  const nomes = new Set(entradas.map((e) => e.name))
  if (MARCADORES.some((m) => nomes.has(m))) return 'cofre'
  return entradas.length === 0 ? 'vazia' : 'estranha'
}
