import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import type { TipoAlvoVinculo } from '../lib/types'
import { montarTeia, vizinhos, type NoTeia, type RetratoNo } from '../lib/grafoVinculos'
import { calcularLayout, type Posicao } from '../lib/grafoLayout'
import { chaveDoEscopo, paraFracao, posicoesEfetivas } from '../lib/grafoLayoutPersistido'
import { alinhamentoSvg } from '../lib/focoRetrato'
import { resumoAtivo, versaoAtiva } from '../lib/cenarioVersao'
import { resumoAtivoPersonagem, versaoAtivaPersonagem } from '../lib/personagemVersao'

const RAIO_NO = 26
const ZOOM_MIN = 0.25
const ZOOM_MAX = 4

/** Enquanto o painel não foi medido: qualquer valor serve, some no primeiro frame. */
const TAMANHO_INICIAL = { largura: 1200, altura: 800 }

/**
 * Preferência de mostrar os retratos nos nós.
 *
 * Nasce LIGADA, que é a graça da teia. Mas o retrato do cofre é a imagem em tamanho cheio —
 * num cofre real a média passa de 700 KB por arquivo —, e o navegador decodifica cada uma
 * inteira para pintar um círculo de 52 px. Com muitos nós isso é um pico de memória feio, e
 * quem tem uma máquina modesta precisa de um jeito de desligar sem sair da tela.
 */
const CHAVE_RETRATOS = 'grimorio.teiaRetratos'

function retratosLigadosSalvo(): boolean {
  return localStorage.getItem(CHAVE_RETRATOS) !== '0'
}

/**
 * O tamanho medido é arredondado antes de virar moldura do layout. Sem isso, arrastar a
 * borda da janela recalcularia a simulação inteira a cada pixel.
 */
const PASSO_MEDIDA = 40

/**
 * Referência ESTÁVEL para "nenhum layout salvo neste escopo". `{}` inline no corpo do
 * componente seria um objeto novo a cada render, e como ele entra na lista de dependências
 * do efeito que repõe `arrastados`, isso disparava o efeito (e um novo `setState`) sem parar.
 */
const LAYOUT_VAZIO: Record<string, Posicao> = {}

const ICONE: Record<TipoAlvoVinculo, string> = { personagem: '👤', cenario: '🗺', item: '💎' }
const ROTULO_TIPO: Record<TipoAlvoVinculo, string> = { personagem: 'Personagens', cenario: 'Cenários', item: 'Itens' }
const TIPOS: TipoAlvoVinculo[] = ['personagem', 'cenario', 'item']

/** Rótulo de aresta é texto solto no SVG: não quebra nem corta sozinho, então vaza. */
const MAX_ROTULO = 26

function encurtar(texto: string): string {
  return texto.length <= MAX_ROTULO ? texto : `${texto.slice(0, MAX_ROTULO - 1)}…`
}

interface Vista {
  x: number
  y: number
  /** largura visível em unidades do desenho; menor = mais zoom */
  w: number
}

/**
 * A teia da campanha: o que `vinculos.json` guarda há tempo, finalmente desenhado.
 *
 * SVG próprio em vez do tldraw, que já está no projeto. O tldraw é um EDITOR de canvas —
 * usá-lo aqui exigiria shapes personalizadas, um documento persistido e um autosave, e o
 * usuário ganharia o direito de "editar" um desenho que é derivado dos vínculos e some no
 * próximo recálculo. Aqui a tela é uma LEITURA: o desenho vem do dado, não o contrário.
 * O tldraw continua onde ele é o certo (os mapas).
 */
