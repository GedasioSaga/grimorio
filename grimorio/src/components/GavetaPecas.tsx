import { useState } from 'react'
import { ELEMENTOS_PALETA, type ElementoPaleta } from '../lib/paletaMapa'

/**
 * Grade flutuante com as peças do mapa, cada uma com NOME.
 *
 * São dez peças: numa fileira de ícones sem rótulo elas não se distinguem (o usuário
 * teria que passar o mouse em cada uma). A gaveta troca um clique a mais pela leitura
 * imediata.
 */
export function GavetaPecas({
  pecaAtivaId,
  aoEscolher,
}: {
  pecaAtivaId: string | undefined
  aoEscolher: (elemento: ElementoPaleta) => void
}) {
  const [aberta, setAberta] = useState(false)

  return (
    <div className="gaveta-pecas">
      {aberta && (
        <div className="gaveta-pecas-grade" role="menu">
          {ELEMENTOS_PALETA.map((elemento) => (
            <button
              key={elemento.id}
              type="button"
              role="menuitem"
              className={`gaveta-pecas-item${pecaAtivaId === elemento.id ? ' ativo' : ''}`}
              onClick={() => {
                aoEscolher(elemento)
                setAberta(false)
              }}
            >
              <span className="gaveta-pecas-glifo">{elemento.glifo}</span>
              <span className="gaveta-pecas-nome">{elemento.rotulo}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`btn-icon${aberta ? ' ativo' : ''}`}
        title="Peças do mapa"
        onClick={() => setAberta((a) => !a)}
      >
        Peças ▾
      </button>
    </div>
  )
}
