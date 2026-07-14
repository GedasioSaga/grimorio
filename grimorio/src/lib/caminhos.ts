/** Pasta do caderno de um mapa (sessão ou canvas): irmã do arquivo `.json`. */
export function dirNotasDoMapa(caminhoMapa: string): string {
  return caminhoMapa.replace(/\.json$/, '.notas')
}

/** Pasta do caderno livre de uma campanha. */
export function escritaDirDaCampanha(campanhaSlug: string): string {
  return `campanhas/${campanhaSlug}/escrita`
}

/** Caminho absoluto de uma imagem do cofre (o que se passa a convertFileSrc). */
export function caminhoAbsolutoImagem(vaultPath: string, rel: string): string {
  return `${vaultPath}/${rel}`
}