export function GrafoVinculos() {
  const personagens = useApp((s) => s.personagens)
  const cenarios = useApp((s) => s.cenarios)
  const itens = useApp((s) => s.itens)
  const vinculos = useApp((s) => s.vinculos)
  const campanhaFiltro = useApp((s) => s.campanhaFiltro)
  const layoutsTeia = useApp((s) => s.layoutsTeia)
  const salvarPosicaoTeia = useApp((s) => s.salvarPosicaoTeia)
  const resetarLayoutTeia = useApp((s) => s.resetarLayoutTeia)
  const tree = useApp((s) => s.tree)
  const alternarGrafo = useApp((s) => s.alternarGrafo)
  const abrirPerfil = useApp((s) => s.abrirPerfil)
  const abrirCenario = useApp((s) => s.abrirCenario)
  const abrirItem = useApp((s) => s.abrirItem)

  const vaultPath = useApp((s) => s.vaultPath)
  const [ocultos, setOcultos] = useState<Set<TipoAlvoVinculo>>(new Set())
  const [selecionado, setSelecionado] = useState<string | null>(null)
  // ids cujo retrato não carregou (arquivo movido à mão, imagem corrompida): caem no ícone
  const [semImagem, setSemImagem] = useState<Set<string>>(new Set())
  const [retratosLigados, setRetratosLigados] = useState(retratosLigadosSalvo)
  /**
   * Posição de tela de CADA nó atual, em pixel absoluto — a arrumada à mão (salva ou desta
   * sessão) onde existe, senão a do layout automático. Repovoada pelo efeito logo abaixo do
   * `layout`; o `useState({})` inicial é só o instante antes do primeiro efeito rodar.
   */
  const [arrastados, setArrastados] = useState<Record<string, Posicao>>({})
  const [tamanho, setTamanho] = useState(TAMANHO_INICIAL)
  const [vista, setVista] = useState<Vista>({ x: 0, y: 0, w: TAMANHO_INICIAL.largura })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const telaRef = useRef<HTMLDivElement | null>(null)
  const arrasto = useRef<{ tipo: 'tela' | 'no'; id?: string; x: number; y: number } | null>(null)

  /**
   * A moldura do layout é o painel real, não um retângulo fixo.
   *
   * Com moldura fixa, a proporção dela quase nunca bate com a da janela: o SVG encaixa o
   * viewBox com sobra num dos eixos e encolhe TUDO junto, inclusive as fontes — os nomes
   * chegavam a ~8px numa janela larga. Medindo o painel, uma unidade do desenho vale um
   * pixel no zoom 100% e o texto sai no tamanho que o CSS diz.
   */
  useLayoutEffect(() => {
    const alvo = telaRef.current
    if (!alvo) return
    const observador = new ResizeObserver(([entrada]) => {
      const { width, height } = entrada.contentRect
      if (width < 1 || height < 1) return // painel escondido: medida não vale nada
      const passo = (n: number) => Math.max(PASSO_MEDIDA, Math.round(n / PASSO_MEDIDA) * PASSO_MEDIDA)
      const novo = { largura: passo(width), altura: passo(height) }
      setTamanho((atual) => (atual.largura === novo.largura && atual.altura === novo.altura ? atual : novo))
    })
    observador.observe(alvo)
    return () => observador.disconnect()
  }, [])

  const teia = useMemo(
    () => montarTeia({
      personagens, cenarios, itens, vinculos, campanhaId: campanhaFiltro,
      resumoDe: (id) => (personagens[id] ? resumoAtivoPersonagem(personagens[id]) : cenarios[id] ? resumoAtivo(cenarios[id]) : ''),
      // o retrato de personagem e cenário mora na versão ATIVA; o do item, na própria entidade
      retratoDe: (id) => {
        const p = personagens[id]
        if (p) { const v = versaoAtivaPersonagem(p); return v.retrato ? { rel: v.retrato, foco: v.foco } : null }
        const c = cenarios[id]
        if (c) { const v = versaoAtiva(c); return v.retrato ? { rel: v.retrato, foco: v.foco } : null }
        const i = itens[id]
        return i?.retrato ? { rel: i.retrato, foco: i.foco } : null
      },
    }),
    [personagens, cenarios, itens, vinculos, campanhaFiltro],
  )

  /**
   * Retrato → URL que o webview consegue abrir. `?v=` com o `modificadoEm` da entidade força
   * o refetch quando o usuário troca a imagem mantendo o mesmo nome de arquivo — mesmo truque
   * dos modais.
   */
  function urlDoRetrato(id: string, retrato: RetratoNo): string | null {
    if (!vaultPath) return null
    const marca = personagens[id]?.modificadoEm ?? cenarios[id]?.modificadoEm ?? itens[id]?.modificadoEm ?? ''
    return `${convertFileSrc(`${vaultPath}/${retrato.rel}`)}?v=${encodeURIComponent(marca)}`
  }

  // o layout é caro e não pode recalcular a cada arrasto: só muda quando a teia (ou o
  // tamanho do painel) muda. Reabrir a tela redesenha igual — o algoritmo é determinístico.
  const layout = useMemo(
    () => calcularLayout(teia.nos, teia.arestas, tamanho),
    [teia, tamanho],
  )

  // redesenhou noutra moldura: o enquadramento anterior aponta para o lugar errado.
  // O ARRANJO não some daqui — quem cuida dele é o efeito abaixo, a partir do que
  // está salvo (posição normalizada sobrevive à mudança de moldura; pixel absoluto não).
  useEffect(() => {
    setVista({ x: 0, y: 0, w: tamanho.largura })
  }, [tamanho])

  /** Escopo da persistência: o cofre inteiro, ou a campanha do filtro atual. */
  const escopo = chaveDoEscopo(campanhaFiltro)
  const layoutSalvo = layoutsTeia[escopo] ?? LAYOUT_VAZIO

  /**
   * Repõe as posições arrumadas à mão sempre que o layout automático muda por baixo —
   * redimensionar a janela, trocar de campanha, ou uma entidade nova/excluída mudando a
   * teia. `posicoesEfetivas` converte a fração salva para pixel da moldura ATUAL, então o
   * nó não pula de lugar mesmo com a janela em outro tamanho. Nó recém-arrastado nesta
   * sessão também passa por aqui de novo depois do `salvarPosicaoTeia` do mouseup — é
   * idempotente, reproduz a mesma posição que acabou de ser salva.
   */
  useEffect(() => {
    const recomposto = posicoesEfetivas(layoutSalvo, layout, tamanho)
    setArrastados((anterior) => {
      /**
       * O nó que está sendo arrastado AGORA vive só em `arrastados` — quem grava é o mouseup.
       * E `arrasto` é ref, que não redispara efeito, então este efeito não tem como saber
       * sozinho que há um arrasto de pé. Sem a guarda, uma recarga de `layoutsTeia` vinda do
       * sync em segundo plano (`recarregarDoDisco` → `carregarLayoutTeia`) trocaria a posição
       * do nó DEBAIXO DO CURSOR pela posição antiga, e ele saltaria para longe do mouse.
       * Só o nó em arrasto é preservado; todo o resto é recomposto normalmente.
       */
      const emArrasto = arrasto.current
      if (emArrasto?.tipo !== 'no' || !emArrasto.id) return recomposto
      const preso = anterior[emArrasto.id]
      return preso ? { ...recomposto, [emArrasto.id]: preso } : recomposto
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, layoutSalvo, tamanho])

  const visiveis = useMemo(() => teia.nos.filter((n) => !ocultos.has(n.tipo)), [teia.nos, ocultos])
  const idsVisiveis = useMemo(() => new Set(visiveis.map((n) => n.id)), [visiveis])
  const idsDaTeia = useMemo(() => new Set(teia.nos.map((n) => n.id)), [teia.nos])
  const arestasVisiveis = teia.arestas.filter((a) => idsVisiveis.has(a.de) && idsVisiveis.has(a.para))
  const destacados = selecionado ? vizinhos(teia.arestas, selecionado) : null

  const pos = (id: string): Posicao =>
    arrastados[id] ?? layout[id] ?? { x: tamanho.largura / 2, y: tamanho.altura / 2 }
  const escala = () => vista.w / tamanho.largura
  const alturaVista = () => vista.w * (tamanho.altura / tamanho.largura)

  /** Converte pixels de tela em unidades do desenho (o zoom muda essa razão). */
  function paraUnidades(dxTela: number, dyTela: number) {
    const caixa = svgRef.current?.getBoundingClientRect()
    if (!caixa) return { dx: 0, dy: 0 }
    return { dx: (dxTela / caixa.width) * vista.w, dy: (dyTela / caixa.height) * alturaVista() }
  }

  function aoRolar(e: React.WheelEvent) {
    const fator = e.deltaY > 0 ? 1.12 : 1 / 1.12
    const nova = Math.min(tamanho.largura / ZOOM_MIN, Math.max(tamanho.largura / ZOOM_MAX, vista.w * fator))
    const caixa = svgRef.current?.getBoundingClientRect()
    if (!caixa) return
    // zoom ancorado no cursor: sem isto o ponto de interesse escapa da tela ao aproximar
    const fx = (e.clientX - caixa.left) / caixa.width
    const fy = (e.clientY - caixa.top) / caixa.height
    const alturaAtual = alturaVista()
    const alturaNova = nova * (tamanho.altura / tamanho.largura)
    setVista({ x: vista.x + (vista.w - nova) * fx, y: vista.y + (alturaAtual - alturaNova) * fy, w: nova })
  }

  /**
   * Fim de um arrasto de NÓ: persiste a posição em fração da moldura atual. Só no soltar,
   * não a cada `mousemove` — o que importa é onde o usuário deixou o nó, e gravar a cada
   * pixel encheria a fila de escrita à toa.
   */
  function encerrarArrasto() {
    const a = arrasto.current
    arrasto.current = null
    if (a?.tipo !== 'no' || !a.id) return
    salvarPosicaoTeia(escopo, idsDaTeia, a.id, paraFracao(pos(a.id), tamanho))
  }

  /**
   * Descarta o arranjo salvo desta teia. Pergunta antes porque não há desfazer: o arranjo é
   * trabalho manual do usuário, e recolocar dezenas de nós à mão não é reversão, é refazer.
   */
  async function voltarAoAutomatico() {
    const ok = await ask(
      'Voltar ao layout automático? O arranjo que você fez nesta teia é descartado, e não dá para desfazer.',
      { title: 'Grimório', kind: 'warning' },
    )
    if (!ok) return
    resetarLayoutTeia(escopo)
    setArrastados(posicoesEfetivas(LAYOUT_VAZIO, layout, tamanho))
  }

  function aoMover(e: React.MouseEvent) {
    const a = arrasto.current
    if (!a) return
    const { dx, dy } = paraUnidades(e.clientX - a.x, e.clientY - a.y)
    arrasto.current = { ...a, x: e.clientX, y: e.clientY }
    if (a.tipo === 'tela') {
      setVista((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
    } else if (a.id) {
      const atual = pos(a.id)
      setArrastados((m) => ({ ...m, [a.id!]: { x: atual.x + dx, y: atual.y + dy } }))
    }
  }

  /**
   * O miolo do nó: o retrato da entidade, ou o ícone do tipo quando não há retrato (ou ele
   * não abriu). Recortado no círculo e com `slice`, que é o `object-fit: cover` do SVG — sem
   * ele, um retrato retangular sairia espremido dentro do nó.
   */
  function miniatura(n: NoTeia) {
    const url = retratosLigados && n.retrato && !semImagem.has(n.id) ? urlDoRetrato(n.id, n.retrato) : null
    if (!url) {
      return <text className="grafo-no-icone" textAnchor="middle" dominantBaseline="central">{ICONE[n.tipo]}</text>
    }
    return (
      <image
        href={url}
        x={-RAIO_NO} y={-RAIO_NO} width={RAIO_NO * 2} height={RAIO_NO * 2}
        clipPath="url(#grafo-recorte-no)"
        preserveAspectRatio={alinhamentoSvg(n.retrato?.foco)}
        onError={() => setSemImagem((s) => (s.has(n.id) ? s : new Set(s).add(n.id)))}
      />
    )
  }

  function abrir(no: NoTeia) {
    if (no.tipo === 'personagem') abrirPerfil(no.id)
    else if (no.tipo === 'cenario') abrirCenario(no.id)
    else abrirItem(no.id)
  }

  function alternarTipo(t: TipoAlvoVinculo) {
    setOcultos((s) => {
      const nova = new Set(s)
      if (nova.has(t)) nova.delete(t)
      else nova.add(t)
      return nova
    })
  }

  const nomeCampanha = campanhaFiltro
    ? tree?.campanhas.find((c) => c.id === campanhaFiltro)?.nome ?? null
    : null

  return (
    <div className="grafo">
      <div className="ws-cabecalho">
        <span className="ws-titulo">🕸 Teia {nomeCampanha ? `— ${nomeCampanha}` : '— cofre inteiro'}</span>
        <span className="grafo-legenda">
          {TIPOS.map((t) => (
            <button
              key={t}
              className={`grafo-chip grafo-chip-${t}${ocultos.has(t) ? ' oculto' : ''}`}
              aria-pressed={!ocultos.has(t)}
              title={ocultos.has(t) ? `Mostrar ${ROTULO_TIPO[t]}` : `Ocultar ${ROTULO_TIPO[t]}`}
              onClick={() => alternarTipo(t)}
            >
              {ICONE[t]} {ROTULO_TIPO[t]}
            </button>
          ))}
        </span>
        <button
          className={`btn-icon${retratosLigados ? ' ativo' : ''}`}
          title={retratosLigados ? 'Ocultar retratos (deixa a teia mais leve)' : 'Mostrar retratos'}
          aria-pressed={retratosLigados}
          onClick={() => {
            const novo = !retratosLigados
            localStorage.setItem(CHAVE_RETRATOS, novo ? '1' : '0')
            setRetratosLigados(novo)
          }}
        >
          🖼
        </button>
        {/* Duas ações, dois botões. Enquadrar mexe só na CÂMERA e é reversível; voltar ao
            automático joga fora um arranjo feito à mão e não tem desfazer. Num botão só, quem
            quisesse recentrar a vista perdia o trabalho sem ter pedido nada disso. */}
        <button className="btn-icon" title="Enquadrar a teia na tela"
          onClick={() => setVista({ x: 0, y: 0, w: tamanho.largura })}>⤢</button>
        <button className="btn-icon" title="Voltar ao layout automático (descarta o arranjo salvo desta teia)"
          onClick={() => void voltarAoAutomatico()}>↺</button>
        <button className="btn-icon" title="Fechar a teia" onClick={alternarGrafo}>✕</button>
      </div>

      {teia.nos.length === 0 ? (
        <div className="grafo-vazio">
          {campanhaFiltro
            ? 'Nenhuma entidade participa desta campanha. Tire o filtro ou etiquete alguém com 🏷️.'
            : 'Nada para desenhar ainda. Crie personagens, cenários e itens, e ligue-os na aba Vínculos.'}
        </div>
      ) : (
        <>
          {teia.arestas.length === 0 && (
            <div className="grafo-aviso">
              As entidades existem, mas nenhuma relação foi cadastrada — abra uma ficha e use a aba Vínculos.
            </div>
          )}
          {teia.orfas > 0 && (
            <div className="grafo-aviso">
              {teia.orfas === 1
                ? '1 relação aponta para algo que não existe mais e não foi desenhada.'
                : `${teia.orfas} relações apontam para algo que não existe mais e não foram desenhadas.`}
            </div>
          )}
          {/* o wrapper é quem tem a altura: um <svg> com proporção intrínseca não encolhe
              sozinho dentro de um flex e vazaria por baixo do rodapé */}
          <div className="grafo-tela">
          <svg
            ref={svgRef}
            className={`grafo-svg${arrasto.current ? ' arrastando' : ''}`}
            viewBox={`${vista.x} ${vista.y} ${vista.w} ${alturaVista()}`}
            onWheel={aoRolar}
            onMouseDown={(e) => { arrasto.current = { tipo: 'tela', x: e.clientX, y: e.clientY }; setSelecionado(null) }}
            onMouseMove={aoMover}
            onMouseUp={encerrarArrasto}
            onMouseLeave={encerrarArrasto}
          >
            <defs>
              {/* um recorte só para todos os nós: eles têm o mesmo raio e são posicionados
                  por `translate`, então o círculo em (0,0) serve a qualquer um */}
              <clipPath id="grafo-recorte-no">
                <circle r={RAIO_NO} />
              </clipPath>
            </defs>
            <g className="grafo-arestas">
              {arestasVisiveis.map((a) => {
                const p1 = pos(a.de)
                const p2 = pos(a.para)
                const apagada = destacados !== null && a.de !== selecionado && a.para !== selecionado
                return (
                  <g key={`${a.de}|${a.para}`} className={apagada ? 'apagado' : ''}>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
                    <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 4} textAnchor="middle">
                      <title>{a.rotulo}</title>
                      {encurtar(a.rotulo)}
                    </text>
                  </g>
                )
              })}
            </g>
            <g className="grafo-nos">
              {visiveis.map((n) => {
                const p = pos(n.id)
                const apagado = destacados !== null && n.id !== selecionado && !destacados.has(n.id)
                return (
                  <g
                    key={n.id}
                    className={`grafo-no grafo-no-${n.tipo}${apagado ? ' apagado' : ''}${selecionado === n.id ? ' selecionado' : ''}`}
                    transform={`translate(${p.x} ${p.y})`}
                    onMouseDown={(e) => {
                      e.stopPropagation() // senão o arrasto do nó viraria arrasto da tela
                      arrasto.current = { tipo: 'no', id: n.id, x: e.clientX, y: e.clientY }
                      setSelecionado(n.id)
                    }}
                    onDoubleClick={() => abrir(n)}
                  >
                    <title>{n.resumo ? `${n.nome} — ${n.resumo}` : n.nome}{'\n'}(duplo clique abre a ficha)</title>
                    <circle className="grafo-no-fundo" r={RAIO_NO} />
                    {miniatura(n)}
                    {/* o anel vem DEPOIS da imagem: desenhado antes, o retrato cobriria a
                        metade interna dele e a cor do tipo ficaria fina e irregular */}
                    <circle className="grafo-no-anel" r={RAIO_NO} />
                    <text className="grafo-no-nome" y={RAIO_NO + 16} textAnchor="middle">{n.nome}</text>
                  </g>
                )
              })}
            </g>
          </svg>
          </div>
          <div className="grafo-rodape">
            {visiveis.length} {visiveis.length === 1 ? 'entidade' : 'entidades'} ·{' '}
            {arestasVisiveis.length} {arestasVisiveis.length === 1 ? 'relação' : 'relações'} ·{' '}
            zoom {Math.round((1 / escala()) * 100)}% · arraste para mover, roda para aproximar, duplo clique abre a ficha
          </div>
        </>
      )}
    </div>
  )
}
