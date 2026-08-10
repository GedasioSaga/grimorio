import { convertFileSrc } from '@tauri-apps/api/core'

/**
 * URL do retrato para o WebView, a partir do caminho relativo ao cofre.
 *
 * `chaveCache` vira `?v=`: o WebView cacheia por URL, e trocar a imagem mantendo o
 * mesmo nome de arquivo não mudaria a URL sozinha — a imagem velha ficaria na tela.
 * Item usa `modificadoEm`; personagem e cenário precisam somar a versão ativa,
 * porque cada versão tem retrato próprio e o arquivo do topo não muda ao alternar.
 */
export function urlRetrato(
  vaultPath: string | null,
  rel: string | null | undefined,
  chaveCache: string,
): string | null {
  if (!vaultPath || !rel) return null
  return `${convertFileSrc(`${vaultPath}/${rel}`)}?v=${encodeURIComponent(chaveCache)}`
}
