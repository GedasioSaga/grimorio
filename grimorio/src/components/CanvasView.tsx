import { useEffect, useRef, useState } from 'react'
import {
  AssetRecordType,
  Tldraw,
  createShapeId,
  createTLStore,
  defaultShapeUtils,
  getSnapshot,
  loadSnapshot,
  toRichText,
  uniqueId,
  type Editor,
  type TLAssetStore,
  type TLEditorSnapshot,
  type TLImageShape,
  type TLShapeId,
  type TLStore,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { convertFileSrc } from '@tauri-apps/api/core'
import { save, message } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import type { VaultRepo } from '../lib/vaultRepo'
import type { PastaCenarioNode, Vinculo } from '../lib/types'
import { slugify } from '../lib/slug'
import { caminhoAbsolutoImagem } from '../lib/caminhos'
import { mimeDaImagem, uint8ParaBase64 } from '../lib/bin'
import {
  CARD_ALTURA_PADRAO,
  CARD_LARGURA_PADRAO,
  CharacterCardShapeUtil,
  type CharacterCardShapeType,
} from './CharacterCardShape'
import { CenarioCardShapeUtil, type CenarioCardShapeType } from './CenarioCardShape'
import { ItemCardShapeUtil, type ItemCardShapeType } from './ItemCardShape'
import { MIME_CENARIO } from './CenariosSoltos'
import { MIME_ITEM } from './ItensSoltos'
import { relRetratoDoCard, type ShapeMinimo } from '../lib/copiaImagemCard'
import { copiarImagemParaClipboard } from '../lib/copiarImagem'
import { ROTULO_TIPO, destinoRetrato, extensaoDe, sugestaoDeNome } from '../lib/transformarImagem'
import { versaoAtiva } from '../lib/cenarioVersao'
import { versaoAtivaPersonagem } from '../lib/personagemVersao'
import { pedirTexto } from './dialogos'
import { associarEscolhendoCampanhas } from './dialogoCampanhas'
import { pedirTransformacao } from './dialogoTransformar'
import { paresParaLigar } from '../lib/ligacaoCenario'
import { agruparPorPar } from '../lib/vinculos'
import { registrarEditor, desregistrarEditor } from '../lib/canvasAtivo'

const AUTOSAVE_DEBOUNCE_MS = 1000

// Constantes em nível de módulo: arrays recriados a cada render remontam o editor.
// `shapeUtilsCustom` vai na prop `shapeUtils` do <Tldraw> (que soma aos defaults);
// o store precisa do schema completo (defaults + customizados).
const shapeUtilsCustom = [CharacterCardShapeUtil, CenarioCardShapeUtil, ItemCardShapeUtil]
const shapeUtilsDoStore = [...defaultShapeUtils, CharacterCardShapeUtil, CenarioCardShapeUtil, ItemCardShapeUtil]

const MIME_PERSONAGEM = 'application/x-grimorio-personagem'
const MIME_IMAGEM = 'application/x-grimorio-imagem'

/**
 * Entidades que viram card ao serem soltas no mapa: MIME arrastado da sidebar →
 * shape criado e nome da prop que guarda o id. Ordem irrelevante (um drag carrega um MIME só).
 */
const DROPS_DE_ENTIDADE = [
  { mime: MIME_CENARIO, tipo: 'cenario-card', propId: 'cenarioId' },
  { mime: MIME_PERSONAGEM, tipo: 'character-card', propId: 'personagemId' },
  { mime: MIME_ITEM, tipo: 'item-card', propId: 'itemId' },
] as const

// Fallback quando o tamanho natural da imagem não pôde ser lido (arquivo ausente/corrompido).
const IMG_FALLBACK_LARGURA = 320
const IMG_FALLBACK_ALTURA = 240

/**
 * Asset store do tldraw: imagens coladas/arrastadas vão para `<cofre>/imagens-canvas/`.
 * O snapshot guarda só o caminho RELATIVO em `meta.rel`; `resolve()` remonta a URL
 * a partir do vaultPath atual — o cofre continua portátil entre máquinas.
 */
function criarAssetStore(vaultPath: string, repo: VaultRepo): TLAssetStore {
  return {
    async upload(_asset, file) {
      const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'png').toLowerCase()
      const rel = `imagens-canvas/${uniqueId()}.${ext}`
      const bytes = new Uint8Array(await file.arrayBuffer())
      await repo.escreverBinario(rel, uint8ParaBase64(bytes))
      return { src: convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel)), meta: { rel } }
    },
    resolve(asset) {
      const rel = (asset.meta as { rel?: string } | undefined)?.rel
      return rel ? convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel)) : asset.props.src
    },
  }
}

