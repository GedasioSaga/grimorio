import { useEffect, useMemo, useRef, useState } from 'react'
import { PaginasRail } from './PaginasRail'
import { NotasEditor } from './NotasEditor'
import { CanvasView } from './CanvasView'
import { tauriFs } from '../lib/fsBridge'
import { NotebookRepo } from '../lib/notebookRepo'
import { useApp } from '../state/store'

interface EstadoSplit {
  proporcao: number // fração larg. das Notas (0..1) quando ambos abertos
  recolhido: 'nenhum' | 'notas' | 'mapa'
}

function lerSplit(chave: string): EstadoSplit {
  try {
    const s = localStorage.getItem(`grimorio.split.${chave}`)
    if (s) return JSON.parse(s)
  } catch { /* ignora */ }
  return { proporcao: 0.5, recolhido: 'nenhum' }
}
function salvarSplit(chave: string, e: EstadoSplit) {
  localStorage.setItem(`grimorio.split.${chave}`, JSON.stringify(e))
}

/**
 * cadernoDirAbs/Rel: pasta do caderno. mapa: props do CanvasView (undefined = escrita livre, sem mapa).
 * chaveSplit: identificador estável para lembrar o layout (ex.: caminho da sessão).
 */
export function Workspace({
  cadernoDirAbs, cadernoDirRel, chaveSplit, mapa,
}: {
  cadernoDirAbs: string
  cadernoDirRel: string
  chaveSplit: string
  mapa?: { caminho: string; nome: string }
}) {
  const slugAtivo = useApp((s) => s.paginaAtivaPorCaderno[cadernoDirRel] ?? null)
  // UMA instância de NotebookRepo compartilhada entre rail e editor: serializa
  // rename/mover (rail) e salvarCorpo (editor) da mesma página na mesma fila.
  const repo = useMemo(() => new NotebookRepo(cadernoDirAbs, tauriFs), [cadernoDirAbs])
  const [split, setSplit] = useState<EstadoSplit>(() => lerSplit(chaveSplit))
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const arrastando = useRef(false)

  useEffect(() => { salvarSplit(chaveSplit, split) }, [chaveSplit, split])
  useEffect(() => { setSplit(lerSplit(chaveSplit)) }, [chaveSplit])

  const temMapa = !!mapa
  const recolhido = temMapa ? split.recolhido : 'mapa' // sem mapa: escrita sempre cheia

  function iniciarArrasto(e: React.MouseEvent) {
    if (!temMapa) return
    arrastando.current = true
    e.preventDefault()
  }
  useEffect(() => {
    function mover(e: MouseEvent) {
      if (!arrastando.current || !wrapRef.current) return
      const r = wrapRef.current.getBoundingClientRect()
      const frac = Math.min(0.85, Math.max(0.15, (e.clientX - r.left) / r.width))
      setSplit((s) => ({ ...s, proporcao: frac }))
    }
    function soltar() { arrastando.current = false }
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
    return () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar) }
  }, [])

  const escritaFlex = recolhido === 'notas' ? 0 : recolhido === 'mapa' ? 1 : split.proporcao
  const mapaFlex = recolhido === 'mapa' ? 0 : recolhido === 'notas' ? 1 : 1 - split.proporcao

  return (
    <div className="workspace" ref={wrapRef}>
      <div className="ws-escrita" style={{ flexGrow: escritaFlex, flexBasis: 0 }}>
        <div className="ws-cabecalho">
          <span className="ws-titulo">{mapa?.nome ?? 'Escrita'}</span>
          {temMapa && (
            <button className="btn-icon" title="Recolher notas" onClick={() => setSplit((s) => ({ ...s, recolhido: s.recolhido === 'notas' ? 'nenhum' : 'notas' }))}>
              {recolhido === 'notas' ? '›' : '‹'}
            </button>
          )}
        </div>
        <div className="ws-escrita-corpo">
          <PaginasRail repo={repo} cadernoDirRel={cadernoDirRel} />
          {slugAtivo
            ? <NotasEditor key={slugAtivo} repo={repo} slug={slugAtivo} />
            : <div className="notas-vazio">Selecione ou crie uma página.</div>}
        </div>
      </div>

      {temMapa && recolhido === 'nenhum' && (
        <div className="ws-divisoria" onMouseDown={iniciarArrasto} title="Arrastar para redimensionar">⇔</div>
      )}

      {temMapa && (
        <div className="ws-mapa" style={{ flexGrow: mapaFlex, flexBasis: 0 }}>
          <div className="ws-cabecalho">
            <button className="btn-icon" title="Recolher mapa" onClick={() => setSplit((s) => ({ ...s, recolhido: s.recolhido === 'mapa' ? 'nenhum' : 'mapa' }))}>
              {recolhido === 'mapa' ? '‹' : '›'}
            </button>
          </div>
          <div className="ws-mapa-corpo">
            {recolhido !== 'mapa' && mapa && <CanvasView key={mapa.caminho} caminho={mapa.caminho} nome={mapa.nome} />}
          </div>
        </div>
      )}
    </div>
  )
}
