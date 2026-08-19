import { ehTipoSala } from './tiposSala'

/**
 * Quais peças de construção aceitam COR escolhida à mão e CONTORNO ligado/desligado.
 *
 * Corredor, torre e escada nasceram sem propriedade nenhuma: eram a mesma cor fixa em todo
 * mapa, e o mestre não tinha como distinguir a ala leste da oeste nem tirar o traço duplo que
 * aparece quando o corredor encosta na sala. A muralha entra só na cor — ela É contorno
 * (`fill="none"`), então desligar apagaria a peça em vez de simplificá-la.
 *
 * Um lugar só, pelo mesmo motivo de `tiposSala.ts`: o literal espalhado pelo painel e pelos
 * handlers foi como a sala em polígono ficou inerte por três levas.
 */
const COM_COR = new Set(['corredor-mapa', 'torre-mapa', 'escada-mapa', 'muralha-mapa'])
const COM_CONTORNO = new Set(['corredor-mapa', 'torre-mapa', 'escada-mapa'])

/** Aceita `props.cor`? Inclui as duas salas, que já aceitavam. */
export function aceitaCor(tipoShape: string | undefined): boolean {
  return ehTipoSala(tipoShape) || COM_COR.has(tipoShape ?? '')
}

/** Aceita `props.contorno`? A muralha fica de fora: ela é só contorno. */
export function aceitaContorno(tipoShape: string | undefined): boolean {
  return ehTipoSala(tipoShape) || COM_CONTORNO.has(tipoShape ?? '')
}
