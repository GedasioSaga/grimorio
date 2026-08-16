import { ELEMENTOS_PALETA, type ElementoPaleta, type PecaId } from './paletaMapa'

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
 * - porta, escada, muralha, torre e corredor ficam de fora: cada uma já é um shape
 *   próprio (ver `EscadaMapaShape.tsx`/`MuralhaMapaShape.tsx`/`TorreMapaShape.tsx`) sem
 *   regra de conversão específica, e caem no catch-all "precisa ser desenhada, não
 *   convertida" abaixo. A porta é o único caso com motivo próprio: é uma marca SOBRE a
 *   parede, com tamanho e posição próprios — converter um retângulo grande em porta
 *   daria uma barra gigante sem parede embaixo.
 */

export type PlanoConversao =
  | { tipo: 'estilo'; peca: PecaId; geo?: string; estilos: Record<string, string> }
  /** troca a forma velha por um shape próprio, preservando posição e tamanho */
  | { tipo: 'substituir'; peca: PecaId; novoTipo: 'simbolo-mapa' | 'sala-mapa'; props: Record<string, unknown> }
  | { tipo: 'impossivel'; motivo: string }

export function planoDeConversao(
  pecaAlvo: string,
  elementos: ElementoPaleta[] = ELEMENTOS_PALETA,
): PlanoConversao {
  const elemento = elementos.find((e) => e.id === pecaAlvo)
  if (!elemento) return { tipo: 'impossivel', motivo: 'peça desconhecida' }

  if (elemento.simbolo) {
    return {
      tipo: 'substituir',
      peca: elemento.id,
      novoTipo: 'simbolo-mapa',
      props: { simbolo: elemento.simbolo, rotulo: '' },
    }
  }

  // sala é o caso que mais importa converter: é o que o mapa antigo tem de sobra.
  // Vira `sala-mapa` no estado "pendente" — o usuário troca depois no painel.
  if (elemento.id === 'sala') {
    return { tipo: 'substituir', peca: 'sala', novoTipo: 'sala-mapa', props: { estado: 'pendente', rotulo: '', cor: '' } }
  }

  if (elemento.tipo === 'geo' || elemento.tipo === 'texto') {
    return { tipo: 'estilo', peca: elemento.id, geo: elemento.geo, estilos: elemento.estilos }
  }

  return { tipo: 'impossivel', motivo: `${elemento.rotulo} precisa ser desenhada, não convertida` }
}

/** Peças que o menu "Converter em ▸" deve oferecer — as que têm plano viável. */
export function pecasConversiveis(elementos: ElementoPaleta[] = ELEMENTOS_PALETA): ElementoPaleta[] {
  return elementos.filter((e) => planoDeConversao(e.id, elementos).tipo !== 'impossivel')
}
