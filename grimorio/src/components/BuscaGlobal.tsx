import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { useApp } from '../state/store'
import type { TipoAberto } from '../state/store'
import { buscarGlobal, type ResultadoGlobal, type TipoResultadoGlobal } from '../lib/buscaGlobal'
import { carregarPaginasDoCofre, docsComCaderno, pontuarPaginasCarregadas, type PaginaCarregada, type ResultadoPagina } from '../lib/buscaPaginas'
import { dirNotasDoMapa } from '../lib/caminhos'
import { arvoreFiltradaPorCampanha } from '../lib/filtroBuscaGlobal'
import { tauriFs } from '../lib/fsBridge'
import type { CenarioNode, ItemRef } from '../lib/types'

/**
 * Busca global (Ctrl+K). Abre de qualquer tela e acha qualquer entidade do cofre por pedaço
 * do nome. O estado de aberto/fechado mora num store à parte (mesmo padrão de Opcoes.tsx e
 * dialogos.tsx) porque o GATILHO — o listener de teclado — precisa estar montado o tempo todo,
 * não só quando a paleta já está na tela.
 */
interface BuscaGlobalState {
  aberto: boolean
  abrir(): void
  fechar(): void
}
export const useBuscaGlobal = create<BuscaGlobalState>((set) => ({
  aberto: false,
  abrir: () => set({ aberto: true }),
  fechar: () => set({ aberto: false }),
}))

/** Ctrl+K dentro de um campo de texto ou de um editor TipTap (contentEditable) pertence ao
 * que está sendo escrito ali — não pode roubar o foco pra abrir a paleta por cima. */
function estaEmCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false
  // `isContentEditable` computa layout que o jsdom (ambiente de teste) não implementa e sempre
  // devolve false — o atributo cru é a checagem que funciona nos dois, browser real e teste.
  if (alvo.isContentEditable || alvo.getAttribute('contenteditable') === 'true') return true
  return alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT'
}

type Resultado = ResultadoGlobal | ResultadoPagina

const RES_POR_TIPO: Record<TipoResultadoGlobal | 'pagina', { rotulo: string; icone: string }> = {
  personagem: { rotulo: 'Personagem', icone: '👤' },
  cenario: { rotulo: 'Cenário', icone: '🏰' },
  item: { rotulo: 'Item', icone: '💎' },
  canvas: { rotulo: 'Canvas', icone: '▦' },
  mapa: { rotulo: 'Mapa', icone: '🗺' },
  sessao: { rotulo: 'Sessão', icone: '📜' },
  escrita: { rotulo: 'Escrita', icone: '✍' },
  pagina: { rotulo: 'Página', icone: '📄' },
}

/** Montado uma vez perto da raiz (App.tsx). O listener de Ctrl+K fica sempre ligado; o
 * conteúdo da paleta só monta quando `aberto`. */
export function HostBuscaGlobal() {
  const aberto = useBuscaGlobal((s) => s.aberto)
  const abrir = useBuscaGlobal((s) => s.abrir)
  const fechar = useBuscaGlobal((s) => s.fechar)

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return
      const alvo = e.target
      // caso especial: o foco JÁ está no campo da própria paleta (ela já está aberta).
      // Sem isto, cai no guard de campo-de-texto abaixo, o segundo Ctrl+K fica inerte
      // (não fecha, não faz nada) e — pior — nunca chama preventDefault, vazando pro webview.
      if (alvo instanceof HTMLElement && alvo.classList.contains('busca-global-input')) {
        e.preventDefault()
        fechar()
        return
      }
      if (estaEmCampoDeTexto(alvo)) return
      e.preventDefault()
      abrir()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [abrir, fechar])

  if (!aberto) return null
  return <BuscaGlobal onFechar={fechar} />
}

