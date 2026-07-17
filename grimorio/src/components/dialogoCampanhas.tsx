import { create } from 'zustand'
import { useEffect, useState } from 'react'
import { useApp } from '../state/store'
import type { TipoEntidadeVinculo } from '../lib/types'
import { campanhasDe } from '../lib/vinculos'

// Diálogo in-app de multi-seleção de campanhas (checkboxes). Espelha dialogos.tsx: a
// lógica de resolução vive no store (testável sem DOM); o Host só renderiza.

export interface OpcaoCampanha {
  id: string
  nome: string
}

interface PedidoCampanhas {
  titulo: string
  opcoes: OpcaoCampanha[]
  marcadas: string[]
  resolver: (ids: string[] | null) => void
}

interface DialogoCampanhasState {
  pedido: PedidoCampanhas | null
  pedir(titulo: string, opcoes: OpcaoCampanha[], marcadas: string[]): Promise<string[] | null>
  responder(ids: string[] | null): void
}

export const useDialogoCampanhas = create<DialogoCampanhasState>((set, get) => ({
  pedido: null,
  pedir: (titulo, opcoes, marcadas) =>
    new Promise<string[] | null>((resolver) => {
      // se já houver um pedido pendente (não deveria: modal bloqueia), resolve como
      // cancelado antes de abrir o novo — evita promise pendurada
      const anterior = get().pedido
      if (anterior) anterior.resolver(null)
      set({ pedido: { titulo, opcoes, marcadas, resolver } })
    }),
  responder: (ids) => {
    const pedido = get().pedido
    if (!pedido) return
    set({ pedido: null })
    pedido.resolver(ids)
  },
}))

/** Pede um conjunto de campanhas via modal in-app. Resolve com os ids ([] = nenhuma) ou null se cancelar. */
export function pedirCampanhas(titulo: string, opcoes: OpcaoCampanha[], marcadas: string[]): Promise<string[] | null> {
  return useDialogoCampanhas.getState().pedir(titulo, opcoes, marcadas)
}

/** Opções (campanhas com id válido) a partir da árvore atual do store. */
function opcoesDoCofre(): OpcaoCampanha[] {
  return (useApp.getState().tree?.campanhas ?? [])
    .filter((c) => c.id)
    .map((c) => ({ id: c.id, nome: c.nome }))
}

/**
 * Associa uma entidade recém-criada a campanha(s): sob filtro ativo, etiqueta direto na
 * campanha filtrada (silencioso); em "Todas", abre o multi-seletor (0..N). Sem campanhas no
 * cofre não pergunta nada (nasce órfã).
 */
export async function associarNaCriacao(tipo: TipoEntidadeVinculo, id: string, nome: string): Promise<void> {
  const { campanhaFiltro, definirCampanhas } = useApp.getState()
  if (campanhaFiltro) {
    definirCampanhas(tipo, id, [campanhaFiltro])
    return
  }
  const opcoes = opcoesDoCofre()
  if (opcoes.length === 0) return
  const escolhidas = await pedirCampanhas(`Campanhas de "${nome}":`, opcoes, [])
  if (escolhidas) definirCampanhas(tipo, id, escolhidas)
}

/** Edita manualmente as campanhas de uma entidade já existente (botão 🏷️), pré-marcando as atuais. */
export async function editarCampanhas(tipo: TipoEntidadeVinculo, id: string, nome: string): Promise<void> {
  const opcoes = opcoesDoCofre()
  if (opcoes.length === 0) return
  const marcadas = campanhasDe(useApp.getState().vinculos, id)
  const escolhidas = await pedirCampanhas(`Campanhas de "${nome}":`, opcoes, marcadas)
  if (escolhidas) useApp.getState().definirCampanhas(tipo, id, escolhidas)
}

/** Montado uma vez perto da raiz. Renderiza o modal quando há um pedido aberto. */
export function HostDialogoCampanhas() {
  const pedido = useDialogoCampanhas((s) => s.pedido)
  const responder = useDialogoCampanhas((s) => s.responder)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (pedido) setMarcadas(new Set(pedido.marcadas))
  }, [pedido])

  if (!pedido) return null

  const alternar = (id: string) =>
    setMarcadas((atual) => {
      const nova = new Set(atual)
      if (nova.has(id)) nova.delete(id)
      else nova.add(id)
      return nova
    })

  return (
    <div className="modal-overlay" onClick={() => responder(null)}>
      <div className="dialogo-caixa" onClick={(e) => e.stopPropagation()}>
        <label className="dialogo-titulo">{pedido.titulo}</label>
        <div className="dialogo-lista">
          {pedido.opcoes.map((c) => (
            <label key={c.id} className="dialogo-lista-item">
              <input type="checkbox" checked={marcadas.has(c.id)} onChange={() => alternar(c.id)} />
              {c.nome}
            </label>
          ))}
        </div>
        <div className="dialogo-botoes">
          <button onClick={() => responder(null)}>Cancelar</button>
          <button className="dialogo-ok" onClick={() => responder([...marcadas])}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
