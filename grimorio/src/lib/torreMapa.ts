import { CONTORNO_SALA } from './salaMapa'
import { COR_CORREDOR } from './corredorMapa'

/**
 * Torre do mapa: o círculo que marca um canto da muralha — ver `lib/desenhoTorre.tsx`.
 *
 * Nas referências (torres redondas nos quatro cantos), a torre é sempre um círculo
 * sobreposto ao canto do contorno externo, nunca uma peça sozinha no meio do mapa. Por
 * isso ela nasce PEQUENA e o usuário arrasta até encaixar no canto da muralha — não há
 * como adivinhar os quatro cantos automaticamente, porque a muralha é uma peça
 * redimensionável e livre.
 *
 * Mesmo peso de contorno que a muralha (`ESPESSURA_CONTORNO_MURALHA`), para as duas
 * lerem como a MESMA estrutura; preenchimento no tom do corredor, para a torre ler como
 * espaço construído (passagem/vigia) e não como buraco vazio no meio da parede.
 */
export const TORRE_DIAMETRO_PADRAO = 90
export const TORRE_COR_CONTORNO = CONTORNO_SALA
export const TORRE_COR_FUNDO = COR_CORREDOR
export const ESPESSURA_CONTORNO_TORRE = 6
