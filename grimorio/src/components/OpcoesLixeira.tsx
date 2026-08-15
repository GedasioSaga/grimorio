import { useEffect, useState } from 'react'
import { ask, message } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import type { EntradaLixeira, TipoLixeira } from '../lib/lixeira'

const ICONE: Record<TipoLixeira, string> = {
  personagem: '👤', cenario: '🗺', item: '💎', canvas: '▦', mapa: '🗺', pasta: '📁', pagina: '📄', campanha: '🏷️',
}

const ROTULO: Record<TipoLixeira, string> = {
  personagem: 'Personagem', cenario: 'Cenário', item: 'Item', canvas: 'Canvas',
  mapa: 'Mapa', pasta: 'Pasta', pagina: 'Página', campanha: 'Campanha',
}

function formatarData(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function comAviso(acao: () => Promise<void>) {
  try {
    await acao()
  } catch (e) {
    await message(`Operação falhou: ${e}`, { title: 'Grimório', kind: 'error' })
  }
}

/** Aba Lixeira: itens excluídos, com restaurar individual e esvaziar tudo (com confirmação). */
export function OpcoesLixeira() {
  const repo = useApp((s) => s.repo)
  const recarregarArvore = useApp((s) => s.recarregarArvore)
  const carregarPersonagens = useApp((s) => s.carregarPersonagens)
  const carregarCenarios = useApp((s) => s.carregarCenarios)
  const carregarItens = useApp((s) => s.carregarItens)
  const removerVinculosDe = useApp((s) => s.removerVinculosDe)
  const [entradas, setEntradas] = useState<EntradaLixeira[] | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function recarregar() {
    if (!repo) return
    const lista = await repo.listarLixeira()
    lista.sort((a, b) => b.excluidoEm.localeCompare(a.excluidoEm))
    setEntradas(lista)
  }

  useEffect(() => {
    void recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo])

  /** Depois de restaurar, só a árvore/cache do TIPO afetado precisa recarregar. */
  async function recarregarPosOperacao(tipos: Set<TipoLixeira>) {
    if (tipos.size === 0) return
    // página não passa pela árvore do cofre (vive dentro do .notas de um doc já aberto)
    if ([...tipos].some((t) => t !== 'pagina')) await recarregarArvore()
    if (tipos.has('personagem')) await carregarPersonagens()
    if (tipos.has('cenario')) await carregarCenarios()
    if (tipos.has('item')) await carregarItens()
  }

  async function restaurar(entrada: EntradaLixeira) {
    if (!repo || ocupado) return
    setOcupado(true)
    await comAviso(async () => {
      await repo.restaurarDaLixeira(entrada.id)
      await recarregar()
      await recarregarPosOperacao(new Set([entrada.tipo]))
    })
    setOcupado(false)
  }

  async function esvaziar() {
    if (!repo || !entradas || entradas.length === 0 || ocupado) return
    const ok = await ask(
      `Apagar definitivamente ${entradas.length} ${entradas.length === 1 ? 'item' : 'itens'} da lixeira?\n\nNão há volta — os arquivos somem do disco.`,
      { title: 'Esvaziar lixeira', kind: 'warning' },
    )
    if (!ok) return
    setOcupado(true)
    await comAviso(async () => {
      const idsParaLimpar = await repo.esvaziarLixeira()
      for (const id of idsParaLimpar) removerVinculosDe(id)
      await recarregar()
    })
    setOcupado(false)
  }

  return (
    <div className="opcoes-secao">
      <h3>Lixeira</h3>
      <p className="opcoes-caminho">
        Excluir personagem, cenário, item, canvas, mapa ou página move para cá. Nada some de vez até você esvaziar.
      </p>

      {entradas === null && <p className="opcoes-vazio">Carregando…</p>}
      {entradas?.length === 0 && <p className="opcoes-vazio">A lixeira está vazia.</p>}

      {entradas && entradas.length > 0 && (
        <ul className="opcoes-lista">
          {entradas.map((e) => (
            <li key={e.id} className="opcoes-cofre-item">
              <span className="opcoes-cofre-nome">{ICONE[e.tipo]} {e.nome}</span>
              <span className="opcoes-cofre-caminho">
                {ROTULO[e.tipo]} · excluído em {formatarData(e.excluidoEm)}
                {e.tipo === 'pagina' && e.paginaDocCaminho ? ` · de ${e.paginaDocCaminho}` : ''}
              </span>
              <span className="opcoes-cofre-acoes">
                <button disabled={ocupado} onClick={() => void restaurar(e)}>Restaurar</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        className="opcoes-acao"
        disabled={!entradas || entradas.length === 0 || ocupado}
        onClick={() => void esvaziar()}
      >
        Esvaziar lixeira…
      </button>
    </div>
  )
}
