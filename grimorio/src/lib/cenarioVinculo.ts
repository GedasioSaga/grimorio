/** Helpers puros do vínculo cenário↔personagem (lista de ids em Cenario.personagens). */

/** Adiciona um personagem (dedupe). Retorna a MESMA lista se nada mudou. */
export function vincularPersonagem(lista: string[], id: string): string[] {
  return lista.includes(id) ? lista : [...lista, id]
}

export function desvincularPersonagem(lista: string[], id: string): string[] {
  return lista.filter((x) => x !== id)
}

/** Filtra ids cujo personagem ainda existe no cache (órfãos somem da exibição, sem reescrever disco). */
export function personagensVivos(lista: string[], cache: Record<string, unknown>): string[] {
  return lista.filter((id) => id in cache)
}
