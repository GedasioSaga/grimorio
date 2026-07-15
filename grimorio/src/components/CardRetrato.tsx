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
}: {
  src: string | null
  alt: string
  fallback: ReactNode
}) {
  const [erroImg, setErroImg] = useState(false)
  useEffect(() => {
    setErroImg(false)
  }, [src])

  const mostrarImg = src && !erroImg
  return (
    <div className="char-card-retrato">
      {mostrarImg ? (
        <img src={src} alt={alt} draggable={false} onError={() => setErroImg(true)} />
      ) : (
        fallback
      )}
    </div>
  )
}
