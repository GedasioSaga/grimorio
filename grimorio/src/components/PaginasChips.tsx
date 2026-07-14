import { useEffect, useState } from 'react'
import { NotebookRepo } from '../lib/notebookRepo'
import { achatarPaginas, type PaginaPlana } from '../lib/achatarPaginas'
import { useApp } from '../state/store'

/**
 * Chips de páginas exibidos na barra-miniatura quando a rail "☰ Páginas" está recolhida.
 * Carrega a lista plana via o MESMO `repo` do Workspace (a rail expandida está desmontada,
 * então sua árvore não está disponível aqui). Clicar navega sem expandir a rail.
 */
export function PaginasChips({ repo, cadernoDirRel }: { repo: NotebookRepo; cadernoDirRel: string }) {
  const [paginas, setPaginas] = useState<PaginaPlana[] | null>(null)
  const ativa = useApp((s) => s.paginaAtivaPorCaderno[cadernoDirRel] ?? null)
  const setPaginaAtiva = useApp((s) => s.setPaginaAtiva)

  useEffect(() => {
    let vivo = true
    repo.inicializar()
      .then(() => repo.montarArvore())
      .then((arv) => { if (vivo) setPaginas(achatarPaginas(arv)) })
      .catch((e) => { console.error('Falha ao carregar páginas (chips):', e); if (vivo) setPaginas([]) })
    return () => { vivo = false }
  }, [repo])

  if (!paginas || paginas.length === 0) return null

  // roda vertical do mouse rola a faixa horizontalmente (linha única, sem overflow vertical)
  function aoRolar(e: React.WheelEvent<HTMLDivElement>) {
    if (e.deltaY === 0) return
    e.currentTarget.scrollLeft += e.deltaY
  }

  return (
    <div className="rail-chips" onWheel={aoRolar}>
      {paginas.map((p) => (
        <button
          key={p.slug}
          className={`rail-chip${ativa === p.slug ? ' ativa' : ''}`}
          disabled={p.erro}
          title={p.erro ? 'Página com erro' : p.titulo}
          onClick={() => { if (!p.erro) setPaginaAtiva(cadernoDirRel, p.slug) }}
        >
          {p.titulo}
        </button>
      ))}
    </div>
  )
}
