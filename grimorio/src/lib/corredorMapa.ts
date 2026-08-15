import { CONTORNO_SALA } from './salaMapa'

/**
 * Corredor do mapa: mesma família visual da sala (preenchimento + contorno igual à linha
 * de divisória — ver CONTORNO_SALA), mas sem rótulo e sem estado.
 *
 * Existe porque faltava peça para o espaço ENTRE salas. Sem ela, cada sala é uma ilha
 * cercada de preto — "não tem nada para representar... um caminho", nas palavras do
 * usuário — e o preto entre cômodos foi exatamente o que a revisão cega reprovou ("no
 * candidato o preto está por toda parte, inclusive dentro do prédio"). O corredor cobre
 * esse vão com o MESMO tom de parede/piso das salas, para a planta ler como massa
 * contínua em vez de caixas soltas.
 *
 * Tom fixo, igual ao da sala "sem-info" (`#3d3d3d`): o corredor não guarda estado de
 * limpeza (não é um cômodo a explorar), e um cinza neutro não briga com salas vermelhas
 * ou azuis nas duas pontas.
 */
export const COR_CORREDOR = '#3d3d3d'
export const CONTORNO_CORREDOR = CONTORNO_SALA
