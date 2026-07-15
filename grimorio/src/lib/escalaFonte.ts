/** Escala de fonte por card no canvas (multiplicador aplicado via CSS var --card-fe). */
export const FONTE_MIN = 0.8
export const FONTE_MAX = 2.0
export const FONTE_PASSO = 0.1

/** Próxima escala aplicando `delta`, arredondada a 1 casa e presa em [MIN, MAX]. */
export function proximaEscala(atual: number, delta: number): number {
  const bruto = Math.round((atual + delta) * 10) / 10
  return Math.min(FONTE_MAX, Math.max(FONTE_MIN, bruto))
}
