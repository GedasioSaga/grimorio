/**
 * Montagem ÚNICA do editor de mapa: shapeUtils, tools, componentes de overlay, os side
 * effects de criação (banda de empilhamento + cor padrão de linha) e as ações do
 * `PainelPropriedades`. `MapaView.tsx` (app real, com `useDocumentoTldraw`/autosave/
 * camadas persistidas) e `src/amostra/CenaMapa.tsx` (bancada, documento em memória)
 * consomem os DOIS a partir daqui — nenhum dos dois copia lista de shapeUtils nem
 * reimplementa o handler de criação.
 *
 * O que fica de fora de propósito (é específico do app real, não pertence aqui):
 * repositório/cofre, caminho do arquivo, autosave, `useDocumentoTldraw`, e o sistema de
 * CAMADAS em si (nome, ocultar, travar, `PainelCamadas`) — só os dois GETTERS de que o
 * handler de criação precisa (`getCamadaAtivaId`/`getCamadaTravada`) atravessam a
 * fronteira, para que a bancada possa passar constantes fixas sem precisar montar
 * camadas de verdade.
 */
import { useEffect, useRef, useState } from 'react'
import {
  defaultShapeUtils,
  getIndexBetween,
  getIndicesBetween,
  sortByIndex,
  type Editor,
  type IndexKey,
  type TLAnyShapeUtilConstructor,
  type TLComponents,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
} from 'tldraw'
import { CharacterCardShapeUtil } from '../components/CharacterCardShape'
import { CenarioCardShapeUtil } from '../components/CenarioCardShape'
import { ItemCardShapeUtil } from '../components/ItemCardShape'
import { ItemMapaShapeUtil } from '../components/ItemMapaShape'
import { PortaShapeUtil } from '../components/PortaShape'
import { SimboloMapaShapeUtil } from '../components/SimboloMapaShape'
import { SalaMapaShapeUtil } from '../components/SalaMapaShape'
import { SalaPoligonoMapaShapeUtil } from '../components/SalaPoligonoMapaShape'
import { CorredorMapaShapeUtil } from '../components/CorredorMapaShape'
import { LinhaMapaShapeUtil } from '../components/LinhaMapaShape'
import { LinhaMapaColoridaShapeUtil } from '../components/LinhaMapaColoridaShapeUtil'
import { RetanguloMapaShapeUtil } from '../components/RetanguloMapaShape'
import { RetanguloMapaTool } from '../components/RetanguloMapaTool'
import { LinhaMapaTool } from '../components/LinhaMapaTool'
import { EscadaMapaShapeUtil } from '../components/EscadaMapaShape'
import { MuralhaMapaShapeUtil } from '../components/MuralhaMapaShape'
import { TorreMapaShapeUtil } from '../components/TorreMapaShape'
import { BorrachaTrechoMapaTool } from '../components/BorrachaTrechoMapaTool'
import { MapaToolbar } from '../components/MapaToolbar'
import { ControleZoom } from '../components/ControleZoom'
import { MedidasMapa } from '../components/MedidasMapa'
import { ReguasMapa } from '../components/ReguasMapa'
import { SelecaoPropriedadesBridge } from '../components/PainelPropriedades'
import {
  bandaDoTipo,
  limitesParaNovaForma,
  ordenarPorEmpilhamento,
  precisaReordenar,
  type FormaParaOrdenar,
} from './ordemMapa'
import { pecaDaFormaCriada } from './paletaMapa'
import { COR_LINHA_PADRAO, corDeForma } from './coresLinha'
import { CANTO_PADRAO, ehCantoMapa, type CantoMapa } from './cantosMapa'
import { aplicarCanto, setCantoAtivo } from './cantoAtivo'
import { QUADRADO_PX, quadradosParaPx } from './quadrados'

