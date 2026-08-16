import type { VinculoSala } from './vinculoSalaCenario'
import { ESPESSURA_CONTORNO_SALA, MARGEM_TOPO_ROTULO, aparenciaDaSala, quebrarRotulo } from './salaMapa'

/**
 * Miolo do desenho da sala, extraído de `SalaMapaShape.tsx` para função pura: sem
 * `SVGContainer`, sem hook do tldraw/zustand. O vínculo com o Cenário já vem RESOLVIDO
 * (`VinculoSala`) porque resolver o vínculo depende do store — isso não é geometria, é
 * contexto de app, então fica de fora desta função.
 *
 * Usada pelo `component()` do shape (que resolve o vínculo e repassa aqui) e pela página
 * de amostra (`.amostra/mapa.html`), para as duas nunca desenharem a sala de dois jeitos.
 */

/** Corpo do nome do cômodo, em px de página. */
const FONTE_ROTULO = 12
const ENTRELINHA = 14

/** Tamanho do badge de vínculo, no canto superior-direito da sala. */
const BADGE_RAIO = 8
const BADGE_MARGEM = 4

export interface DesenharCorpoSalaProps {
  w: number
  h: number
  estado: string
  rotulo: string
  cor: string
  vinculo: VinculoSala
}

export function desenharCorpoSala({ w, h, estado, rotulo, cor, vinculo }: DesenharCorpoSalaProps) {
  const aparencia = aparenciaDaSala(estado, cor || undefined)
  const linhas = quebrarRotulo(rotulo, w, FONTE_ROTULO)
  // rótulo ancorado no TOPO, não centralizado — ver MARGEM_TOPO_ROTULO em salaMapa.ts
  // (o porquê: deixar o miolo da sala livre para o ícone da peça largada dentro dela).
  const primeiraLinhaY = MARGEM_TOPO_ROTULO + ENTRELINHA / 2

  const badgeCx = w - BADGE_MARGEM - BADGE_RAIO
  const badgeCy = BADGE_MARGEM + BADGE_RAIO
  const badgeCabe = w > (BADGE_RAIO + BADGE_MARGEM) * 2 && h > (BADGE_RAIO + BADGE_MARGEM) * 2

  return (
    <>
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        fill={aparencia.preenchimento}
        stroke={aparencia.contorno}
        strokeWidth={ESPESSURA_CONTORNO_SALA}
      />
      {linhas.map((linha, i) => (
        <text
          key={i}
          x={w / 2}
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
      {/* `carregando` fica de fora: a sala tem vínculo, mas o cache de cenários ainda não
          chegou. Desenhar o ⚠ aqui acusaria estrago que não houve, e o aviso vira ruído. Assim
          que `carregarCenarios` termina, o zustand re-renderiza e o 🔗 aparece sozinho. */}
      {(vinculo.estado === 'vinculado' || vinculo.estado === 'quebrado') && badgeCabe && (
        <g>
          <title>
            {vinculo.estado === 'vinculado'
              ? `Abre "${vinculo.nomeCenario}" (duplo clique)`
              : 'Vínculo quebrado: o cenário foi excluído'}
          </title>
          <circle
            cx={badgeCx}
            cy={badgeCy}
            r={BADGE_RAIO}
            fill={vinculo.estado === 'vinculado' ? '#2f6f4f' : '#8a3b2f'}
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
            {vinculo.estado === 'vinculado' ? '🔗' : '⚠'}
          </text>
        </g>
      )}
    </>
  )
}
