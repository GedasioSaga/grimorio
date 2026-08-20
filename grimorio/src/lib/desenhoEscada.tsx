import { ESPESSURA_CONTORNO_SALA } from './salaMapa'
import {
  ESCADA_COR_FUNDO,
  ESCADA_COR_CONTORNO,
  ESCADA_COR_DEGRAU,
  ESCADA_ESPACO_DEGRAU,
  ESCADA_MARGEM_DEGRAU,
} from './escadaMapa'

/**
 * Miolo do desenho da escada, extraído para função pura — mesmo padrão de
 * `desenharCorredor`/`desenharCorpoSala`. Usada pelo `component()` do shape e pela
 * página de amostra, para as duas nunca desenharem a peça de dois jeitos.
 *
 * A hachura corre ao longo do eixo MAIOR da caixa (largura ou altura, o que for maior),
 * com traços perpendiculares espaçados igualmente — é o que faz a peça ler como uma
 * FAIXA contínua de degraus (como nas referências), e não como uma grade de quadrados
 * soltos (a queixa da revisão sobre a versão anterior, um grupo de retângulos nativos).
 * A quantidade de traços se recalcula a partir do comprimento real da caixa: a escada
 * nasce com um tamanho padrão, mas o usuário redimensiona para o trecho real do corredor,
 * e a hachura acompanha em vez de ficar fixa em 5 degraus.
 */

export interface DesenharEscadaProps {
  w: number
  h: number
  /** cor de preenchimento escolhida à mão; vazio = a cor padrão da peça */
  cor?: string
  /** desenha a linha de contorno? ausente conta como SIM */
  contorno?: boolean
  /**
   * Direção dos degraus. Ausente = decide pelo lado maior da caixa.
   *
   * O automático resolve 95% dos casos e falha exatamente no que não é raro: escada QUADRADA,
   * em que `w >= h` vira cara-ou-coroa e um pixel de redimensionamento inverte a hachura
   * inteira na frente do usuário. Escada em patamar e escada de torre são quadradas com
   * frequência, e nelas a direção é uma decisão de leitura — para onde se sobe —, não uma
   * consequência da proporção.
   */
  degrausHorizontais?: boolean
}

export function desenharEscada({ w, h, cor, contorno = true, degrausHorizontais }: DesenharEscadaProps) {
  const horizontal = degrausHorizontais ?? w >= h
  const comprimento = horizontal ? w : h
  const qtdDegraus = Math.max(1, Math.floor((comprimento - ESCADA_MARGEM_DEGRAU * 2) / ESCADA_ESPACO_DEGRAU) + 1)

  const degraus = Array.from({ length: qtdDegraus }, (_, i) => {
    const pos = ESCADA_MARGEM_DEGRAU + i * ESCADA_ESPACO_DEGRAU
    return horizontal ? (
      <line key={i} x1={pos} y1={3} x2={pos} y2={h - 3} stroke={ESCADA_COR_DEGRAU} strokeWidth={1.5} />
    ) : (
      <line key={i} x1={3} y1={pos} x2={w - 3} y2={pos} stroke={ESCADA_COR_DEGRAU} strokeWidth={1.5} />
    )
  })

  return (
    <>
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        fill={cor || ESCADA_COR_FUNDO}
        stroke={contorno ? ESCADA_COR_CONTORNO : 'none'}
        strokeWidth={contorno ? ESPESSURA_CONTORNO_SALA : 0}
      />
      {degraus}
    </>
  )
}