/** Ponto único de criação do store do tldraw. */
function criarStoreCanvas(vaultPath: string, repo: VaultRepo): TLStore {
  return createTLStore({
    shapeUtils: shapeUtilsDoStore,
    assets: criarAssetStore(vaultPath, repo),
  })
}

/** Lê o tamanho natural da imagem; devolve fallback se o arquivo não carregar. */
function medirImagem(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () =>
      resolve({ w: img.naturalWidth || IMG_FALLBACK_LARGURA, h: img.naturalHeight || IMG_FALLBACK_ALTURA })
    img.onerror = () => resolve({ w: IMG_FALLBACK_LARGURA, h: IMG_FALLBACK_ALTURA })
    img.src = url
  })
}

/**
 * Solta no mapa uma imagem que referencia o MESMO arquivo do cofre (ex.: imagens-notas/…),
 * sem copiar. O asset guarda `meta.rel`; o `resolve()` do asset store remonta o `src` a partir
 * do vaultPath atual — portável entre máquinas, igual às imagens coladas no canvas.
 */
async function soltarImagemNoMapa(
  editor: Editor,
  vaultPath: string,
  rel: string,
  clientX: number,
  clientY: number,
) {
  const url = convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel))
  const dims = await medirImagem(url)
  const assetId = AssetRecordType.createId()
  editor.createAssets([
    {
      id: assetId,
      typeName: 'asset',
      type: 'image',
      props: {
        name: rel.split('/').pop() ?? 'imagem',
        src: url,
        w: dims.w,
        h: dims.h,
        mimeType: mimeDaImagem(rel),
        isAnimated: false,
      },
      meta: { rel },
    },
  ])
  const ponto = editor.screenToPage({ x: clientX, y: clientY })
  editor.createShape({
    id: createShapeId(),
    type: 'image',
    x: ponto.x - dims.w / 2,
    y: ponto.y - dims.h / 2,
    props: { assetId, w: dims.w, h: dims.h },
  })
}

// Âncora comum aos dois terminais da seta de hierarquia (centro do card, sem snap).
const ANCORA_SETA = { normalizedAnchor: { x: 0.5, y: 0.5 }, isPrecise: false, isExact: false, snap: 'none' } as const

/** True se já existe uma seta ligando os shapes `a` e `b` (qualquer direção). */
function existeSetaEntre(editor: Editor, a: TLShapeId, b: TLShapeId): boolean {
  for (const bind of editor.getBindingsToShape(a, 'arrow')) {
    const bindsDoArrow = editor.getBindingsFromShape(bind.fromId, 'arrow')
    if (bindsDoArrow.some((x) => x.toId === b)) return true
  }
  return false
}

/** Cria uma seta de→para com bindings (segue os cards); rótulo opcional no meio. */
function criarSeta(editor: Editor, deShape: TLShapeId, paraShape: TLShapeId, rotulo?: string) {
  const arrowId = createShapeId()
  editor.createShape({
    id: arrowId,
    type: 'arrow',
    x: 0,
    y: 0,
    ...(rotulo ? { props: { richText: toRichText(rotulo) } } : {}),
  })
  editor.createBindings([
    { type: 'arrow', fromId: arrowId, toId: deShape, props: { terminal: 'start', ...ANCORA_SETA } },
    { type: 'arrow', fromId: arrowId, toId: paraShape, props: { terminal: 'end', ...ANCORA_SETA } },
  ])
}

