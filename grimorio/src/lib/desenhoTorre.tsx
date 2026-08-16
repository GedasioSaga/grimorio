import { TORRE_COR_CONTORNO, TORRE_COR_FUNDO, ESPESSURA_CONTORNO_TORRE } from './torreMapa'

/**
 * Miolo do desenho da torre — um círculo inscrito na caixa do shape (mesmo mecanismo de
 * `BaseBoxShapeUtil` que a sala/corredor usam: o usuário redimensiona a caixa e o círculo
 * acompanha `w`/`h`). Preenchida (ao contrário da muralha): a torre é um cômodo redondo de
 * verdade, não só uma linha.
 */

export interface DesenharTorreProps {
  w: number
  h: number
}

export function desenharTorre({ w, h }: DesenharTorreProps) {
  const meia = ESPESSURA_CONTORNO_TORRE / 2
  return (
    <ellipse
      cx={w / 2}
      cy={h / 2}
      rx={Math.max(0, w / 2 - meia)}
      ry={Math.max(0, h / 2 - meia)}
      fill={TORRE_COR_FUNDO}
      stroke={TORRE_COR_CONTORNO}
      strokeWidth={ESPESSURA_CONTORNO_TORRE}
    />
  )
}
