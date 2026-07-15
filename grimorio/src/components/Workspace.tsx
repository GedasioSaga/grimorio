import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PaginasRail } from './PaginasRail'
import { PaginasChips } from './PaginasChips'
import { NotasEditor } from './NotasEditor'
import { CanvasView } from './CanvasView'
import { tauriFs } from '../lib/fsBridge'
import { NotebookRepo } from '../lib/notebookRepo'
import { flexDosLados, proximoRecolhido, type Recolhido } from '../lib/splitState'
import { useApp } from '../state/store'

interface EstadoSplit {
  proporcao: number // fração larg. das Notas (0..1) quando ambos abertos
  recolhido: Recolhido
  railRecolhida: boolean // árvore de páginas recolhida em miniatura no topo
}

function lerSplit(chave: string, recolhidoPadrao: Recolhido): EstadoSplit {
  const padrao: EstadoSplit = { proporcao: 0.5, recolhido: recolhidoPadrao, railRecolhida: false }
  try {
    const s = localStorage.getItem(`grimorio.split.${chave}`)
    if (!s) return padrao
    const o = JSON.parse(s) as Partial<EstadoSplit>
    const proporcao = typeof o.proporcao === 'number' && o.proporcao >= 0.15 && o.proporcao <= 0.85 ? o.proporcao : 0.5
    const recolhido: Recolhido = o.recolhido === 'notas' || o.recolhido === 'mapa' ? o.recolhido : 'nenhum'
    return { proporcao, recolhido, railRecolhida: o.railRecolhida === true }
  } catch { return padrao }
}
function salvarSplit(chave: string, e: EstadoSplit) {
  localStorage.setItem(`grimorio.split.${chave}`, JSON.stringify(e))
}

/**
 * cadernoDirAbs/Rel: pasta do caderno. mapa: props do CanvasView (undefined = escrita livre, sem mapa).
 * chaveSplit: identificador estável para lembrar o layout (ex.: caminho do mapa).
 * notasLado: 'esquerda' ou 'direita' — de que lado do mapa as notas ficam.
 * notasComecaRecolhida: no primeiro acesso, notas começam recolhidas em aba na borda
 *   (o usuário puxa quando quer escrever). Independe do lado.
 */