/** Shapes de card por id de entidade. Supõe que UUIDs das três entidades não colidem. */
function cardsPorEntidade(editor: Editor): Map<string, TLShapeId[]> {
  const mapa = new Map<string, TLShapeId[]>()
  for (const s of editor.getCurrentPageShapes()) {
    let eid: string | null = null
    if (s.type === 'cenario-card') eid = (s as CenarioCardShapeType).props.cenarioId
    else if (s.type === 'character-card') eid = (s as CharacterCardShapeType).props.personagemId
    else if (s.type === 'item-card') eid = (s as ItemCardShapeType).props.itemId
    if (!eid) continue
    const lista = mapa.get(eid) ?? []
    lista.push(s.id)
    mapa.set(eid, lista)
  }
  return mapa
}

/** Liga o cenário recém-dropado aos cards de pai/filhos já presentes no canvas. */
function ligarCenarioNoCanvas(
  editor: Editor,
  cards: Map<string, TLShapeId[]>,
  raiz: PastaCenarioNode,
  cenarioId: string,
) {
  for (const { paiId, filhoId } of paresParaLigar(raiz, cenarioId)) {
    for (const ps of cards.get(paiId) ?? []) {
      for (const fs of cards.get(filhoId) ?? []) {
        if (!existeSetaEntre(editor, ps, fs)) criarSeta(editor, ps, fs)
      }
    }
  }
}

/**
 * Liga a entidade recém-dropada aos cards presentes com relação direta.
 * Uma seta por par (de → para do primeiro vínculo); múltiplos tipos viram "a · b".
 */
function ligarRelacoesNoCanvas(
  editor: Editor,
  cards: Map<string, TLShapeId[]>,
  vinculos: Vinculo[],
  entidadeId: string,
) {
  // Defesa p/ call sites futuros: sem card da própria entidade, não há o que ligar.
  if (!cards.has(entidadeId)) return
  for (const { deId, paraId, tipos } of agruparPorPar(vinculos, entidadeId)) {
    for (const ds of cards.get(deId) ?? []) {
      for (const ps of cards.get(paraId) ?? []) {
        if (!existeSetaEntre(editor, ds, ps)) criarSeta(editor, ds, ps, tipos.join(' · '))
      }
    }
  }
}

/**
 * Espaço numa imagem solta: cria a entidade escolhida com a imagem como retrato e
 * troca o shape de imagem pelo card correspondente, no mesmo lugar do canvas.
 * A cópia do arquivo segue o padrão de retrato de cada entidade; a imagem original
 * em imagens-canvas/ fica intocada (outros canvases podem referenciá-la).
 */
