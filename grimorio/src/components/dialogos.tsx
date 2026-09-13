import { create } from 'zustand'
import { useEffect, useRef, useState } from 'react'

// Diálogo de texto in-app. Substitui window.prompt, que o WebView2 (Windows) parou
// de honrar — passou a devolver null sem abrir caixa, matando todo criar/renomear.
// A lógica de resolução vive no store (testável sem DOM); o Host só renderiza.

interface PedidoAberto {
  titulo: string
  valorInicial: string
  confirmar: string
  /** texto oferecido como chip clicável abaixo do campo (ex.: prefixo do cenário pai) */
  sugestao?: string
  /**
   * 'selecionar': o valor inicial é um nome inteiro a trocar (renomear) — a primeira tecla
   * substitui tudo. 'fim': o valor inicial é um prefixo a completar — a primeira tecla
   * continua dele.
   */
  cursor: 'selecionar' | 'fim'
  resolver: (valor: string | null) => void
}

interface DialogoState {
  pedido: PedidoAberto | null
  pedir(titulo: string, valorInicial: string, confirmar: string, sugestao?: string, cursor?: PedidoAberto['cursor']): Promise<string | null>
  responder(valor: string | null): void
}

export const useDialogo = create<DialogoState>((set, get) => ({
  pedido: null,
  pedir: (titulo, valorInicial, confirmar, sugestao, cursor = 'selecionar') =>
    new Promise<string | null>((resolver) => {
      // se já houver um pedido pendente (não deveria: modal bloqueia), resolve como
      // cancelado antes de abrir o novo — evita promise pendurada
      const anterior = get().pedido
      if (anterior) anterior.resolver(null)
      set({ pedido: { titulo, valorInicial, confirmar, sugestao, cursor, resolver } })
    }),
  responder: (valor) => {
    const pedido = get().pedido
    if (!pedido) return
    set({ pedido: null })
    pedido.resolver(textoConfirmado(pedido, valor))
  },
}))

/**
 * O que o pedido devolve quando confirmado. Vazio/whitespace vira null (semântica do antigo
 * `if (!nome) return`). Com cursor 'fim' o prefixo intocado é o "vazio" deste pedido: quem
 * confirma "Reino de Goa: " sem completar não quis um cenário chamado assim, com os
 * dois-pontos pendurados — e nada mais adiante saberia barrar, porque a string é truthy.
 */
function textoConfirmado(pedido: PedidoAberto, valor: string | null): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  if (!limpo) return null
  if (pedido.cursor === 'fim' && limpo === pedido.valorInicial.trim()) return null
  return limpo
}

/**
 * Pede um texto ao usuário via modal in-app. Resolve com o texto (trim) ou null se cancelar/vazio.
 * `sugestao` vira um chip clicável que preenche o campo — usado pelo prefixo do sub-cenário.
 */
export function pedirTexto(
  titulo: string, valorInicial = '', confirmar = 'OK', sugestao?: string,
): Promise<string | null> {
  return useDialogo.getState().pedir(titulo, valorInicial, confirmar, sugestao)
}

/**
 * Como pedirTexto, mas o campo abre com `prefixo` já digitado e o cursor no fim dele —
 * para quando a primeira parte do nome já está decidida (ex.: "Pai: " de um subcenário)
 * e o usuário só completa. Sem chip: o prefixo não é sugestão, é ponto de partida.
 */
export function pedirTextoComPrefixo(titulo: string, prefixo: string, confirmar = 'OK'): Promise<string | null> {
  return useDialogo.getState().pedir(titulo, prefixo, confirmar, undefined, 'fim')
}

// Diálogo de escolha entre opções (ex.: "Canvas ou Mapa?"). Mesmo padrão de pedirTexto
// acima: resolução vive num store à parte (testável sem DOM), Host só renderiza, mesmo
// overlay/estilos do dialogo-caixa.

export interface OpcaoEscolha {
  valor: string
  rotulo: string
}

interface PedidoEscolha {
  titulo: string
  opcoes: OpcaoEscolha[]
  resolver: (valor: string | null) => void
}

interface EscolhaState {
  pedido: PedidoEscolha | null
  pedir(titulo: string, opcoes: OpcaoEscolha[]): Promise<string | null>
  responder(valor: string | null): void
}

