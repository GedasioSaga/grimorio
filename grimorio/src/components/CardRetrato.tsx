import { useEffect, useState, type ReactNode } from 'react'
import { posicaoCss } from '../lib/focoRetrato'
import type { FocoRetrato } from '../lib/types'

/**
 * Retrato do card (imagem ou fallback). Compartilhado por cenário e personagem.
 * A cópia da imagem (Ctrl+C) é feita pelo CanvasView a partir do card selecionado,
 * não daqui — o tldraw captura o ponteiro e o clique na <img> não é confiável.
 */
export function CardRetrato({
  src,
  alt,
  fallback,
  foco,
  className = 'char-card-retrato',
}: {
  src: string | null
  alt: string
  fallback: ReactNode
  /**
   * Enquadramento escolhido na janela "Enquadrar retrato".
   *
   * A moldura do card é `object-fit: cover`: a imagem é escalada até cobrir o quadro e a
   * sobra é cortada num eixo. Sem `object-position` o corte é sempre pelo centro — que é
   * justamente o que o usuário rejeitou ao enquadrar. Os modais de ficha já aplicavam o
   * foco; o card do canvas ficou de fora, e a mesma foto aparecia enquadrada na ficha e
   * cortada no rosto no canvas.
   */
  foco?: FocoRetrato
  /** troca o wrapper para reusar a lógica de erro fora do card (ex.: miniatura do rail) */
  className?: string
}) {
  const [erroImg, setErroImg] = useState(false)
  useEffect(() => {
    setErroImg(false)
  }, [src])

  const mostrarImg = src && !erroImg
  return (
    <div className={className}>
      {mostrarImg ? (
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{ objectPosition: posicaoCss(foco) }}
          onError={() => setErroImg(true)}
        />
      ) : (
        fallback
      )}
    </div>
  )
}