/**
 * `LinhaMapaColoridaShapeUtil` tem `type = 'line'`, o MESMO tipo nativo do tldraw — é um
 * override de cor da linha, não um shape novo (ver o porquê inteiro no cabeçalho do
 * arquivo dela). Passada em `shapeUtils` do `<Tldraw>`, ela troca no lugar da nativa por
 * tipo, mas o SCHEMA DO STORE não tem esse mecanismo: `createTLStore` recusa dois
 * shapeUtils com o mesmo `type` — por isso a `LineShapeUtil` nativa é filtrada de
 * `defaultShapeUtils` na hora de montar o store (`SHAPE_UTILS_DO_STORE_MAPA`, abaixo).
 */
export const SHAPE_UTILS_CUSTOM_MAPA = [
  CharacterCardShapeUtil,
  CenarioCardShapeUtil,
  ItemCardShapeUtil,
  ItemMapaShapeUtil,
  PortaShapeUtil,
  SimboloMapaShapeUtil,
  SalaMapaShapeUtil,
  SalaPoligonoMapaShapeUtil,
  CorredorMapaShapeUtil,
  LinhaMapaShapeUtil,
  LinhaMapaColoridaShapeUtil,
  EscadaMapaShapeUtil,
  MuralhaMapaShapeUtil,
  TorreMapaShapeUtil,
  RetanguloMapaShapeUtil,
]

/**
 * Lista para o SCHEMA do store (`createTLStore`/`useDocumentoTldraw`): defaults sem a
 * `line` nativa + as customizadas.
 *
 * É uma CONSTANTE, e não uma função, porque a identidade do array é contrato:
 * `useDocumentoTldraw` tem `shapeUtils` no array de dependências do efeito que monta o
 * store (`components/canvasDoc.ts`, e o aviso está escrito lá). Um array novo a cada
 * render refaz o store, que chama `setStore`, que re-renderiza, que gera outro array —
 * laço infinito. Na tela isso apareceu como o mapa PISCANDO e o canvas nunca terminando
 * de carregar, com os painéis (camadas, exportar) de pé em volta do vazio.
 *
 * A versão anterior desta linha era `export function shapeUtilsDoStoreMapa()`, chamada
 * inline no render do `MapaView`. A bancada não pegou o defeito porque monta o store uma
 * vez só, dentro de `useState(() => …)`, sem persistência — quem quiser mexer aqui,
 * lembre que a bancada NÃO exercita este caminho.
 */
export const SHAPE_UTILS_DO_STORE_MAPA: TLAnyShapeUtilConstructor[] = (() => {
  const tiposSubstituidos = new Set<string>(SHAPE_UTILS_CUSTOM_MAPA.map((u) => u.type))
  return [...defaultShapeUtils.filter((u) => !tiposSubstituidos.has(u.type)), ...SHAPE_UTILS_CUSTOM_MAPA]
})()

/**
 * Ferramentas próprias do mapa. As duas primeiras substituem uma nativa pelo `id` —
 * `<Tldraw tools={…}>` resolve a troca sozinho, como já era feito com a borracha:
 * - `BorrachaTrechoMapaTool` (`eraser`): em cima de uma divisória apaga só o trecho passado.
 * - `LinhaMapaTool` (`line`): clicar COLOCA um segmento em vez de deixar uma linha de
 *   comprimento zero grudada no cursor (ver `lib/linhaMapa.ts`).
 * - `RetanguloMapaTool` é ferramenta NOVA (id próprio), do retângulo do mapa.
 */
export const TOOLS_CUSTOM_MAPA = [BorrachaTrechoMapaTool, LinhaMapaTool, RetanguloMapaTool]

function MapaOverlayBase() {
  return (
    <>
      <MedidasMapa />
      <ReguasMapa />
      <SelecaoPropriedadesBridge />
    </>
  )
}

