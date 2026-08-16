import { COR_CORREDOR, CONTORNO_CORREDOR } from './corredorMapa'

/**
 * Escada do mapa: mesma família visual do corredor (ela é, na prática, um trecho de
 * corredor com degraus), mas com hachura própria — ver `lib/desenhoEscada.tsx`.
 *
 * Existe porque a versão anterior nascia como um GRUPO de retângulos `geo` nativos do
 * tldraw (`criarEscada` em `MapaToolbar.tsx`), e a revisão cega leu isso como "grelha de
 * ventilação": quadrados soltos, não uma faixa contínua de degraus. Virar peça de
 * verdade (shape próprio, redimensionável) resolve os dois problemas de uma vez — o
 * desenho fica sob controle nosso (hachura de verdade, não caixas separadas) e a peça
 * ocupa o comprimento real do corredor, como nas referências.
 */
export const ESCADA_LARGURA_PADRAO = 200
export const ESCADA_ALTURA_PADRAO = 56

/** Piso da escada: o MESMO tom do corredor — ela é um trecho dele, não uma peça à parte. */
export const ESCADA_COR_FUNDO = COR_CORREDOR
export const ESCADA_COR_CONTORNO = CONTORNO_CORREDOR

/** Cor dos traços de degrau — mais claro que o piso, para ler como hachura por cima dele
 * sem virar um bloco de contraste alto (a escada é piso, não parede). */
export const ESCADA_COR_DEGRAU = '#828a92'

/** Espaço entre um degrau e o próximo, e a margem antes do primeiro/depois do último. */
export const ESCADA_ESPACO_DEGRAU = 9
export const ESCADA_MARGEM_DEGRAU = 6