export function Workspace({
  cadernoDirAbs, cadernoDirRel, chaveSplit, mapa, titulo,
  notasLado = 'esquerda', notasComecaRecolhida = false,
}: {
  cadernoDirAbs: string
  cadernoDirRel: string
  chaveSplit: string
  mapa?: { caminho: string; nome: string }
  titulo?: string
  notasLado?: 'esquerda' | 'direita'
  notasComecaRecolhida?: boolean
}) {
  const notasNaDireita = notasLado === 'direita'
  const recolhidoPadrao: Recolhido = notasComecaRecolhida ? 'notas' : 'nenhum'

  const slugAtivo = useApp((s) => s.paginaAtivaPorCaderno[cadernoDirRel] ?? null)
  // UMA instância de NotebookRepo compartilhada entre rail e editor: serializa
  // rename/mover (rail) e salvarCorpo (editor) da mesma página na mesma fila.
  const repo = useMemo(() => new NotebookRepo(cadernoDirAbs, tauriFs), [cadernoDirAbs])
  const [split, setSplit] = useState<EstadoSplit>(() => lerSplit(chaveSplit, recolhidoPadrao))
  const [redimensionando, setRedimensionando] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const arrastando = useRef(false)

  useEffect(() => { salvarSplit(chaveSplit, split) }, [chaveSplit, split])

  const temMapa = !!mapa
  const recolhido = temMapa ? split.recolhido : 'mapa' // sem mapa: escrita sempre cheia

  function iniciarArrasto(e: React.MouseEvent) {
    if (!temMapa) return
    arrastando.current = true
    setRedimensionando(true)
    e.preventDefault()
  }
  useEffect(() => {
    function mover(e: MouseEvent) {
      if (!arrastando.current || !wrapRef.current) return
      const r = wrapRef.current.getBoundingClientRect()
      const fracEsquerda = (e.clientX - r.left) / r.width
      // proporcao é sempre a fração das NOTAS; com notas à direita, invertemos.
      const fracNotas = notasNaDireita ? 1 - fracEsquerda : fracEsquerda
      const frac = Math.min(0.85, Math.max(0.15, fracNotas))
      setSplit((s) => ({ ...s, proporcao: frac }))
    }
    function soltar() { arrastando.current = false; setRedimensionando(false) }
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
    return () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar) }
  }, [notasNaDireita])

  const { escrita: escritaFlex, mapa: mapaFlex } = flexDosLados(recolhido, split.proporcao)
  const notasRecolhida = recolhido === 'notas'
  const mapaRecolhido = recolhido === 'mapa'

  const painelEscrita = (
    <div className={`ws-escrita${notasRecolhida ? ' ws-recolhido' : ''}`} style={{ flexGrow: escritaFlex, flexBasis: 0 }}>
      <div className="ws-cabecalho">
        {!notasRecolhida && <span className="ws-titulo">{mapa ? (notasNaDireita ? 'Notas' : mapa.nome) : titulo ?? 'Escrita'}</span>}
        {temMapa && (
          <button className="btn-icon" title={notasRecolhida ? 'Abrir notas' : 'Recolher notas'}
            onClick={() => setSplit((s) => ({ ...s, recolhido: proximoRecolhido(s.recolhido, 'notas') }))}>
            {notasRecolhida ? '✎' : notasNaDireita ? '›' : '‹'}
          </button>
        )}
      </div>
      {!notasRecolhida && (
        <div className={`ws-escrita-corpo${split.railRecolhida ? ' rail-recolhida' : ''}`}>
          {split.railRecolhida
            ? (
              <div className="rail-miniatura">
                <button className="btn-icon" title="Abrir páginas" onClick={() => setSplit((s) => ({ ...s, railRecolhida: false }))}>☰ Páginas</button>
                <PaginasChips repo={repo} cadernoDirRel={cadernoDirRel} />
              </div>
            )
            : <PaginasRail repo={repo} cadernoDirRel={cadernoDirRel} onRecolher={() => setSplit((s) => ({ ...s, railRecolhida: true }))} />}
          {slugAtivo
            ? <NotasEditor key={slugAtivo} repo={repo} slug={slugAtivo} />
            : <div className="notas-vazio">Selecione ou crie uma página.</div>}
        </div>
      )}
    </div>
  )

  const divisoria: ReactNode = temMapa && recolhido === 'nenhum'
    ? <div className="ws-divisoria" onMouseDown={iniciarArrasto} title="Arrastar para redimensionar">⇔</div>
    : null

  const painelMapa = temMapa ? (
    <div className={`ws-mapa${mapaRecolhido ? ' ws-recolhido' : ''}`} style={{ flexGrow: mapaFlex, flexBasis: 0 }}>
      <div className="ws-cabecalho">
        {notasNaDireita && !mapaRecolhido && <span className="ws-titulo">{mapa?.nome}</span>}
        <button className="btn-icon" title={mapaRecolhido ? 'Expandir mapa' : 'Recolher mapa'}
          onClick={() => setSplit((s) => ({ ...s, recolhido: proximoRecolhido(s.recolhido, 'mapa') }))}>
          {mapaRecolhido ? (notasNaDireita ? '›' : '‹') : notasNaDireita ? '‹' : '›'}
        </button>
      </div>
      {!mapaRecolhido && (
        <div className="ws-mapa-corpo">
          {mapa && <CanvasView key={mapa.caminho} caminho={mapa.caminho} nome={mapa.nome} />}
        </div>
      )}
    </div>
  ) : null

  return (
    <div className={`workspace${redimensionando ? ' arrastando' : ''}`} ref={wrapRef}>
      {notasNaDireita
        ? <>{painelMapa}{divisoria}{painelEscrita}</>
        : <>{painelEscrita}{divisoria}{painelMapa}</>}
    </div>
  )
}
