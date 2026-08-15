import { ESPESSURA_CONTORNO_SALA, aparenciaDaSala, quebrarRotulo } from './salaMapa'
import { centroDoPoligono, limitesDoPoligono, type PontoPoligono } from './salaPoligonoMapa'

/**
 * Miolo do desenho da sala em polígono, extraído de `SalaPoligonoMapaShape.tsx` para
 * função pura — mesmo padrão de `desenharCorpoSala`. Reaproveita `aparenciaDaSala` e
 * `quebrarRotulo` da sala retangular: cor de estado e quebra de texto são a MESMA regra
 * nos dois formatos, só a geometria (retângulo vs. polígono) muda.
 */

const FONTE_ROTULO = 12
const ENTRELINHA = 14

export interface DesenharCorpoSalaPoligonoProps {
  pontos: PontoPoligono[]
  estado: string
  rotulo: string
  cor: string
}

export function desenharCorpoSalaPoligono({ pontos, estado, rotulo, cor }: DesenharCorpoSalaPoligonoProps) {
  const aparencia = aparenciaDaSala(estado, cor || undefined)
  const { w } = limitesDoPoligono(pontos)
  const centro = centroDoPoligono(pontos)
  const linhas = quebrarRotulo(rotulo, w, FONTE_ROTULO)
  const alturaTexto = linhas.length * ENTRELINHA
  const primeiraLinhaY = centro.y - alturaTexto / 2 + ENTRELINHA / 2
  const pontosSvg = pontos.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <>
      <polygon
        points={pontosSvg}
        fill={aparencia.preenchimento}
        stroke={aparencia.contorno}
        strokeWidth={ESPESSURA_CONTORNO_SALA}
        strokeLinejoin="round"
      />
      {linhas.map((linha, i) => (
        <text
          key={i}
          x={centro.x}
          y={primeiraLinhaY + i * ENTRELINHA}
          fill={aparencia.texto}
          fontSize={FONTE_ROTULO}
          fontFamily="system-ui, sans-serif"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {linha}
        </text>
      ))}
    </>
  )
}