/**
 * Constante de módulo, não recriada a cada render — mas por um motivo DIFERENTE do
 * `getShapeVisibility`/`shapeUtils`/`tools`/`user`: esses sim estão no array de deps do
 * `useLayoutEffect` que CRIA o editor (node_modules/@tldraw/editor/src/lib/
 * TldrawEditor.tsx:509-521), então identidade nova ali recria o editor inteiro (perde
 * seleção/câmera/histórico). `components` NÃO está nessa lista — viaja por Context
 * (`EditorComponentsProvider`/`useShallowObjectIdentity`, TldrawEditor.tsx:309 +
 * useEditorComponents.tsx:38), comparado por chave. Mesmo assim mantemos a identidade
 * estável: se um valor de chave (`InFrontOfTheCanvas` etc.) fosse uma função nova a
 * cada render, React trataria como um COMPONENTE diferente e remontaria aquele slot
 * (perde o estado local dele) — sem destruir o editor, mas sem necessidade nenhuma.
 */
export const COMPONENTS_MAPA_BASE: TLComponents = {
  InFrontOfTheCanvas: MapaOverlayBase,
  Toolbar: MapaToolbar,
  NavigationPanel: ControleZoom,
}

/**
 * Toda escrita no eixo ORDEM/CAMADA precisa das duas flags. Elas não são otimização:
 *
 * `ignoreShapeLock` — `editor.updateShapes` DESCARTA EM SILÊNCIO qualquer partial sobre
 * shape travado, a menos que o próprio partial traga `isLocked: false`
 * (node_modules/@tldraw/editor/src/lib/editor/Editor.ts:8447-8459). Como o cadeado do
 * `PainelCamadas` trava TODOS os shapes da camada, sem esta flag travar uma camada
 * desligaria o empilhamento dela: subir a camada no painel não moveria nada, e numa pilha
 * mista os shapes pulados guardariam índices da mesma faixa que os reescritos — dois
 * `IndexKey` iguais, `sortByIndex` empatando, z-order e clique indefinidos, e o autosave
 * gravando isso no arquivo. Travar existe para impedir MOVER a peça à mão, não para
 * impedir a pilha de obedecer à própria camada.
 *
 * `history: 'ignore'` — a ordem é DERIVADA do estado das camadas, não uma edição. Sem a
 * flag, um Ctrl+Z desfaz a normalização e devolve a porta do andar de cima para baixo da
 * sala do de baixo, sem o usuário ter como saber o que aconteceu nem como reverter.
 */
export const OPCOES_ORDEM = { ignoreShapeLock: true, history: 'ignore' } as const

/** `meta.camada` de um shape, ou `undefined` quando a peça nunca foi carimbada. */
export function camadaDeMeta(meta: unknown): string | undefined {
  const camada = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>).camada : undefined
  return typeof camada === 'string' ? camada : undefined
}

/**
 * Handler de criação: forma nova nasce no TOPO do próprio rank de empilhamento — camada
 * por fora, banda por dentro (ver `ordemMapa.ts`), nunca no topo absoluto, que era o bug
 * "porta some atrás da sala criada depois". Se for divisória, já sai carimbada com a cor
 * padrão. Carimba também `meta.camada`/`meta.peca`/travamento herdado da camada ativa.
 *
 * `getOrdemCamadas` é lido A CADA criação, não capturado uma vez: a ordem muda enquanto o
 * mapa está aberto (o usuário sobe/desce camada no painel) e uma cópia velha colocaria a
 * peça nova na altura de uma pilha que não existe mais.
 *
 * Devolve o cancelador do `registerBeforeCreateHandler` — quem chama decide quando
 * desregistrar (unmount do editor).
 */
