/**
 * Quais tipos de shape do tldraw contam como "uma sala" para o resto do app.
 *
 * Existe porque a sala ganhou um SEGUNDO formato (`sala-poligono-mapa`, ver
 * `SalaPoligonoMapaShape.tsx`) e o código que decide o que uma sala pode fazer estava
 * espalhado em cinco lugares, cada um com o literal `'sala-mapa'` escrito à mão: o painel
 * de propriedades, os handlers que aplicam no editor, o conta-gotas de cor, o drop de
 * cenário e a faxina de vínculo do cofre. O resultado foi que a sala em polígono nasceu
 * com `estado`, `rotulo` e `cor` nas props e NENHUMA superfície capaz de escrever nelas —
 * props órfãs, peça inerte, exatamente a queixa "não dá para fazer nenhuma alteração".
 *
 * Comparar contra este conjunto em vez de contra um literal faz o próximo formato de sala
 * (um círculo, uma caverna) entrar por um lugar só. Um literal solto em cinco arquivos não
 * dá erro de compilação quando alguém esquece o quinto — só dá bug silencioso.
 */
export const TIPOS_SALA = ['sala-mapa', 'sala-poligono-mapa'] as const

export type TipoSala = (typeof TIPOS_SALA)[number]

/** A peça selecionada é uma sala (retangular ou em polígono)? */
export function ehTipoSala(tipoShape: string | undefined): tipoShape is TipoSala {
  return TIPOS_SALA.includes(tipoShape as TipoSala)
}
