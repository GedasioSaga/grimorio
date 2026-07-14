import type { ImagemPersonagem } from './types'

/** Acrescenta uma imagem à lista. Dedupe por `rel` (no-op se já existir). */
export function adicionarImagem(lista: ImagemPersonagem[], rel: string): ImagemPersonagem[] {
  if (lista.some((i) => i.rel === rel)) return lista
  return [...lista, { rel }]
}

/** Remove a imagem de `rel` da lista. */
export function removerImagem(lista: ImagemPersonagem[], rel: string): ImagemPersonagem[] {
  return lista.filter((i) => i.rel !== rel)
}