export function registrarBeforeCreateMapa(
  editor: Editor,
  opts: {
    getCamadaAtivaId: () => string
    getCamadaTravada: (id: string) => boolean
    /** ids das camadas do fundo pro topo; ausente = mapa sem camadas (bancada, doc antigo). */
    getOrdemCamadas?: () => readonly string[]
    /** canto escolhido na barra para as PRÓXIMAS peças de desenho; ausente = `CANTO_PADRAO`. */
    getCantoPadrao?: () => CantoMapa
  },
): () => void {
  return editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) => {
    if (source !== 'user') return shape
    const metaAtual = shape.meta as Record<string, unknown>
    let formaComMeta = shape
    if (typeof metaAtual.camada !== 'string') {
      const ativa = opts.getCamadaAtivaId()
      const travadaPelaCamada = opts.getCamadaTravada(ativa)
      const peca = pecaDaFormaCriada(shape as Parameters<typeof pecaDaFormaCriada>[0])
      formaComMeta = {
        ...shape,
        meta: {
          ...shape.meta,
          camada: ativa,
          ...(peca ? { peca } : {}),
          ...(travadaPelaCamada ? { travadoPelaCamada: true } : {}),
        },
        isLocked: travadaPelaCamada ? true : shape.isLocked,
      }
    }
    if (formaComMeta.type === 'line' && typeof (formaComMeta.meta as Record<string, unknown>).corPersonalizada !== 'string') {
      formaComMeta = {
        ...formaComMeta,
        meta: { ...formaComMeta.meta, corPersonalizada: COR_LINHA_PADRAO },
      }
    }

    /**
     * Canto escolhido na barra vale para as LINHAS novas — o mesmo controle que o
     * Excalidraw chama de "Edges: sharp/round". Só a linha passa por aqui: nela o canto
     * mora em `meta`, porque o tipo `line` é nativo e não aceita prop nova (ver
     * `LinhaMapaColoridaShapeUtil`), e `meta` não ganha valor padrão de lugar nenhum. O
     * retângulo é peça própria e resolve o mesmo no `getDefaultProps` dele, que é onde o
     * tldraw espera que um valor de nascença de `props` seja decidido.
     *
     * Só carimba quando a linha ainda não trouxe escolha própria — colar, duplicar ou
     * importar preserva o canto que já vinha na peça.
     */
    if (formaComMeta.type === 'line' && !ehCantoMapa((formaComMeta.meta as Record<string, unknown>).cantos)) {
      const cantoPadrao = opts.getCantoPadrao?.() ?? CANTO_PADRAO
      formaComMeta = { ...formaComMeta, meta: { ...formaComMeta.meta, cantos: cantoPadrao } }
    }

    // amostra da legenda (`meta.decorativo`) nasce sempre no topo — banda não se aplica a ela.
    if ((formaComMeta.meta as Record<string, unknown>).decorativo === true) return formaComMeta

    const ordemCamadas = opts.getOrdemCamadas?.() ?? []
    const irmaos = editor
      .getSortedChildIdsForParent(formaComMeta.parentId)
      .map((id) => editor.getShape(id))
      .filter((s): s is TLShape => !!s && (s.meta as Record<string, unknown>).decorativo !== true)
      .map((s) => ({ index: s.index as string, banda: bandaDoTipo(s.type), camada: camadaDeMeta(s.meta) }))
    const { abaixo, acima } = limitesParaNovaForma(
      irmaos,
      { banda: bandaDoTipo(formaComMeta.type), camada: camadaDeMeta(formaComMeta.meta) },
      ordemCamadas,
    )

    return {
      ...formaComMeta,
      index: getIndexBetween(abaixo as IndexKey | undefined, acima as IndexKey | undefined),
    }
  })
}

/**
 * Reaplica a ordem de empilhamento inteira da página, por PARENTE (página ou grupo —
 * `ordenarPorEmpilhamento` só ordena entre irmãos do mesmo pai). Passe único, não reativo:
 * não corre risco de loop. Chamado em três momentos, todos com a mesma necessidade:
 *
 * 1. **Mount** — mapas com peças criadas ANTES deste handler existir (carregar um snapshot
 *    não passa pelo `registerBeforeCreateHandler`) têm a ordem que sobrou da CRIAÇÃO.
 * 2. **Camada reordenada/criada/excluída** — o rank de todas as peças daquelas camadas
 *    mudou de uma vez; sem este passe, subir uma camada no painel não moveria nada na tela.
 * 3. **Peça movida de camada** — o `index` dela precisa saltar para a faixa da camada nova.
 *
 * Devolve quantos shapes tiveram o `index` reescrito, para quem chamar poder decidir se
 * houve mudança (usado pelos testes; a UI ignora).
 */
