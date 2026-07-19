import { useState } from 'react'
import { TEMAS, aplicarTema, temaSalvo, type TemaId } from '../lib/tema'

/** Três swatches na barra lateral: cada um prévia o fundo + a cor de destaque do tema. */
export function SeletorTema() {
  const [tema, setTema] = useState<TemaId>(temaSalvo)

  function trocar(id: TemaId) {
    aplicarTema(id)
    setTema(id)
  }

  return (
    <span className="seletor-tema">
      {TEMAS.map((t) => (
        <button
          key={t.id}
          className={`tema-swatch${tema === t.id ? ' ativo' : ''}`}
          title={`Tema: ${t.nome}`}
          aria-label={`Tema ${t.nome}`}
          style={{ background: t.fundo }}
          onClick={() => trocar(t.id)}
        >
          <span className="tema-ponto" style={{ background: t.destaque }} />
        </button>
      ))}
    </span>
  )
}
