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
  /** cor de preenchimento escolhida à mão; vazio = a cor padrão da peça */
  cor?: string
  /** desenha a linha de contorno? ausente conta como SIM */
  contorno?: boolean
}

export function desenharCorredor({ w, h, cor, contorno = true }: DesenharCorredorProps) {
  return (
    <rect
      x={0}
      y={0}
      width={w}
      height={h}
      fill={cor || COR_CORREDOR}
      stroke={contorno ? CONTORNO_CORREDOR : 'none'}
      strokeWidth={contorno ? ESPESSURA_CONTORNO_SALA : 0}
    />
  )
}
