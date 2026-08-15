import { ELEMENTOS_PALETA, type ElementoPaleta, type PecaId } from './paletaMapa'
import type { SimboloId } from './simbolosMapa'

/**
 * "Converter seleção em ▸ peça": transforma o que já está desenhado numa peça de verdade.
 *
 * Serve para dois casos: o mapa antigo, desenhado antes da paleta existir, e o conserto
 * de uma peça que saiu errada. Quem classifica é o usuário — nada de adivinhar pelo
 * formato, decisão tomada no desenho da fatia 4 justamente porque adivinhação erra em
 * silêncio no meio do mapa.
 *
 * Como a conversão acontece depende da natureza da peça alvo, e é isso que esta lib
 * decide (sem tocar no editor):
 *
 * - peça de ESTILO (sala, parede): a forma continua a mesma, muda a pintura e ganha a
 *   identidade. Preserva tudo — posição, tamanho, rotação, texto interno.
 * - peça DESENHADA (janela, armadilha, mesa…): não há como "pintar" um retângulo até
 *   virar um losango com "!". A forma velha é trocada por um `simbolo-mapa` ocupando o
 *   mesmo espaço.
 * - porta: fica de fora. Ela se recolore a partir da sala sob ela e nasce de um fluxo
 *   próprio; converter um retângulo qualquer em porta produziria uma porta órfã, sem a
 *   parede que dá sentido ao vão.
 */

export type PlanoConversao =
  | { tipo: 'estilo'; peca: PecaId; geo?: string; estilos: Record<string, string> }
  | { tipo: 'substituir'; peca: PecaId; simbolo: SimboloId }
  | { tipo: 'impossivel'; motivo: string }

export function planoDeConversao(
  pecaAlvo: string,
  elementos: ElementoPaleta[] = ELEMENTOS_PALETA,
): PlanoConversao {
  const elemento = elementos.find((e) => e.id === pecaAlvo)
  if (!elemento) return { tipo: 'impossivel', motivo: 'peça desconhecida' }

  if (elemento.simbolo) return { tipo: 'substituir', peca: elemento.id, simbolo: elemento.simbolo }

  if (elemento.tipo === 'geo' || elemento.tipo === 'texto') {
    return { tipo: 'estilo', peca: elemento.id, geo: elemento.geo, estilos: elemento.estilos }
  }

  return { tipo: 'impossivel', motivo: `${elemento.rotulo} precisa ser desenhada, não convertida` }
}

/** Peças que o menu "Converter em ▸" deve oferecer — as que têm plano viável. */
export function pecasConversiveis(elementos: ElementoPaleta[] = ELEMENTOS_PALETA): ElementoPaleta[] {
  return elementos.filter((e) => planoDeConversao(e.id, elementos).tipo !== 'impossivel')
}
