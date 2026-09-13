/**
 * Nome de um sub-cenário como ele aparece na árvore lateral — e só lá.
 *
 * A convenção do cofre embute a cadeia do pai no nome ("Reino de Goa: Castelo: Cozinha").
 * Isso serve bem à busca e ao breadcrumb, e mal a uma coluna estreita: quinze irmãos
 * começam com o mesmo texto e a parte que os distingue é justamente a que a largura corta.
 *
 * O corte exige que o trecho antes dos dois-pontos bata EXATAMENTE com o nome do pai
 * real. "Sala 3: a cozinha" debaixo de "Torre" fica inteiro — ali os dois-pontos são do
 * autor, não da convenção. Nada disto toca o nome no disco nem nos outros lugares
 * que exibem o cenário.
 */
const SEPARADOR = ':'

export function nomeCenarioExibido(nome: string, nomePai: string | null | undefined): string {
  if (!nomePai) return nome
  const prefixo = `${nomePai}${SEPARADOR}`
  if (!nome.startsWith(prefixo)) return nome
  const proprio = nome.slice(prefixo.length).trim()
  // "Reino de Goa:" sem nada depois: uma linha em branco na árvore seria pior que a repetição
  return proprio.length === 0 ? nome : proprio
}