function BuscaGlobal({ onFechar }: { onFechar: () => void }) {
  const tree = useApp((s) => s.tree)
  const vaultPath = useApp((s) => s.vaultPath)
  const caminhoPorId = useApp((s) => s.caminhoPorId)
  const caminhoItemPorId = useApp((s) => s.caminhoItemPorId)
  const vinculos = useApp((s) => s.vinculos)
  const campanhaFiltro = useApp((s) => s.campanhaFiltro)
  const abrirPerfil = useApp((s) => s.abrirPerfil)
  const abrirCenario = useApp((s) => s.abrirCenario)
  const abrirItem = useApp((s) => s.abrirItem)
  const abrirDocumento = useApp((s) => s.abrirDocumento)
  const setPaginaAtiva = useApp((s) => s.setPaginaAtiva)

  const [termo, setTermo] = useState('')
  const [selecionado, setSelecionado] = useState(0)
  // null = ainda carregando (a paleta não trava por isso: entidades já respondem na hora)
  const [paginasCarregadas, setPaginasCarregadas] = useState<PaginaCarregada[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])

  // Índice de páginas: I/O (varre a pasta .notas de cada canvas/mapa/sessão/escrita), então
  // carrega UMA VEZ por abertura da paleta, sobre o cofre INTEIRO (sem filtro) — o filtro de
  // campanha é aplicado depois, em memória, igual às entidades.
  useEffect(() => {
    if (!vaultPath || !tree) { setPaginasCarregadas([]); return }
    let vivo = true
    carregarPaginasDoCofre(vaultPath, tree, tauriFs)
      .then((p) => { if (vivo) setPaginasCarregadas(p) })
      .catch((e) => { console.error('Falha ao indexar páginas para a busca global:', e); if (vivo) setPaginasCarregadas([]) })
    return () => { vivo = false }
  }, [vaultPath, tree])

  // Mesmo recorte que a Sidebar aplica seção por seção (Sidebar.tsx) — "abrir o que a busca
  // achou faz o que clicar na sidebar faria" não vale pra algo que o filtro está escondendo.
  // Sem filtro válido, `arvoreFiltradaPorCampanha` devolve a MESMA referência de `tree` —
  // é o que `filtroAtivo` abaixo usa pra saber se há algo a avisar no rodapé.
  const treeFiltrado = useMemo(
    () => (tree ? arvoreFiltradaPorCampanha(tree, vinculos, campanhaFiltro, caminhoPorId, caminhoItemPorId) : null),
    [tree, vinculos, campanhaFiltro, caminhoPorId, caminhoItemPorId],
  )
  const filtroAtivo = tree !== null && treeFiltrado !== tree

  const resultadosEntidadesTodos = useMemo(() => buscarGlobal(tree, termo), [tree, termo])
  const resultadosEntidades = useMemo(() => buscarGlobal(treeFiltrado, termo), [treeFiltrado, termo])

  const resultadosPaginasTodos = useMemo(
    () => (paginasCarregadas ? pontuarPaginasCarregadas(paginasCarregadas, termo) : []),
    [paginasCarregadas, termo],
  )
  const docsPermitidos = useMemo(
    () => new Set(treeFiltrado ? docsComCaderno(treeFiltrado).map((d) => d.docCaminho) : []),
    [treeFiltrado],
  )
  const resultadosPaginas = useMemo(
    () => resultadosPaginasTodos.filter((r) => docsPermitidos.has(r.docCaminho)),
    [resultadosPaginasTodos, docsPermitidos],
  )

  const resultados: Resultado[] = useMemo(
    () => [...resultadosEntidades, ...resultadosPaginas],
    [resultadosEntidades, resultadosPaginas],
  )
  const foraDoFiltro = filtroAtivo
    ? (resultadosEntidadesTodos.length + resultadosPaginasTodos.length) - (resultadosEntidades.length + resultadosPaginas.length)
    : 0
  const buscando = termo.trim().length > 0
  const carregandoPaginas = paginasCarregadas === null

  useEffect(() => { setSelecionado(0) }, [termo])
  useEffect(() => {
    const item = listaRef.current?.querySelector('.busca-global-item.selecionado')
    // scrollIntoView não existe no jsdom (ambiente de teste) — guarda evita quebrar lá
    item?.scrollIntoView?.({ block: 'nearest' })
  }, [selecionado])

  function abrirResultado(r: Resultado) {
    // arquivo corrompido (.json ilegível): a sidebar mostra a linha mas o clique não faz
    // nada (Sidebar.tsx / ItensSoltos.tsx / CenariosSoltos.tsx / PersonagensSoltos.tsx
    // checam `.erro` antes de abrir) — a busca precisa do mesmo guard, senão fecha a
    // paleta em silêncio e o usuário acha que ela quebrou.
    if (r.tipo !== 'pagina' && r.ref.erro) return
    if (r.tipo === 'pagina') {
      abrirDocumento(r.tipoAbertura, r.docCaminho, r.docNome)
      setPaginaAtiva(dirNotasDoMapa(r.docCaminho), r.paginaSlug)
    } else if (r.tipo === 'personagem') {
      const ref = r.ref as ItemRef
      const id = ref.id ?? Object.entries(caminhoPorId).find(([, cam]) => cam === ref.caminho)?.[0]
      if (id) abrirPerfil(id)
    } else if (r.tipo === 'item') {
      const ref = r.ref as ItemRef
      const id = ref.id ?? Object.entries(caminhoItemPorId).find(([, cam]) => cam === ref.caminho)?.[0]
      if (id) abrirItem(id)
    } else if (r.tipo === 'cenario') {
      abrirCenario((r.ref as CenarioNode).id)
    } else {
      const ref = r.ref as ItemRef
      abrirDocumento(r.tipo as TipoAberto, ref.caminho, ref.nome)
    }
    onFechar()
  }

  function aoTeclarNaCaixa(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onFechar(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelecionado((i) => Math.min(i + 1, resultados.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelecionado((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      const alvo = resultados[selecionado]
      if (alvo) abrirResultado(alvo)
    }
  }

  return (
    <div className="modal-overlay busca-global-overlay" onClick={onFechar}>
      <div className="busca-global-caixa" onClick={(e) => e.stopPropagation()}>
        <div className="busca-global-campo">
          <span className="busca-lupa">🔍</span>
          <input
            ref={inputRef}
            className="busca-global-input"
            placeholder="Buscar personagem, cenário, item, canvas, mapa, página…"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={aoTeclarNaCaixa}
          />
          {buscando && carregandoPaginas && <span className="busca-global-carregando" title="Ainda indexando páginas de caderno">…</span>}
        </div>
        <div className="busca-global-lista" ref={listaRef}>
          {!tree ? (
            <div className="busca-global-vazio">Nenhum cofre aberto ainda.</div>
          ) : !buscando ? (
            <div className="busca-global-dica">Digite para buscar em todo o cofre.</div>
          ) : resultados.length === 0 ? (
            <div className="busca-global-vazio">Nada com “{termo.trim()}”.</div>
          ) : (
            resultados.map((r, i) => {
              const info = RES_POR_TIPO[r.tipo]
              // arquivo corrompido: mesmo aviso visual da sidebar (item-erro + ⚠), pra quem
              // digitou o nome entender por que Enter não abriu nada em vez de achar bug
              const quebrado = r.tipo !== 'pagina' && !!r.ref.erro
              return (
                <button
                  key={`${r.tipo}:${r.caminho}`}
                  className={`busca-global-item${i === selecionado ? ' selecionado' : ''}${quebrado ? ' quebrado' : ''}`}
                  onMouseEnter={() => setSelecionado(i)}
                  onClick={() => abrirResultado(r)}
                  title={quebrado ? 'Arquivo com erro — não foi possível ler' : undefined}
                >
                  <span className="busca-global-icone" aria-hidden>{info.icone}</span>
                  <span className="busca-global-nome">{r.nome}{quebrado ? ' ⚠' : ''}</span>
                  <span className="busca-global-tipo">{info.rotulo}</span>
                  {r.caminhoRotulo && <span className="busca-global-caminho">{r.caminhoRotulo}</span>}
                </button>
              )
            })
          )}
        </div>
        {foraDoFiltro > 0 && (
          <div className="busca-global-rodape">
            {foraDoFiltro === 1
              ? '1 resultado fora do filtro de campanha atual, não mostrado aqui.'
              : `${foraDoFiltro} resultados fora do filtro de campanha atual, não mostrados aqui.`}
          </div>
        )}
      </div>
    </div>
  )
}