export const useEscolha = create<EscolhaState>((set, get) => ({
  pedido: null,
  pedir: (titulo, opcoes) =>
    new Promise<string | null>((resolver) => {
      // pedido pendente (não deveria: modal bloqueia) resolve como cancelado antes
      // de abrir o novo — evita promise pendurada
      const anterior = get().pedido
      if (anterior) anterior.resolver(null)
      set({ pedido: { titulo, opcoes, resolver } })
    }),
  responder: (valor) => {
    const pedido = get().pedido
    if (!pedido) return
    set({ pedido: null })
    pedido.resolver(valor)
  },
}))

/** Pede uma escolha entre opções via modal in-app. Resolve com o `valor` escolhido ou null se cancelar. */
export function pedirEscolha(titulo: string, opcoes: OpcaoEscolha[]): Promise<string | null> {
  return useEscolha.getState().pedir(titulo, opcoes)
}

/** Montado uma vez perto da raiz. Renderiza o modal de escolha quando há um pedido aberto. */
export function HostEscolha() {
  const pedido = useEscolha((s) => s.pedido)
  const responder = useEscolha((s) => s.responder)
  const primeiroBotaoRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!pedido) return
    // autofoco na primeira opção — mesmo motivo do HostDialogos: dá pra confirmar
    // com o teclado sem tocar no mouse
    const id = requestAnimationFrame(() => primeiroBotaoRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [pedido])

  if (!pedido) return null

  return (
    <div className="modal-overlay" onClick={() => responder(null)}>
      <div
        className="dialogo-caixa"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // stopPropagation: sem ele o Escape sobe até a window, onde o HostOpcoes
          // escuta, e um único toque cancelaria este diálogo E fecharia as Opções
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); responder(pedido.opcoes[0]?.valor ?? null) }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); responder(null) }
        }}
      >
        <label className="dialogo-titulo">{pedido.titulo}</label>
        <div className="dialogo-botoes">
          {pedido.opcoes.map((o, i) => (
            <button
              key={o.valor}
              ref={i === 0 ? primeiroBotaoRef : undefined}
              className="dialogo-ok"
              onClick={() => responder(o.valor)}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
        <div className="dialogo-botoes">
          <button onClick={() => responder(null)}>Cancelar</button>
        </div>
      </div>
    </div>
  )
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
    // rAF: o input é controlado — antes do re-render o value ainda é o antigo, e
    // select()/setSelectionRange atuariam sobre ele
    const id = requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      // select() com prefixo faria a primeira tecla apagar o "Pai: " que acabou de entrar
      if (pedido.cursor === 'fim') input.setSelectionRange(pedido.valorInicial.length, pedido.valorInicial.length)
      else input.select()
    })
    return () => cancelAnimationFrame(id)
  }, [pedido])

  function aplicarSugestao(sugestao: string) {
    setValor(sugestao)
    const input = inputRef.current
    if (!input) return
    input.focus()
    // cursor no fim, não select(): selecionado, a primeira tecla apagaria o prefixo.
    // rAF porque o input é controlado — antes do re-render o value ainda é o antigo.
    requestAnimationFrame(() => input.setSelectionRange(sugestao.length, sugestao.length))
  }

  if (!pedido) return null

  // some assim que o campo é tocado: já cumpriu o papel, e atrapalharia quem quer nome solto
  const mostrarSugestao = !!pedido.sugestao && valor === pedido.valorInicial

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
            // stopPropagation: sem ele o Escape sobe até a window, onde o HostOpcoes
            // escuta, e um único toque cancelaria este diálogo E fecharia as Opções
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); responder(valor) }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); responder(null) }
          }}
        />
        {mostrarSugestao && (
          <button
            type="button"
            className="dialogo-sugestao"
            title="Usar este começo de nome"
            onClick={() => aplicarSugestao(pedido.sugestao!)}
          >
            💡 {pedido.sugestao}…
          </button>
        )}
        <div className="dialogo-botoes">
          <button onClick={() => responder(null)}>Cancelar</button>
          <button className="dialogo-ok" onClick={() => responder(valor)}>{pedido.confirmar}</button>
        </div>
      </div>
    </div>
  )
}
