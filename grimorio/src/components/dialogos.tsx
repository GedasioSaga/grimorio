import { create } from 'zustand'
import { useEffect, useRef, useState } from 'react'

// Diálogo de texto in-app. Substitui window.prompt, que o WebView2 (Windows) parou
// de honrar — passou a devolver null sem abrir caixa, matando todo criar/renomear.
// A lógica de resolução vive no store (testável sem DOM); o Host só renderiza.

interface PedidoAberto {
  titulo: string
  valorInicial: string
  confirmar: string
  resolver: (valor: string | null) => void
}

interface DialogoState {
  pedido: PedidoAberto | null
  pedir(titulo: string, valorInicial: string, confirmar: string): Promise<string | null>
  responder(valor: string | null): void
}

export const useDialogo = create<DialogoState>((set, get) => ({
  pedido: null,
  pedir: (titulo, valorInicial, confirmar) =>
    new Promise<string | null>((resolver) => {
      // se já houver um pedido pendente (não deveria: modal bloqueia), resolve como
      // cancelado antes de abrir o novo — evita promise pendurada
      const anterior = get().pedido
      if (anterior) anterior.resolver(null)
      set({ pedido: { titulo, valorInicial, confirmar, resolver } })
    }),
  responder: (valor) => {
    const pedido = get().pedido
    if (!pedido) return
    const limpo = typeof valor === 'string' ? valor.trim() : null
    set({ pedido: null })
    // vazio/whitespace vira null: mantém a semântica do antigo `if (!nome) return`
    pedido.resolver(limpo ? limpo : null)
  },
}))

/** Pede um texto ao usuário via modal in-app. Resolve com o texto (trim) ou null se cancelar/vazio. */
export function pedirTexto(titulo: string, valorInicial = '', confirmar = 'OK'): Promise<string | null> {
  return useDialogo.getState().pedir(titulo, valorInicial, confirmar)
}

/** Montado uma vez perto da raiz. Renderiza o modal quando há um pedido aberto. */
export function HostDialogos() {
  const pedido = useDialogo((s) => s.pedido)
  const responder = useDialogo((s) => s.responder)
  const [valor, setValor] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!pedido) return
    setValor(pedido.valorInicial)
    // autofoco + seleção (útil no renomear, que vem preenchido)
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [pedido])

  if (!pedido) return null

  return (
    <div className="modal-overlay" onClick={() => responder(null)}>
      <div className="dialogo-caixa" onClick={(e) => e.stopPropagation()}>
        <label className="dialogo-titulo">{pedido.titulo}</label>
        <input
          ref={inputRef}
          className="dialogo-input"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); responder(valor) }
            else if (e.key === 'Escape') { e.preventDefault(); responder(null) }
          }}
        />
        <div className="dialogo-botoes">
          <button onClick={() => responder(null)}>Cancelar</button>
          <button className="dialogo-ok" onClick={() => responder(valor)}>{pedido.confirmar}</button>
        </div>
      </div>
    </div>
  )
}
