import { filtrarArvoreCenarios, filtrarCanvasesSoltos, filtrarPastaItens, filtrarPastaPersonagens } from './filtroCampanha'
import type { VaultTree, Vinculo } from './types'
import { idsDaCampanha } from './vinculos'

/**
 * Aplica à VaultTree INTEIRA o mesmo filtro de campanha que `Sidebar.tsx` aplica seção por
 * seção (campanhasVisiveis/raizPersonagens/raizCenarios/raizItens/canvasesVisiveis/mapasVisiveis).
 * A busca global precisa respeitar exatamente o que está visível na sidebar naquele instante —
 * "abrir um resultado faz o que clicar nele na sidebar faria" não vale pra algo que a sidebar
 * está escondendo. Reusa as mesmas funções puras de `filtroCampanha.ts`/`vinculos.ts`, não
 * reimplementa a regra de herança de pasta.
 *
 * `campanhaFiltro` inválido (campanha apagada, id vazio) devolve a árvore inteira — mesma
 * autocura que `Sidebar.tsx:83-84` já faz.
 */
export function arvoreFiltradaPorCampanha(
  tree: VaultTree,
  vinculos: Vinculo[],
  campanhaFiltro: string | null,
  caminhoPorId: Record<string, string>,
  caminhoItemPorId: Record<string, string>,
): VaultTree {
  const campanhaValida = campanhaFiltro && tree.campanhas.some((c) => c.id === campanhaFiltro) ? campanhaFiltro : null
  if (!campanhaValida) return tree

  const idsFiltro = idsDaCampanha(vinculos, campanhaValida)
  const caminhosPersonagens = new Set([...idsFiltro].map((id) => caminhoPorId[id]).filter((c): c is string => !!c))
  const caminhosItens = new Set([...idsFiltro].map((id) => caminhoItemPorId[id]).filter((c): c is string => !!c))

  return {
    campanhas: tree.campanhas.filter((c) => c.id === campanhaValida),
    canvasesSoltos: filtrarCanvasesSoltos(tree.canvasesSoltos, idsFiltro),
    mapasSoltos: filtrarCanvasesSoltos(tree.mapasSoltos, idsFiltro),
    personagensSoltos: filtrarPastaPersonagens(tree.personagensSoltos, caminhosPersonagens, idsFiltro),
    cenarios: filtrarArvoreCenarios(tree.cenarios, idsFiltro),
    itens: filtrarPastaItens(tree.itens, caminhosItens, idsFiltro),
  }
}
