import { CONTORNO_SALA } from './salaMapa'

/**
 * Muralha do mapa: o contorno externo que fecha o conjunto — ver `lib/desenhoMuralha.tsx`.
 *
 * Existe porque não havia NADA equivalente: o usuário desenha essa linha à mão hoje
 * (contorno cercando toda a planta) e a IA não tinha como pedir a mesma coisa. Por isso a
 * muralha é só o CONTORNO (sem preenchimento) — ela cerca salas/corredores já desenhados
 * sem cobri-los; se tivesse preenchimento sólido, esconderia tudo que está por dentro.
 *
 * Espessura maior que `ESPESSURA_CONTORNO_SALA` (2px) de propósito: nas referências, a
 * linha externa do prédio é visivelmente mais firme que as divisórias internas — é isso
 * que faz o conjunto ler como UM edifício com fronteira clara, e não como uma pilha de
 * salas soltas. A cor continua a MESMA do contorno de sala/divisória (`CONTORNO_SALA`):
 * só o peso muda, não a família de cor.
 */
export const MURALHA_LARGURA_PADRAO = 680
export const MURALHA_ALTURA_PADRAO = 520
export const MURALHA_COR_CONTORNO = CONTORNO_SALA
export const ESPESSURA_CONTORNO_MURALHA = 6
