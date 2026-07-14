export type Recolhido = 'nenhum' | 'notas' | 'mapa'

/** Clicar o botão de um lado: se já recolhido nele, expande (nenhum); senão recolhe nele. */
export function proximoRecolhido(atual: Recolhido, alvo: 'notas' | 'mapa'): Recolhido {
  return atual === alvo ? 'nenhum' : alvo
}

export function flexDosLados(recolhido: Recolhido, proporcao: number): { escrita: number; mapa: number } {
  const escrita = recolhido === 'notas' ? 0 : recolhido === 'mapa' ? 1 : proporcao
  const mapa = recolhido === 'mapa' ? 0 : recolhido === 'notas' ? 1 : 1 - proporcao
  return { escrita, mapa }
}