export function normalizarOrdemMapa(
  editor: Editor,
  ordemCamadas: readonly string[] = [],
  opcoes: { registrarNoHistorico?: boolean } = {},
): number {
  const porPai = new Map<string, TLShape[]>()
  for (const s of editor.getCurrentPageShapes()) {
    const lista = porPai.get(s.parentId)
    if (lista) lista.push(s)
    else porPai.set(s.parentId, [s])
  }
  const mudancasDeOrdem: TLShapePartial[] = []
  for (const shapesDoPai of porPai.values()) {
    const ordenadasPeloIndiceAtual = [...shapesDoPai].sort(sortByIndex)
    const formas: FormaParaOrdenar[] = ordenadasPeloIndiceAtual.map((s) => ({
      id: s.id,
      banda: bandaDoTipo(s.type),
      camada: camadaDeMeta(s.meta),
      decorativo: (s.meta as Record<string, unknown>).decorativo === true,
    }))
    if (!precisaReordenar(formas, ordemCamadas)) continue
    const ordemAlvo = ordenarPorEmpilhamento(formas, ordemCamadas)
    const novosIndices = getIndicesBetween(null, null, ordemAlvo.length)
    ordemAlvo.forEach((id, i) => {
      const shape = editor.getShape(id as TLShapeId)
      if (shape) mudancasDeOrdem.push({ id: shape.id, type: shape.type, index: novosIndices[i] } as TLShapePartial)
    })
  }
  if (mudancasDeOrdem.length) {
    /**
     * `registrarNoHistorico` existe para UM caso: mover a seleção de camada. Ali a mudança
     * de `meta.camada` É edição do usuário e entra no histórico — se a reordenação que vem
     * junto ficasse fora, um Ctrl+Z devolveria a camada antiga e deixaria o `index` da
     * camada nova, com a peça desenhada na altura errada até a próxima ação de painel.
     * Undo tem que desfazer as duas metades ou nenhuma.
     */
    editor.run(
      () => editor.updateShapes(mudancasDeOrdem),
      opcoes.registrarNoHistorico ? { ignoreShapeLock: true } : OPCOES_ORDEM,
    )
  }
  return mudancasDeOrdem.length
}

/** Handlers que o `PainelPropriedades` chama, todos batendo direto no editor via `editorRef`. */
export interface AcoesPainelPropriedadesMapa {
  aoAplicarX: (id: TLShapeId, quadrados: number) => void
  aoAplicarY: (id: TLShapeId, quadrados: number) => void
  aoAplicarL: (id: TLShapeId, quadrados: number) => void
  aoAplicarA: (id: TLShapeId, quadrados: number) => void
  aoTrocarEstado: (id: TLShapeId, estado: string) => void
  aoRenomearSala: (id: TLShapeId, nome: string) => void
  aoTrocarCor: (id: TLShapeId, cor: string) => void
  aoVincularCenario: (id: TLShapeId, cenarioId: string) => void
  aoTrocarCorLinha: (id: TLShapeId, cor: string) => void
  pegandoCorLinhaId: TLShapeId | null
  aoIniciarContaGotasLinha: (id: TLShapeId | null) => void
  aoTrocarCantos: (id: TLShapeId, canto: CantoMapa) => void
  aoTrocarEspessura: (id: TLShapeId, espessura: number) => void
  aoTrocarPreenchido: (id: TLShapeId, preenchido: boolean) => void
}