async function transformarImagemEmEntidade(editor: Editor, shape: TLImageShape) {
  const { repo, vaultPath } = useApp.getState()
  if (!repo || !vaultPath) return
  const asset = shape.props.assetId ? editor.getAsset(shape.props.assetId) : null
  const rel = (asset?.meta as { rel?: string } | undefined)?.rel
  if (!rel) {
    await message('Esta imagem não tem arquivo no cofre — não dá para transformar.', {
      title: 'Grimório',
      kind: 'warning',
    })
    return
  }
  const escolha = await pedirTransformacao()
  if (!escolha) return
  const { tipo, dir: dirEscolhido, novaPasta } = escolha
  const nome = await pedirTexto(
    `Nome do ${ROTULO_TIPO[tipo].toLowerCase()}:`,
    sugestaoDeNome(asset?.type === 'image' ? asset.props.name : ''),
    'Criar',
  )
  if (!nome) return

  try {
    // pasta nova só nasce depois do nome confirmado: cancelar não deixa pasta órfã
    const dir = novaPasta ? (await repo.criarPasta(dirEscolhido, novaPasta)).caminho : dirEscolhido
    const ext = extensaoDe(rel)
    const origem = caminhoAbsolutoImagem(vaultPath, rel)
    let entidadeId: string
    let cardTipo: 'character-card' | 'cenario-card' | 'item-card'
    let propId: 'personagemId' | 'cenarioId' | 'itemId'

    if (tipo === 'personagem') {
      const ref = await repo.criarPersonagemEm(dir, nome)
      const p = await repo.lerPersonagem(ref.caminho)
      const destino = destinoRetrato(tipo, { id: ref.id, caminho: ref.caminho, versaoAtivaId: p.versaoAtivaId }, ext)
      await repo.copiarParaCofre(origem, destino)
      versaoAtivaPersonagem(p).retrato = destino
      p.modificadoEm = new Date().toISOString()
      await repo.salvarPersonagem(ref.caminho, p)
      await associarEscolhendoCampanhas('personagem', ref.id, nome, dirEscolhido)
      entidadeId = ref.id
      cardTipo = 'character-card'
      propId = 'personagemId'
    } else if (tipo === 'cenario') {
      const ref = await repo.criarCenarioEm(dir, nome)
      const c = await repo.lerCenario(ref.caminho)
      const destino = destinoRetrato(tipo, { id: ref.id, caminho: ref.caminho, versaoAtivaId: c.versaoAtivaId }, ext)
      await repo.copiarParaCofre(origem, destino)
      versaoAtiva(c).retrato = destino
      c.modificadoEm = new Date().toISOString()
      await repo.salvarCenario(ref.caminho, c)
      await associarEscolhendoCampanhas('cenario', ref.id, nome, dirEscolhido)
      entidadeId = ref.id
      cardTipo = 'cenario-card'
      propId = 'cenarioId'
    } else {
      const ref = await repo.criarItemEm(dir, nome)
      const item = await repo.lerItem(ref.caminho)
      const destino = destinoRetrato(tipo, { id: ref.id, caminho: ref.caminho }, ext)
      await repo.copiarParaCofre(origem, destino)
      item.retrato = destino
      item.modificadoEm = new Date().toISOString()
      await repo.salvarItem(ref.caminho, item)
      await associarEscolhendoCampanhas('item', ref.id, nome, dirEscolhido)
      entidadeId = ref.id
      cardTipo = 'item-card'
      propId = 'itemId'
    }

    // card lê a entidade do cache do store: recarregar ANTES de criar o shape.
    // NÃO reler vínculos aqui: definirCampanhas acabou de atualizá-los em memória
    // com gravação debounced — carregarVinculos() leria o disco ainda velho e
    // apagaria a associação recém-escolhida.
    const app = useApp.getState()
    await app.recarregarArvore()
    if (tipo === 'personagem') await app.carregarPersonagens()
    else if (tipo === 'cenario') await app.carregarCenarios()
    else await app.carregarItens()

    // Batch: remoção da imagem + card + setas viram UM passo de undo.
    editor.run(() => {
      editor.deleteShapes([shape.id])
      editor.createShape({
        id: createShapeId(),
        type: cardTipo,
        x: shape.x + (shape.props.w - CARD_LARGURA_PADRAO) / 2,
        y: shape.y + (shape.props.h - CARD_ALTURA_PADRAO) / 2,
        props: { [propId]: entidadeId },
      })
      const cards = cardsPorEntidade(editor)
      ligarRelacoesNoCanvas(editor, cards, useApp.getState().vinculos, entidadeId)
      if (cardTipo === 'cenario-card') {
        const raiz = useApp.getState().tree?.cenarios
        if (raiz) ligarCenarioNoCanvas(editor, cards, raiz, entidadeId)
      }
    })
  } catch (e) {
    await message(`Falha ao transformar a imagem: ${e}`, { title: 'Grimório', kind: 'error' })
  }
}

