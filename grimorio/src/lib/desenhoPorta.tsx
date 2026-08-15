import { aparenciaDaPorta } from './portaMapa'

/**
 * Miolo do desenho da porta, extraído de `PortaShape.tsx` — mesmo padrão de
 * `desenhoSala.tsx`. Usada pelo `component()` do shape e pela página de amostra.
 */
export interface DesenharPortaProps {
  w: number
  h: number
  estado: string
}

export function desenharPorta({ w, h, estado }: DesenharPortaProps) {
  const { cor } = aparenciaDaPorta(estado)
  // sem rx: nas referências a porta é um traço reto, não uma pílula arredondada — canto
  // vivo é o que faz a barra ler como um TRECHO de parede, não como uma peça solta em cima.
  return <rect x={0} y={0} width={w} height={h} fill={cor} />
}
