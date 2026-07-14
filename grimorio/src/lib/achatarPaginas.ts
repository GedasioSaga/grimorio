import type { PaginaNode } from './types'

export interface PaginaPlana {
  slug: string
  titulo: string
  erro?: boolean
}

/** Achata a árvore de páginas em lista plana, em pré-ordem (pai antes dos filhos). */
export function achatarPaginas(nodes: PaginaNode[]): PaginaPlana[] {
  const out: PaginaPlana[] = []
  for (const n of nodes) {
    out.push({ slug: n.slug, titulo: n.titulo, erro: n.erro })
    if (n.filhos.length > 0) out.push(...achatarPaginas(n.filhos))
  }
  return out
}
