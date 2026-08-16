import { MURALHA_COR_CONTORNO, ESPESSURA_CONTORNO_MURALHA } from './muralhaMapa'

/**
 * Miolo do desenho da muralha — mesmo padrão de `desenharCorredor`. Só o CONTORNO é
 * desenhado (fill "none"): a muralha cerca o que já está desenhado por dentro dela sem
 * cobrir nada, ao contrário da sala/corredor, que são preenchidos.
 *
 * O retângulo do stroke fica encolhido por `ESPESSURA_CONTORNO_MURALHA / 2` de cada lado
 * porque o SVG centra o traço na borda do `<rect>` — sem o encolhimento, metade da linha
 * vazaria para fora da caixa que o usuário vê e arrasta no editor.
 */

export interface DesenharMuralhaProps {
  w: number
  h: number
}

export function desenharMuralha({ w, h }: DesenharMuralhaProps) {
  const meia = ESPESSURA_CONTORNO_MURALHA / 2
  return (
    <rect
      x={meia}
      y={meia}
      width={Math.max(0, w - ESPESSURA_CONTORNO_MURALHA)}
      height={Math.max(0, h - ESPESSURA_CONTORNO_MURALHA)}
      fill="none"
      stroke={MURALHA_COR_CONTORNO}
      strokeWidth={ESPESSURA_CONTORNO_MURALHA}
    />
  )
}
