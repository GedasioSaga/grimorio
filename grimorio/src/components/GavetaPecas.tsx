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

  /**
   * Uma seção da gaveta. Com 22 peças, jogar tudo numa grade só devolve o problema que a
   * gaveta veio resolver: o usuário varre a lista inteira procurando. Separar o que
   * CONSTRÓI o mapa (sala, parede, porta) do que é ACHADO nele (poção, chave) bate com a
   * forma como ele desenha — primeiro a planta, depois o que tem dentro.
   */
  function Secao({ titulo, pecas }: { titulo: string; pecas: ElementoPaleta[] }) {
    return (
      <div className="gaveta-pecas-secao">
        <span className="gaveta-pecas-titulo">{titulo}</span>
        <div className="gaveta-pecas-grade">
          {pecas.map((elemento) => (
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
      </div>
    )
  }

  return (
    <div className="gaveta-pecas">
      {aberta && (
        <div className="gaveta-pecas-painel" role="menu">
          <Secao titulo="Construção" pecas={ELEMENTOS_PALETA.filter((e) => !e.item)} />
          <Secao titulo="Itens" pecas={ELEMENTOS_PALETA.filter((e) => e.item)} />
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
