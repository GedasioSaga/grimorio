import { CONTORNO_SALA } from './salaMapa'

/**
 * Miolo do desenho da divisória (`linha-mapa`, peça legada — ver o cabeçalho de
 * `LinhaMapaShape.tsx`). Mesmo padrão de `desenhoSala.tsx`.
 *
 * A faixa transparente larga do shape original é só para dar o que clicar; não é
 * aparência, então não entra aqui — a amostra desenha a peça, não a área de clique.
 */

/** Mesma espessura do contorno da sala — ver SalaMapaShape. */
const ESPESSURA = 1.2

export interface DesenharLinhaProps {
  dx: number
  dy: number
}

export function desenharLinha({ dx, dy }: DesenharLinhaProps) {
  return <line x1={0} y1={0} x2={dx} y2={dy} stroke={CONTORNO_SALA} strokeWidth={ESPESSURA} strokeLinecap="round" />
}
