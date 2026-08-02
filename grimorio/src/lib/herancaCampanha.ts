import type { PastaCenarioNode, PastaItemNode, PastaNode, VaultTree, Vinculo } from './types'
import { campanhasDe } from './vinculos'

/**
 * Mapa "dir relativo → id da pasta", para as duas árvores que têm pastas
 * organizacionais. Derivado da árvore já carregada no store: nenhum I/O novo.
 */
export function idsDePastas(tree: VaultTree | null): Record<string, string> {
  const mapa: Record<string, string> = {}
  if (!tree) return mapa
  const dePersonagens = (p: PastaNode) => {
    if (p.id) mapa[p.caminho] = p.id
    p.subpastas.forEach(dePersonagens)
  }
  const deCenarios = (p: PastaCenarioNode) => {
    if (p.id) mapa[p.caminho] = p.id
    p.subpastas.forEach(deCenarios)
  }
  const deItens = (p: PastaItemNode) => {
    if (p.id) mapa[p.caminho] = p.id
    p.subpastas.forEach(deItens)
  }
  dePersonagens(tree.personagensSoltos)
  deCenarios(tree.cenarios)
  deItens(tree.itens)
  return mapa
}

/**
 * Campanhas herdadas por um item criado em `dirPai`: sobe a cadeia de diretórios e
 * devolve as da PRIMEIRA pasta que tiver alguma. Não acumula níveis — a pasta mais
 * próxima vence, para que uma subpasta possa corrigir a campanha da pasta acima.
 */
export function campanhasHerdadas(
  dirPai: string,
  idPorDiretorio: Record<string, string>,
  vinculos: Vinculo[],
): string[] {
  let dir = dirPai
  while (dir) {
    const id = idPorDiretorio[dir]
    if (id) {
      const camps = campanhasDe(vinculos, id)
      if (camps.length > 0) return camps
    }
    const corte = dir.lastIndexOf('/')
    if (corte < 0) break
    dir = dir.slice(0, corte)
  }
  return []
}
