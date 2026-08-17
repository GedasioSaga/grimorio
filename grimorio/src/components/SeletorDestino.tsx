import { useState } from 'react'
import type { OpcaoDestino } from '../lib/localizacaoEntidade'

/**
 * Lista de destinos com busca — usado pela Barra de Localização tanto para "Mover para
 * dentro de..." quanto para "Transformar em versão de...". Sem estado no zustand: quem abre
 * fecha (não precisa sobreviver a navegação nem a troca de cofre), então um `useState` local
 * já basta, no mesmo espírito de `EnquadrarRetrato`.
 */
export function SeletorDestino({ titulo, opcoes, aoEscolher, aoFechar }: {
  titulo: string
  opcoes: OpcaoDestino[]
  aoEscolher: (opcao: OpcaoDestino) => void
  aoFechar: () => void
}) {
  const [busca, setBusca] = useState('')
  const termo = busca.trim().toLowerCase()
  const filtradas = termo ? opcoes.filter((o) => o.rotulo.toLowerCase().includes(termo)) : opcoes

  return (
    <div className="modal-overlay" onClick={aoFechar}>
      <div
        className="dialogo-caixa localizacao-seletor"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); aoFechar() } }}
      >
        <label className="dialogo-titulo">{titulo}</label>
        <input
          className="dialogo-input"
          placeholder="Buscar…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          autoFocus
        />
        <div className="dialogo-lista localizacao-seletor-lista">
          {opcoes.length === 0 && <p className="galeria-vazia">Nenhum destino disponível.</p>}
          {opcoes.length > 0 && filtradas.length === 0 && <p className="galeria-vazia">Nada com “{busca.trim()}”.</p>}
          {filtradas.map((o) => (
            <button key={o.caminho} className="localizacao-seletor-item" onClick={() => aoEscolher(o)}>
              {o.rotulo}
            </button>
          ))}
        </div>
        <div className="dialogo-botoes">
          <button onClick={aoFechar}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
