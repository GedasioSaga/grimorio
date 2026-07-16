/** Instruções de IA para as ações tab-aware dos modais (a entidade + contexto entram à parte). */

/** Gera o conteúdo de uma seção, curto (1-2 frases) ou longo (3-4 parágrafos). */
export function promptVersao(rotuloAba: string, tamanho: 'curta' | 'longa'): string {
  const formato =
    tamanho === 'curta'
      ? 'versão CURTA: 1-2 frases, direta e evocativa'
      : 'versão LONGA: 3-4 parágrafos, rica em detalhes'
  return (
    `Escreva o conteúdo da seção "${rotuloAba}" desta entidade — ${formato}. ` +
    `Coerente com os dados da entidade e o contexto da campanha. ` +
    `Responda só com o texto da seção, sem título nem preâmbulo.`
  )
}

/** Melhora o texto atual de uma seção, mantendo sentido e fatos. */
export function promptMelhorar(rotuloAba: string): string {
  return (
    `Melhore o texto atual da seção "${rotuloAba}": corrija, enriqueça e clarifique, ` +
    `mantendo o sentido e os fatos (não invente contradições). ` +
    `Responda só com o texto revisado, sem título nem preâmbulo.`
  )
}
