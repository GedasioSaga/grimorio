import { useEffect, useState } from 'react'
import { NotebookRepo } from '../lib/notebookRepo'
import type { PaginaNode } from '../lib/types'
import { useApp } from '../state/store'

async function comAviso(acao: () => Promise<void>) {
  try {
    await acao()
  } catch (e) {
    alert(`Operação falhou: ${e}`)
  }
}

function coletarSlugs(nodes: PaginaNode[], acc: Set<string>): Set<string> {
  for (const n of nodes) { acc.add(n.slug); coletarSlugs(n.filhos, acc) }
  return acc
}

/**
 * `repo` é a MESMA instância do NotebookRepo usada pelo NotasEditor (criada no Workspace),
 * para que rename/mover (rail) e salvarCorpo (editor) da mesma página sejam serializados
 * pela mesma fila `naFila` e nunca se sobrescrevam.
 * cadernoDirRel = caminho relativo ao cofre (chave da página ativa no store).
 */
export function PaginasRail({ repo, cadernoDirRel, onRecolher }: { repo: NotebookRepo; cadernoDirRel: string; onRecolher?: () => void }) {
  const [arvore, setArvore] = useState<PaginaNode[] | null>(null)
  const ativa = useApp((s) => s.paginaAtivaPorCaderno[cadernoDirRel] ?? null)
  const setPaginaAtiva = useApp((s) => s.setPaginaAtiva)

  async function recarregar() {
    const arv = await repo.montarArvore()
    setArvore(arv)
    const ativaAtual = useApp.getState().paginaAtivaPorCaderno[cadernoDirRel] ?? null
    if (ativaAtual && !coletarSlugs(arv, new Set()).has(ativaAtual)) {
      setPaginaAtiva(cadernoDirRel, null)
    }
  }

  useEffect(() => {
    repo.inicializar().then(recarregar).catch((e) => {
      console.error('Falha ao abrir caderno:', e)
      setArvore([])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo])

  async function nova(paiId: string | null) {
    const titulo = prompt('Título da página:')
    if (!titulo) return
    await comAviso(async () => {
      const ref = await repo.criarPagina(titulo, paiId)
      await recarregar()
      setPaginaAtiva(cadernoDirRel, ref.slug)
    })
  }

  async function onDropReparent(arrastadaId: string, novoPaiId: string | null) {
    if (arrastadaId === novoPaiId) return
    await comAviso(async () => {
      await repo.moverPagina(arrastadaId, novoPaiId, 0)
      await recarregar()
    })
  }

  if (!arvore) return <div className="rail rail-vazio">Carregando…</div>

  return (
    <div
      className="rail"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-grimorio-pagina')) e.preventDefault() }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData('application/x-grimorio-pagina')
        if (id) void onDropReparent(id, null) // solto na área vazia = vira raiz
      }}
    >
      <div className="rail-header">
        {onRecolher && <button className="btn-icon" title="Recolher páginas" onClick={onRecolher}>‹</button>}
        <span className="rail-header-titulo">Páginas</span>
        <button className="btn-icon" title="Nova página" onClick={() => void nova(null)}>+</button>
      </div>
      {arvore.length === 0 && <div className="rail-vazio">Sem páginas ainda.</div>}
      {arvore.map((n) => (
        <LinhaPagina
          key={n.id}
          node={n}
          nivel={0}
          ativa={ativa}
          onAbrir={(slug) => setPaginaAtiva(cadernoDirRel, slug)}
          onNova={nova}
          onReparent={onDropReparent}
          repo={repo}
          recarregar={recarregar}
          cadernoDirRel={cadernoDirRel}
        />
      ))}
    </div>
  )
}

function LinhaPagina({
  node, nivel, ativa, onAbrir, onNova, onReparent, repo, recarregar, cadernoDirRel,
}: {
  node: PaginaNode
  nivel: number
  ativa: string | null
  onAbrir: (slug: string) => void
  onNova: (paiId: string | null) => void
  onReparent: (arrastadaId: string, novoPaiId: string | null) => void
  repo: NotebookRepo
  recarregar: () => Promise<void>
  cadernoDirRel: string
}) {
  const [aberto, setAberto] = useState(true)

  async function renomear(e: React.MouseEvent) {
    e.stopPropagation()
    const titulo = prompt('Novo título:', node.titulo)
    if (!titulo) return
    await comAviso(async () => {
      await repo.renomearPagina(node.slug, titulo)
      await recarregar()
    })
  }

  async function excluir(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Excluir "${node.titulo}" e as subpáginas?`)) return
    await comAviso(async () => {
      await repo.excluirPagina(node.slug)
      await recarregar()
    })
  }

  return (
    <div className="rail-node">
      <div
        className={`rail-linha ${ativa === node.slug ? 'ativa' : ''} ${node.erro ? 'item-erro' : ''}`}
        style={{ paddingLeft: 8 + nivel * 14 }}
        onClick={() => !node.erro && onAbrir(node.slug)}
        draggable={!node.erro}
        onDragStart={(e) => e.dataTransfer.setData('application/x-grimorio-pagina', node.id)}
        onDragOver={(e) => { if (!node.erro && e.dataTransfer.types.includes('application/x-grimorio-pagina')) { e.preventDefault(); e.stopPropagation() } }}
        onDrop={(e) => {
          if (node.erro) return
          e.stopPropagation()
          const id = e.dataTransfer.getData('application/x-grimorio-pagina')
          if (id) onReparent(id, node.id) // soltar em cima = vira filho desta
        }}
        title={node.erro ? 'Página com erro' : node.titulo}
      >
        {node.filhos.length > 0 ? (
          <span className="chevron" onClick={(e) => { e.stopPropagation(); setAberto(!aberto) }}>{aberto ? '▾' : '▸'}</span>
        ) : <span className="chevron-vazio" />}
        <span className="rail-titulo">{node.titulo}{node.erro ? ' ⚠' : ''}</span>
        <span className="rail-acoes" onClick={(e) => e.stopPropagation()}>
          <button className="btn-icon" title="Subpágina" onClick={(e) => { e.stopPropagation(); onNova(node.id) }}>+</button>
          <button className="btn-icon" title="Renomear" onClick={renomear}>✎</button>
          <button className="btn-icon" title="Excluir" onClick={excluir}>🗑</button>
        </span>
      </div>
      {aberto && node.filhos.map((f) => (
        <LinhaPagina
          key={f.id} node={f} nivel={nivel + 1} ativa={ativa}
          onAbrir={onAbrir} onNova={onNova} onReparent={onReparent}
          repo={repo} recarregar={recarregar} cadernoDirRel={cadernoDirRel}
        />
      ))}
    </div>
  )
}
