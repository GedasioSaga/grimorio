import { convertFileSrc } from '@tauri-apps/api/core'
import type { ImagemIA } from './gemini'
import { mimeDaImagem, uint8ParaBase64 } from './bin'

/**
 * Lê imagens do cofre (por caminho relativo à raiz) e devolve como base64 pro Gemini.
 * Usa o protocolo asset do Tauri (convertFileSrc) + fetch local — mesmo caminho de
 * ChatIA. Imagens quebradas/removidas são ignoradas, não derrubam a ação inteira.
 */
export async function carregarImagensIA(vaultPath: string, rels: string[]): Promise<ImagemIA[]> {
  const imagens: ImagemIA[] = []
  for (const rel of rels) {
    try {
      const resp = await fetch(convertFileSrc(`${vaultPath}/${rel}`))
      if (!resp.ok) continue
      const bytes = new Uint8Array(await (await resp.blob()).arrayBuffer())
      imagens.push({ mimeType: mimeDaImagem(rel), base64: uint8ParaBase64(bytes) })
    } catch {
      // imagem ausente ou ilegível: ignora e segue com as demais
    }
  }
  return imagens
}
