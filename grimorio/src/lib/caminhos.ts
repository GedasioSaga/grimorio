/** Pasta do caderno de uma sessão: irmã do arquivo do mapa. */
export function dirNotasDaSessao(caminhoSessao: string): string {
  return caminhoSessao.replace(/\.json$/, '.notas')
}

/** Pasta do caderno livre de uma campanha. */
export function escritaDirDaCampanha(campanhaSlug: string): string {
  return `campanhas/${campanhaSlug}/escrita`
}

/** Caminho absoluto de uma imagem do cofre (o que se passa a convertFileSrc). */
export function caminhoAbsolutoImagem(vaultPath: string, rel: string): string {
  return `${vaultPath}/${rel}`
}
