import { create } from 'zustand'
import { useEffect, useState } from 'react'
import { useApp } from '../state/store'
import { ROTULO_TIPO, pastasDaSecao, type TipoTransformacao } from '../lib/transformarImagem'

// Espelha dialogos.tsx/dialogoCampanhas.tsx: a resolução vive no store (testável sem
// DOM); o Host só renderiza. Dois passos no mesmo modal: tipo → pasta destino.

export interface EscolhaTransformar {
  tipo: TipoTransformacao
  /** Pasta existente escolhida; com novaPasta, é o PAI onde ela será criada. */
  dir: string
  /** Nome de subpasta a criar dentro de dir antes de criar a entidade. */
  novaPasta?: string
}

interface PedidoTransformar {
  resolver: (r: EscolhaTransformar | null) => void
}

interface DialogoTransformarState {
  pedido: PedidoTransformar | null
  pedir(): Promise<EscolhaTransformar | null>
  responder(r: EscolhaTransformar | null): void
}

export const useDialogoTransformar = create<DialogoTransformarState>((set, get) => ({
  pedido: null,
  pedir: () =>
    new Promise<EscolhaTransformar | null>((resolver) => {
      // pedido pendente (não deveria: modal bloqueia) resolve como cancelado antes
      // de abrir o novo — evita promise pendurada
      const anterior = get().pedido
      if (anterior) anterior.resolver(null)
      set({ pedido: { resolver } })
    }),
  responder: (r) => {
    const pedido = get().pedido
    if (!pedido) return
    set({ pedido: null })
    pedido.resolver(r)
  },
}))

/** Pergunta tipo e pasta destino da transformação. Resolve null se cancelar. */
export function pedirTransformacao(): Promise<EscolhaTransformar | null> {
  return useDialogoTransformar.getState().pedir()
}

const TIPOS: TipoTransformacao[] = ['personagem', 'cenario', 'item']

/** Montado uma vez perto da raiz. Renderiza o modal quando há um pedido aberto. */
export function HostDialogoTransformar() {
  const pedido = useDialogoTransformar((s) => s.pedido)
  const responder = useDialogoTransformar((s) => s.responder)
  const tree = useApp((s) => s.tree)
  const [tipo, setTipo] = useState<TipoTransformacao | null>(null)
  const [dir, setDir] = useState<string | null>(null)
  const [criandoPasta, setCriandoPasta] = useState(false)
  const [novaPasta, setNovaPasta] = useState('')

  useEffect(() => {
    if (pedido) {
      setTipo(null)
      setDir(null)
      setCriandoPasta(false)
      setNovaPasta('')
    }
  }, [pedido])

  useEffect(() => {
    if (!pedido) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') responder(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pedido, responder])

  if (!pedido) return null

  const pastas = tipo ? pastasDaSecao(tree, tipo) : []
  const dirAtual = dir ?? pastas[0]?.caminho ?? null

  return (
    <div className="modal-overlay" onClick={() => responder(null)}>
      <div className="dialogo-caixa" onClick={(e) => e.stopPropagation()}>
        {!tipo ? (
          <>
            <label className="dialogo-titulo">Transformar imagem em:</label>
            <div className="dialogo-botoes">
              {TIPOS.map((t) => (
                <button key={t} className="dialogo-ok" onClick={() => setTipo(t)}>
                  {ROTULO_TIPO[t]}
                </button>
              ))}
            </div>
            <div className="dialogo-botoes">
              <button onClick={() => responder(null)}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <label className="dialogo-titulo">{`Onde criar o ${ROTULO_TIPO[tipo].toLowerCase()}?`}</label>
            <div className="dialogo-lista">
              {pastas.map((p) => (
                <label
                  key={p.caminho}
                  className="dialogo-lista-item"
                  style={{ paddingLeft: 8 + p.nivel * 16 }}
                >
                  <input
                    type="radio"
                    name="pasta-transformar"
                    checked={dirAtual === p.caminho}
                    onChange={() => setDir(p.caminho)}
                  />
                  {p.nivel === 0 ? `${p.nome} (raiz)` : p.nome}
                </label>
              ))}
            </div>
            {!criandoPasta ? (
              <button className="dialogo-nova-pasta" onClick={() => setCriandoPasta(true)}>
                📁+ Nova pasta…
              </button>
            ) : (
              <input
                className="dialogo-input"
                autoFocus
                placeholder={`Nome da nova pasta em "${pastas.find((p) => p.caminho === dirAtual)?.nome ?? ''}"`}
                value={novaPasta}
                onChange={(e) => setNovaPasta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    setCriandoPasta(false)
                    setNovaPasta('')
                  } else if (e.key === 'Enter' && dirAtual) {
                    responder({ tipo, dir: dirAtual, novaPasta: novaPasta.trim() || undefined })
                  }
                }}
              />
            )}
            <div className="dialogo-botoes">
              <button onClick={() => setTipo(null)}>Voltar</button>
              <button onClick={() => responder(null)}>Cancelar</button>
              <button
                className="dialogo-ok"
                disabled={!dirAtual}
                onClick={() =>
                  dirAtual && responder({ tipo, dir: dirAtual, novaPasta: novaPasta.trim() || undefined })
                }
              >
                Criar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
