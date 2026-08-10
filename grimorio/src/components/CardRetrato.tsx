import { useEffect, useState, type ReactNode } from 'react'

/**
 * Retrato do card (imagem ou fallback). Compartilhado por cenário e personagem.
 * A cópia da imagem (Ctrl+C) é feita pelo CanvasView a partir do card selecionado,
 * não daqui — o tldraw captura o ponteiro e o clique na <img> não é confiável.
 */
export function CardRetrato({
  src,
  alt,
  fallback,
  className = 'char-card-retrato',
}: {
  src: string | null
  alt: string
  fallback: ReactNode
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
        <img src={src} alt={alt} draggable={false} onError={() => setErroImg(true)} />
      ) : (
        fallback
      )}
    </div>
  )
}
