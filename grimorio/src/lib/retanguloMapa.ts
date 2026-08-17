import { QUADRADO_PX } from './quadrados'
import { COR_LINHA_PADRAO } from './coresLinha'

/**
 * Retângulo do mapa (`retangulo-mapa`): a caixa genérica de desenho, com canto reto ou
 * arredondado à escolha — ver `cantosMapa.ts`.
 *
 * Por que uma peça PRÓPRIA e não o `geo` nativo do tldraw: `geo` cobre 12 geometrias
 * diferentes (estrela, nuvem, losango…) num único shape, e o raio de canto simplesmente
 * não existe nas props dele — dar canto arredondado ali exigiria reescrever o `component()`
 * de todas as 12. Aqui é um `<rect rx>` de uma linha. De quebra a peça ganha cor livre em
 * hex (a paleta do tldraw é fechada em 13 nomes — mesmo impedimento já documentado em
 * `coresLinha.ts`), espessura de traço em px e preenchimento liga/desliga, que é o que um
 * mapa de mesa precisa e o `geo` só oferece em degraus fixos de estilo.
 *
 * Nasce SEM preenchimento: uma caixa sólida por cima da planta esconderia as salas que já
 * estão desenhadas — mesmo raciocínio da muralha, que também é só contorno.
 */
export const RETANGULO_LARGURA_PADRAO = QUADRADO_PX * 6
export const RETANGULO_ALTURA_PADRAO = QUADRADO_PX * 4
export const RETANGULO_COR_PADRAO = COR_LINHA_PADRAO
export const RETANGULO_ESPESSURA_PADRAO = 2

/** Opacidade do preenchimento quando ligado: deixa ver a planta por baixo em vez de tampá-la. */
export const RETANGULO_PREENCHIMENTO_OPACIDADE = 0.25