export function CanvasView({ caminho, nome }: { caminho: string; nome: string }) {
  const repo = useApp((s) => s.repo)
  const vaultPath = useApp((s) => s.vaultPath)
  const recargasDoDisco = useApp((s) => s.recargasDoDisco)
  const [store, setStore] = useState<TLStore | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvandoErro, setSalvandoErro] = useState<string | null>(null)
  const [copiaOk, setCopiaOk] = useState(false)
  const [copiaErro, setCopiaErro] = useState<string | null>(null)
  const editorRef = useRef<Editor | null>(null)
  // Ref e não `let` do efeito: o efeito de releitura precisa saber se há gravação pendente.
  const timerAutosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Valor do mount, para a releitura ignorar a primeira rodada do efeito (o load inicial já leu).
  const recargasVistasRef = useRef(recargasDoDisco)

  // carrega o snapshot do arquivo e monta o store
  useEffect(() => {
    let ativo = true
    async function carregar() {
      if (!repo || !vaultPath) return
      try {
        const doc = await repo.lerCanvasDoc(caminho)
        if (!ativo) return
        const s = criarStoreCanvas(vaultPath, repo)
        if (doc.documento) loadSnapshot(s, doc.documento as Partial<TLEditorSnapshot>)
        setStore(s)
      } catch (e) {
        if (ativo) setErro(String(e))
      }
    }
    carregar()
    return () => {
      ativo = false
    }
  }, [repo, vaultPath, caminho])

  // autosave com debounce; descarrega gravação pendente ao desmontar
  useEffect(() => {
    if (!store || !repo) return
    const storeAtual = store
    const repoAtual = repo

    async function salvar() {
      const { document, session } = getSnapshot(storeAtual)
      try {
        await repoAtual.salvarDocumentoCanvas(caminho, { document, session })
        setSalvandoErro(null)
      } catch (e) {
        setSalvandoErro(String(e))
      }
    }

    const unlisten = store.listen(
      () => {
        if (timerAutosaveRef.current) clearTimeout(timerAutosaveRef.current)
        timerAutosaveRef.current = setTimeout(() => {
          timerAutosaveRef.current = null
          void salvar()
        }, AUTOSAVE_DEBOUNCE_MS)
      },
      { scope: 'document', source: 'user' },
    )

    return () => {
      unlisten()
      if (timerAutosaveRef.current) {
        // havia gravação pendente: cancela o debounce e grava já.
        // VaultRepo serializa escritas por caminho, então fire-and-forget é seguro.
        clearTimeout(timerAutosaveRef.current)
        timerAutosaveRef.current = null
        salvar().catch((e) => console.error('Falha no save final do canvas:', e))
      }
    }
  }, [store, repo, caminho])

  /**
   * Relê o arquivo quando o sync escreveu no cofre (`recargasDoDisco` subiu). O snapshot vive
   * num store do tldraw que `recarregarDoDisco` não alcança: sem isto, o canvas aberto continua
   * mostrando o retrato de antes do download, e a PRÓXIMA edição grava esse retrato velho por
   * cima do arquivo baixado — divergência real, que vira cópia de conflito.
   *
   * Com autosave pendente a releitura é pulada: a edição do usuário ainda não chegou ao disco,
   * e reler agora a descartaria. Local vence — a mesma escolha de `recarregarDoDisco` para as
   * entidades, e o motor de sync trata a divergência honestamente no ciclo seguinte.
   *
   * `mergeRemoteChanges` marca a carga como `source: 'remote'`: o listener do autosave (acima,
   * `source: 'user'`) não dispara, senão cada releitura regravaria o arquivo recém-baixado.
   */
  useEffect(() => {
    if (recargasDoDisco === recargasVistasRef.current) return
    recargasVistasRef.current = recargasDoDisco
    if (!store || !repo || timerAutosaveRef.current !== null) return
    const storeAtual = store
    let ativo = true
    repo
      .lerCanvasDoc(caminho)
      .then((doc) => {
        if (!ativo || !doc.documento) return
        storeAtual.mergeRemoteChanges(() => {
          loadSnapshot(storeAtual, doc.documento as Partial<TLEditorSnapshot>)
        })
      })
      .catch((e) => console.warn('Canvas: o cofre mudou no disco mas não deu para reler:', e))
    return () => {
      ativo = false
    }
  }, [recargasDoDisco, store, repo, caminho])

  async function exportar(formato: 'png' | 'svg') {
    const editor = editorRef.current
    if (!editor || !repo) return
    const selecionados = editor.getSelectedShapeIds()
    const ids = selecionados.length > 0 ? selecionados : [...editor.getCurrentPageShapeIds()]
    if (ids.length === 0) return

    const destino = await save({
      title: `Exportar ${formato.toUpperCase()}`,
      defaultPath: `${slugify(nome)}.${formato}`,
      filters: [{ name: formato.toUpperCase(), extensions: [formato] }],
    })
    if (!destino) return

    try {
      if (formato === 'png') {
        const { blob } = await editor.toImage(ids, { format: 'png', background: true, scale: 2, darkMode: true })
        const buf = new Uint8Array(await blob.arrayBuffer())
        await repo.escreverBinarioAbsoluto(destino, uint8ParaBase64(buf))
      } else {
        const svg = await editor.getSvgString(ids, { background: true, darkMode: true })
        if (!svg) throw new Error('não foi possível gerar o SVG')
        await repo.escreverTextoAbsoluto(destino, svg.svg)
      }
    } catch (e) {
      await message(`Falha ao exportar: ${e}`, { title: 'Grimório', kind: 'error' })
    }
  }

  if (erro) {
    return (
      <div className="canvas-erro">
        Não foi possível abrir "{nome}": arquivo com erro.
        <br />
        <code>{erro}</code>
      </div>
    )
  }
  if (!store) return <div className="canvas-carregando">Carregando…</div>

  return (
    <div
      className="canvas-wrap"
      // Fase capture: o canvas interno do tldraw chama preventDefault +
      // stopPropagation no drop, então handlers de bubble aqui nunca disparam.
      // O guard pelo MIME type deixa drags alheios passarem intactos pro tldraw.
      onDragOverCapture={(e) => {
        if (
          e.dataTransfer.types.includes(MIME_IMAGEM) ||
          DROPS_DE_ENTIDADE.some((d) => e.dataTransfer.types.includes(d.mime))
        ) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onDropCapture={(e) => {
        // imagem arrastada de uma nota: referencia o mesmo arquivo do cofre (sem copiar)
        const relImg = e.dataTransfer.getData(MIME_IMAGEM)
        if (relImg) {
          const editor = editorRef.current
          if (editor && vaultPath) {
            e.preventDefault()
            e.stopPropagation()
            soltarImagemNoMapa(editor, vaultPath, relImg, e.clientX, e.clientY)
              .catch((err) => console.error('Falha ao soltar imagem no mapa:', err))
          }
          return
        }
        for (const { mime, tipo, propId } of DROPS_DE_ENTIDADE) {
          const id = e.dataTransfer.getData(mime)
          if (!id) continue
          const editor = editorRef.current
          if (!editor) return
          e.preventDefault()
          e.stopPropagation()
          const ponto = editor.screenToPage({ x: e.clientX, y: e.clientY })
          // Batch: card + setas viram UM passo de undo (Ctrl+Z desfaz o drop inteiro).
          editor.run(() => {
            editor.createShape({
              id: createShapeId(),
              type: tipo,
              x: ponto.x - CARD_LARGURA_PADRAO / 2,
              y: ponto.y - CARD_ALTURA_PADRAO / 2,
              props: { [propId]: id },
            })
            const cards = cardsPorEntidade(editor)
            // Relações rotuladas ANTES da hierarquia: existeSetaEntre é agnóstico a rótulo,
            // então quem cria primeiro ocupa o par — o rótulo explícito tem prioridade.
            ligarRelacoesNoCanvas(editor, cards, useApp.getState().vinculos, id)
            if (tipo === 'cenario-card') {
              const raiz = useApp.getState().tree?.cenarios
              if (raiz) ligarCenarioNoCanvas(editor, cards, raiz, id)
            }
          })
          return
        }
      }}
    >
      <div className="canvas-toolbar">
        <span className="canvas-titulo">{nome}</span>
        <button onClick={() => void exportar('png')}>Exportar PNG</button>
        <button onClick={() => void exportar('svg')}>Exportar SVG</button>
      </div>
      <Tldraw
        store={store}
        shapeUtils={shapeUtilsCustom}
        onMount={(editor) => {
          registrarEditor(editor)
          editorRef.current = editor
          editor.user.updateUserPreferences({ colorScheme: 'dark' })
          // espaço com um card de personagem selecionado abre o cartão completo
          // (duplo clique no card só expande/recolhe a descrição). Fase capture:
          // dispara antes dos atalhos do tldraw (que usam espaço para o pan).
          const aoTeclar = (e: KeyboardEvent) => {
            // Ctrl/Cmd+C com um card selecionado que tem retrato: copia a IMAGEM (não o
            // shape). Baseia-se na seleção nativa do tldraw — clicar no card já seleciona;
            // o clique na <img> não é confiável dentro do canvas (o tldraw captura o ponteiro).
            if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
              if (editor.getEditingShapeId()) return // editando texto: deixa copiar o texto
              const { personagens, cenarios, itens, vaultPath: vp } = useApp.getState()
              // TLShape → ShapeMinimo: só lemos type/props; o cast evita acoplar o helper ao tldraw
              const rel = relRetratoDoCard(
                editor.getOnlySelectedShape() as unknown as ShapeMinimo | null,
                personagens,
                cenarios,
                itens,
              )
              if (!rel || !vp) return // sem imagem: deixa o Ctrl+C nativo do tldraw agir
              e.preventDefault()
              e.stopPropagation()
              copiarImagemParaClipboard(convertFileSrc(`${vp}/${rel}`))
                .then(() => {
                  setCopiaOk(true)
                  setTimeout(() => setCopiaOk(false), 1500)
                })
                .catch((err) => {
                  console.error('Falha ao copiar imagem:', err)
                  setCopiaErro(String(err))
                  setTimeout(() => setCopiaErro(null), 4000)
                })
              return
            }
            if (e.key !== ' ' || e.repeat) return
            if (editor.getEditingShapeId()) return
            const alvo = e.target as HTMLElement | null
            if (alvo?.closest('input, textarea, [contenteditable="true"]')) return
            const shape = editor.getOnlySelectedShape()
            if (!shape) return
            if (shape.type === 'character-card') {
              e.preventDefault()
              e.stopPropagation()
              useApp.getState().abrirPerfil((shape as CharacterCardShapeType).props.personagemId)
            } else if (shape.type === 'cenario-card') {
              e.preventDefault()
              e.stopPropagation()
              useApp.getState().abrirCenario((shape as CenarioCardShapeType).props.cenarioId)
            } else if (shape.type === 'item-card') {
              e.preventDefault()
              e.stopPropagation()
              useApp.getState().abrirItem((shape as ItemCardShapeType).props.itemId)
            } else if (shape.type === 'image') {
              e.preventDefault()
              e.stopPropagation()
              void transformarImagemEmEntidade(editor, shape as TLImageShape)
            }
          }
          const container = editor.getContainer()
          container.addEventListener('keydown', aoTeclar, { capture: true })
          return () => {
            desregistrarEditor(editor)
            container.removeEventListener('keydown', aoTeclar, { capture: true })
          }
        }}
      />
      <div className="canvas-banners">
        {salvandoErro && (
          <div className="canvas-salvar-erro">Falha ao salvar: {salvandoErro}</div>
        )}
        {copiaOk && <div className="canvas-copia-ok">Imagem copiada</div>}
        {copiaErro && <div className="canvas-salvar-erro">Falha ao copiar: {copiaErro}</div>}
      </div>
    </div>
  )
}
