import { FONTE_MAX, FONTE_MIN, FONTE_PASSO, proximaEscala } from '../lib/escalaFonte'

/**
 * Botões A− / A+ para ajustar a escala de fonte de um card no canvas.
 * `onPointerDown` parado: clicar nos botões não arrasta o shape.
 */
export function ControlesFonte({
  escala,
  onEscala,
}: {
  escala: number
  onEscala: (proxima: number) => void
}) {
  return (
    <span className="card-fonte-ctrl" onPointerDown={(e) => e.stopPropagation()}>
      <button
        title="Diminuir fonte"
        disabled={escala <= FONTE_MIN}
        onClick={() => onEscala(proximaEscala(escala, -FONTE_PASSO))}
      >
        A−
      </button>
      <button
        title="Aumentar fonte"
        disabled={escala >= FONTE_MAX}
        onClick={() => onEscala(proximaEscala(escala, FONTE_PASSO))}
      >
        A+
      </button>
    </span>
  )
}