/**
 * As mesmas ações do `PainelPropriedades`, extraídas do `MapaView` — nenhuma delas toca
 * cofre/autosave, é tudo `editor.updateShape`/`editor.resizeShape` puro, então cabem aqui
 * sem violar a fronteira do módulo. Inclui o conta-gotas: um listener de UM clique em fase
 * de CAPTURA no container do editor, pra interceptar o clique antes da seleção nativa do
 * tldraw reagir a ele (ver detalhe completo no comentário original do MapaView).
 */
export function usePainelPropriedadesMapa(editorRef: React.RefObject<Editor | null>): AcoesPainelPropriedadesMapa {
  const [pegandoCorParaId, setPegandoCorParaId] = useState<TLShapeId | null>(null)

  function aoAplicarX(id: TLShapeId, quadrados: number) {
    const editor = editorRef.current
    if (!editor) return
    const shape = editor.getShape(id)
    const bounds = editor.getShapePageBounds(id)
    if (!shape || !bounds) return
    const local = editor.getPointInParentSpace(id, { x: quadradosParaPx(quadrados, QUADRADO_PX), y: bounds.y })
    editor.updateShape({ id, type: shape.type, x: local.x, y: local.y } as TLShapePartial)
  }

  function aoAplicarY(id: TLShapeId, quadrados: number) {
    const editor = editorRef.current
    if (!editor) return
    const shape = editor.getShape(id)
    const bounds = editor.getShapePageBounds(id)
    if (!shape || !bounds) return
    const local = editor.getPointInParentSpace(id, { x: bounds.x, y: quadradosParaPx(quadrados, QUADRADO_PX) })
    editor.updateShape({ id, type: shape.type, x: local.x, y: local.y } as TLShapePartial)
  }

  function aoAplicarL(id: TLShapeId, quadrados: number) {
    const editor = editorRef.current
    if (!editor) return
    const bounds = editor.getShapePageBounds(id)
    if (!bounds || bounds.w <= 0) return
    const larguraAlvoPx = quadradosParaPx(quadrados, QUADRADO_PX)
    editor.resizeShape(id, { x: larguraAlvoPx / bounds.w, y: 1 }, { scaleOrigin: { x: bounds.x, y: bounds.y } })
  }

  function aoAplicarA(id: TLShapeId, quadrados: number) {
    const editor = editorRef.current
    if (!editor) return
    const bounds = editor.getShapePageBounds(id)
    if (!bounds || bounds.h <= 0) return
    const alturaAlvoPx = quadradosParaPx(quadrados, QUADRADO_PX)
    editor.resizeShape(id, { x: 1, y: alturaAlvoPx / bounds.h }, { scaleOrigin: { x: bounds.x, y: bounds.y } })
  }

  function aoTrocarEstado(id: TLShapeId, estado: string) {
    const editor = editorRef.current
    const shape = editor?.getShape(id)
    if (!editor || !shape) return
    editor.updateShape({ id, type: shape.type, props: { estado } } as Parameters<typeof editor.updateShape>[0])
  }

  function aoRenomearSala(id: TLShapeId, nome: string) {
    const editor = editorRef.current
    const shape = editor?.getShape(id)
    if (!editor || !shape) return
    if (shape.type !== 'sala-mapa' && shape.type !== 'simbolo-mapa') return
    editor.updateShape({ id, type: shape.type, props: { rotulo: nome } } as Parameters<typeof editor.updateShape>[0])
  }

  function aoTrocarCor(id: TLShapeId, cor: string) {
    const editor = editorRef.current
    const shape = editor?.getShape(id)
    if (!editor || !shape || shape.type !== 'sala-mapa') return
    editor.updateShape({ id, type: shape.type, props: { cor } } as Parameters<typeof editor.updateShape>[0])
  }

  function aoVincularCenario(id: TLShapeId, cenarioId: string) {
    const editor = editorRef.current
    const shape = editor?.getShape(id)
    if (!editor || !shape || shape.type !== 'sala-mapa') return
    editor.updateShape({ id, type: shape.type, props: { cenarioId } } as Parameters<typeof editor.updateShape>[0])
  }

  /**
   * Cor da peça de desenho. Mora em lugares diferentes por um motivo que não é escolha:
   * `line` é tipo NATIVO do tldraw e não aceita prop nova (o schema do store recusa —
   * ver `LinhaMapaColoridaShapeUtil`), então a cor vai em `meta.corPersonalizada`; o
   * retângulo é peça própria e guarda em `props.cor`, como qualquer peça do mapa.
   */
  function aoTrocarCorLinha(id: TLShapeId, cor: string) {
    const editor = editorRef.current
    const shape = editor?.getShape(id)
    if (!editor || !shape) return
    if (shape.type === 'line') {
      editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, corPersonalizada: cor } } as TLShapePartial)
      return
    }
    if (shape.type === 'retangulo-mapa') {
      editor.updateShape({ id, type: shape.type, props: { cor } } as TLShapePartial)
    }
  }

  /** Canto reto/arredondado. Onde cada tipo guarda a escolha está em `lib/cantoAtivo.ts`. */
  function aoTrocarCantos(id: TLShapeId, canto: CantoMapa) {
    const editor = editorRef.current
    if (!editor) return
    aplicarCanto(editor, [id], canto)
    // a escolha do painel também vira o padrão das próximas peças — mesmo par de botões
    // que existe na barra, então as duas superfícies não podem discordar.
    setCantoAtivo(editor, canto)
  }

  function aoTrocarEspessura(id: TLShapeId, espessura: number) {
    const editor = editorRef.current
    const shape = editor?.getShape(id)
    if (!editor || !shape || shape.type !== 'retangulo-mapa' || espessura <= 0) return
    editor.updateShape({ id, type: shape.type, props: { espessura } } as TLShapePartial)
  }

  function aoTrocarPreenchido(id: TLShapeId, preenchido: boolean) {
    const editor = editorRef.current
    const shape = editor?.getShape(id)
    if (!editor || !shape || shape.type !== 'retangulo-mapa') return
    editor.updateShape({ id, type: shape.type, props: { preenchido } } as TLShapePartial)
  }

  useEffect(() => {
    const editor = editorRef.current
    if (!pegandoCorParaId || !editor) return
    const alvoId = pegandoCorParaId
    const container = editor.getContainer()
    editor.setCursor({ type: 'cross', rotation: 0 })

    function aoClicarNoCanvas(e: PointerEvent) {
      e.preventDefault()
      e.stopPropagation()
      const pagina = editor!.screenToPage({ x: e.clientX, y: e.clientY })
      const alvo = editor!.getShapeAtPoint(pagina, { hitInside: true, filter: (s) => s.id !== alvoId })
      const cor = alvo ? corDeForma(alvo) : null
      if (cor) aoTrocarCorLinha(alvoId, cor)
      setPegandoCorParaId(null)
    }
    function aoApertarEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setPegandoCorParaId(null)
    }

    container.addEventListener('pointerdown', aoClicarNoCanvas, { capture: true })
    window.addEventListener('keydown', aoApertarEscape)
    return () => {
      container.removeEventListener('pointerdown', aoClicarNoCanvas, { capture: true })
      window.removeEventListener('keydown', aoApertarEscape)
      editor.setCursor({ type: 'default', rotation: 0 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pegandoCorParaId])

  return {
    aoAplicarX,
    aoAplicarY,
    aoAplicarL,
    aoAplicarA,
    aoTrocarEstado,
    aoRenomearSala,
    aoTrocarCor,
    aoVincularCenario,
    aoTrocarCorLinha,
    pegandoCorLinhaId: pegandoCorParaId,
    aoIniciarContaGotasLinha: setPegandoCorParaId,
    aoTrocarCantos,
    aoTrocarEspessura,
    aoTrocarPreenchido,
  }
}

/** Editor mais recente numa ref, sempre pronto pro hook acima sem exigir um `useRef` próprio de cada consumidor. */
export function useEditorRefMapa() {
  return useRef<Editor | null>(null)
}
