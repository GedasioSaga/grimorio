import { ESPESSURA_CONTORNO_SALA, aparenciaDaSala, layoutDoRotulo, type EstiloRotulo } from './salaMapa'
import { centroDoPoligono, limitesDoPoligono, pontosSeguros, type PontoPoligono } from './salaPoligonoMapa'
import type { VinculoSala } from './vinculoSalaCenario'

/**
 * Miolo do desenho da sala em polígono, extraído de `SalaPoligonoMapaShape.tsx` para
 * função pura — mesmo padrão de `desenharCorpoSala`. Reaproveita `aparenciaDaSala` e
 * `quebrarRotulo` da sala retangular: cor de estado e quebra de texto são a MESMA regra
 * nos dois formatos, só a geometria (retângulo vs. polígono) muda.
 *
 * O badge de vínculo com o Cenário também é o mesmo dos dois lados, pelo mesmo motivo:
 * o mestre não deve ter que aprender duas linguagens visuais porque escolheu um cômodo
 * em L em vez de um quadrado.
 */

/** Tamanho do badge de vínculo — mesmos números de `desenhoSala.tsx`. */
const BADGE_RAIO = 8
const BADGE_MARGEM = 4

export interface DesenharCorpoSalaPoligonoProps {
  pontos: PontoPoligono[]
  estado: string
  rotulo: string
  cor: string
  /** espessura do contorno em px; ausente cai no padrão de sempre (mapa antigo) */
  espessura?: number
  /** vínculo já RESOLVIDO pelo chamador — resolver depende do store, e isto aqui é puro */
  vinculo?: VinculoSala
  /** tamanho, posição e orientação do nome do cômodo — ver `layoutDoRotulo` */
  estiloRotulo?: EstiloRotulo
  /** desenha a linha de contorno? ausente conta como SIM — ver `desenhoSala.tsx` */
  contorno?: boolean
}

export function desenharCorpoSalaPoligono({
  pontos: pontosCrus,
  estado,
  rotulo,
  cor,
  espessura,
  vinculo,
  estiloRotulo,
  contorno = true,
}: DesenharCorpoSalaPoligonoProps) {
  const aparencia = aparenciaDaSala(estado, cor || undefined)
  // `> 0` e não `??`: traço 0 é uma sala sem contorno, indistinguível de "sumiu" no escuro.
  const tracoPx = espessura && espessura > 0 ? espessura : ESPESSURA_CONTORNO_SALA
  // Polígono degenerado cai na forma de nascença em vez de sumir da tela — MESMA função
  // que o `getGeometry` e as alças do shape usam, para os três não discordarem sobre
  // quantos vértices a peça tem. O porquê inteiro está em `pontosSeguros`.
  const pontos = pontosSeguros(pontosCrus)
  const { w, h, minX, minY, maxX } = limitesDoPoligono(pontos)
  // `minX`/`minY` e não 0: arrastar um vértice para fora faz a caixa do polígono começar
  // em coordenada local negativa. O CENTROIDE vai junto porque no cômodo em L o meio da
  // caixa cai no recorte, fora da peça — centralizar por ele poria o nome no vazio.
  const centro = centroDoPoligono(pontos)
  const texto = layoutDoRotulo({ x0: minX, y0: minY, w, h, centro }, rotulo, estiloRotulo ?? {})
  const pontosSvg = pontos.map((p) => `${p.x},${p.y}`).join(' ')

  const badgeCx = maxX - BADGE_MARGEM - BADGE_RAIO
  const badgeCy = minY + BADGE_MARGEM + BADGE_RAIO
  const badgeCabe = w > (BADGE_RAIO + BADGE_MARGEM) * 2 && h > (BADGE_RAIO + BADGE_MARGEM) * 2
  const mostrarBadge =
    (vinculo?.estado === 'vinculado' || vinculo?.estado === 'quebrado') && badgeCabe

  return (
    <>
      <polygon
        points={pontosSvg}
        fill={aparencia.preenchimento}
        stroke={contorno ? aparencia.contorno : 'none'}
        strokeWidth={contorno ? tracoPx : 0}
        strokeLinejoin="round"
      />
      <g transform={texto.transform || undefined}>
        {texto.linhas.map((linha, i) => (
          <text
            key={i}
            x={texto.x}
            y={texto.y + i * texto.entrelinha}
            fill={aparencia.texto}
            fontSize={texto.fonte}
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {linha}
          </text>
        ))}
      </g>
      {/* `carregando` fica de fora pelo mesmo motivo da sala retangular: acusaria estrago
          que não houve enquanto o cache de cenários não chegou. */}
      {mostrarBadge && (
        <g>
          <title>
            {vinculo!.estado === 'vinculado'
              ? `Abre "${vinculo!.nomeCenario}" (duplo clique)`
              : 'Vínculo quebrado: o cenário foi excluído'}
          </title>
          <circle
            cx={badgeCx}
            cy={badgeCy}
            r={BADGE_RAIO}
            fill={vinculo!.estado === 'vinculado' ? '#2f6f4f' : '#8a3b2f'}
            stroke={aparencia.contorno}
            strokeWidth={1}
          />
          <text
            x={badgeCx}
            y={badgeCy}
            fontSize={BADGE_RAIO * 1.3}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#ffffff"
          >
            {vinculo!.estado === 'vinculado' ? '🔗' : '⚠'}
          </text>
        </g>
      )}
    </>
  )
}
