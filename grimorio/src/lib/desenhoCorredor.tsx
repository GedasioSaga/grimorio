import { arestasDeCaixa, contornoComVaos } from './ancoraPorta'
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
  /**
   * Vãos abertos pelas portas ancoradas, por índice de aresta. Ver `contornoComVaos`.
   *
   * Sem isto a peça desenha a parede por cima da porta e a planta afirma passagem fechada.
   */
  vaos?: Map<number, Array<{ inicio: number; fim: number }>>

}

export function desenharCorredor({ w, h, cor, contorno = true, vaos }: DesenharCorredorProps) {
  return (
    <>
      {/* piso inteiro, contorno em traços: um `<rect>` com stroke não pula o pedaço onde há
          porta, e era por isso que o corredor desenhava parede por cima da passagem. */}
      <rect x={0} y={0} width={w} height={h} fill={cor || COR_CORREDOR} stroke="none" />
      {contorno &&
        contornoComVaos(arestasDeCaixa(w, h).map((a) => a.a), vaos).map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={CONTORNO_CORREDOR}
            strokeWidth={ESPESSURA_CONTORNO_SALA}
            strokeLinecap="butt"
          />
        ))}
    </>
  )
}
