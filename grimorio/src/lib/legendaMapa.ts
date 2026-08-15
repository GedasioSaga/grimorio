import { ELEMENTOS_PALETA, type ElementoPaleta, type PecaId } from './paletaMapa'
import type { SimboloId } from './simbolosMapa'

/**
 * Legenda do mapa: o quadro que diz o que cada símbolo significa.
 *
 * Aqui mora só a DECISÃO do que a legenda lista; quem desenha o bloco no canvas é a
 * toolbar. Separado assim, a regra é testável sem editor.
 */

export interface EntradaLegenda {
  peca: PecaId
  rotulo: string
  /** símbolo desenhado, quando a peça é um `simbolo-mapa` */
  simbolo?: SimboloId
}

/**
 * Peças que nunca entram na legenda, mesmo estando no mapa: um rótulo de cômodo é texto
 * que se explica sozinho — listar "Rótulo: rótulo" é ruído.
 */
const FORA_DA_LEGENDA: PecaId[] = ['rotulo']

/**
 * O que a legenda deve listar, dadas as peças presentes no mapa.
 *
 * Segue a ORDEM DA PALETA, não a ordem em que o usuário desenhou: legenda estável entre
 * mapas é mais fácil de ler do que legenda que muda de ordem a cada desenho. Peça
 * repetida entra uma vez; peça desconhecida (metadado de versão futura, ou arquivo
 * editado à mão) é ignorada em silêncio, porque legenda não é lugar de reportar erro.
 */
export function entradasDaLegenda(
  pecasPresentes: readonly string[],
  elementos: ElementoPaleta[] = ELEMENTOS_PALETA,
): EntradaLegenda[] {
  const presentes = new Set(pecasPresentes)
  return elementos
    .filter((e) => presentes.has(e.id) && !FORA_DA_LEGENDA.includes(e.id))
    .map((e) => ({ peca: e.id, rotulo: e.rotulo, ...(e.simbolo ? { simbolo: e.simbolo } : {}) }))
}
