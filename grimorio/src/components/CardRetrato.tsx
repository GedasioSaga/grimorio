import { useEffect, useState, type ReactNode } from 'react'
import { armarImagem, imagemArmadaSrc, assinarImagemArmada } from '../lib/imagemArmada'

/**
 * Retrato do card (imagem ou fallback). Clicar na imagem a "arma" para Ctrl+C.
 * Compartilhado por cenário e personagem.
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

  // reflete se ESTA imagem é a armada (para o anel de seleção)
  const [armado, setArmado] = useState(false)
  useEffect(() => {
    const atualizar = () => setArmado(!!src && imagemArmadaSrc() === src)
    atualizar()
    return assinarImagemArmada(atualizar)
  }, [src])

  const mostrarImg = src && !erroImg
  return (
    <div className={`char-card-retrato${armado ? ' char-card-retrato--armado' : ''}`}>
      {mostrarImg ? (
        <img
          src={src}
          alt={alt}
          draggable={false}
          onError={() => setErroImg(true)}
          onClick={(e) => {
            e.stopPropagation()
            armarImagem(src)
          }}
        />
      ) : (
        fallback
      )}
    </div>
  )
}
