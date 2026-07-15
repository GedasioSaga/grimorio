/**
 * Rastreia qual imagem de card está "armada" para copiar (Ctrl+C). Estado de
 * módulo (sobrevive a remount de shapes que o tldraw desmonta fora da viewport).
 */
let srcArmado: string | null = null
const ouvintes = new Set<() => void>()

export function armarImagem(src: string | null): void {
  if (srcArmado === src) return
  srcArmado = src
  ouvintes.forEach((f) => f())
}

export function imagemArmadaSrc(): string | null {
  return srcArmado
}

export function assinarImagemArmada(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}
