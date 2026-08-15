import { ESPESSURA_CONTORNO_SALA } from './salaMapa'
import { COR_CORREDOR, CONTORNO_CORREDOR } from './corredorMapa'

/**
 * Miolo do desenho do corredor, extraído de `CorredorMapaShape.tsx` para função pura —
 * mesmo padrão de `desenharCorpoSala`/`desenharPorta`: usada pelo `component()` do shape
 * e pela página de amostra, para as duas nunca desenharem a peça de dois jeitos.
 */

export interface DesenharCorredorProps {
  w: number
  h: number
}

export function desenharCorredor({ w, h }: DesenharCorredorProps) {
  return (
    <rect
      x={0}
      y={0}
      width={w}
      height={h}
      fill={COR_CORREDOR}
      stroke={CONTORNO_CORREDOR}
      strokeWidth={ESPESSURA_CONTORNO_SALA}
    />
  )
}
