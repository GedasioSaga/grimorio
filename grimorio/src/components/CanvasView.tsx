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
  type TLShapeId,
  type TLStore,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { convertFileSrc } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
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
import { MIME_CENARIO } from './CenariosSoltos'
import { relRetratoDoCard, type ShapeMinimo } from '../lib/copiaImagemCard'
import { copiarImagemParaClipboard } from '../lib/copiarImagem'
import { paresParaLigar } from '../lib/ligacaoCenario'
import { agruparPorPar } from '../lib/vinculos'
import { registrarEditor, desregistrarEditor } from '../lib/canvasAtivo'

const AUTOSAVE_DEBOUNCE_MS = 1000

// Constantes em nível de módulo: arrays recriados a cada render remontam o editor.
// `shapeUtilsCustom` vai na prop `shapeUtils` do <Tldraw> (que soma aos defaults);
// o store precisa do schema completo (defaults + customizados).
const shapeUtilsCustom = [CharacterCardShapeUtil, CenarioCardShapeUtil]
const shapeUtilsDoStore = [...defaultShapeUtils, CharacterCardShapeUtil, CenarioCardShapeUtil]

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

/** Shapes de card por id de entidade. Supõe que UUIDs de personagem e cenário não colidem. */
function cardsPorEntidade(editor: Editor): Map<string, TLShapeId[]> {
  const mapa = new Map<string, TLShapeId[]>()
  for (const s of editor.getCurrentPageShapes()) {
    let eid: string | null = null
    if (s.type === 'cenario-card') eid = (s as CenarioCardShapeType).props.cenarioId
    else if (s.type === 'character-card') eid = (s as CharacterCardShapeType).props.personagemId
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

export function CanvasView({ caminho, nome }: { caminho: string; nome: string }) {
  const repo = useApp((s) => s.repo)
  const vaultPath = useApp((s) => s.vaultPath)
  const [store, setStore] = useState<TLStore | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvandoErro, setSalvandoErro] = useState<string | null>(null)
  const [copiaOk, setCopiaOk] = useState(false)
  const [copiaErro, setCopiaErro] = useState<string | null>(null)
  const editorRef = useRef<Editor | null>(null)

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
    let timer: ReturnType<typeof setTimeout> | null = null

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
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          void salvar()
        }, AUTOSAVE_DEBOUNCE_MS)
      },
      { scope: 'document', source: 'user' },
    )

    return () => {
      unlisten()
      if (timer) {
        // havia gravação pendente: cancela o debounce e grava já.
        // VaultRepo serializa escritas por caminho, então fire-and-forget é seguro.
        clearTimeout(timer)
        timer = null
        salvar().catch((e) => console.error('Falha no save final do canvas:', e))
      }
    }
  }, [store, repo, caminho])

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
      alert(`Falha ao exportar: ${e}`)
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
          e.dataTransfer.types.includes('application/x-grimorio-personagem') ||
          e.dataTransfer.types.includes(MIME_CENARIO) ||
          e.dataTransfer.types.includes('application/x-grimorio-imagem')
        ) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onDropCapture={(e) => {
        // imagem arrastada de uma nota: referencia o mesmo arquivo do cofre (sem copiar)
        const relImg = e.dataTransfer.getData('application/x-grimorio-imagem')
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
        const cenarioId = e.dataTransfer.getData(MIME_CENARIO)
        if (cenarioId) {
          const editorAtual = editorRef.current
          if (editorAtual) {
            e.preventDefault()
            e.stopPropagation()
            const ponto = editorAtual.screenToPage({ x: e.clientX, y: e.clientY })
            // Batch: card + setas viram UM passo de undo (Ctrl+Z desfaz o drop inteiro).
            editorAtual.run(() => {
              editorAtual.createShape({
                id: createShapeId(),
                type: 'cenario-card',
                x: ponto.x - CARD_LARGURA_PADRAO / 2,
                y: ponto.y - CARD_ALTURA_PADRAO / 2,
                props: { cenarioId },
              })
              const cards = cardsPorEntidade(editorAtual)
              // Relações rotuladas ANTES da hierarquia: existeSetaEntre é agnóstico a rótulo,
              // então quem cria primeiro ocupa o par — o rótulo explícito tem prioridade.
              ligarRelacoesNoCanvas(editorAtual, cards, useApp.getState().vinculos, cenarioId)
              const raiz = useApp.getState().tree?.cenarios
              if (raiz) ligarCenarioNoCanvas(editorAtual, cards, raiz, cenarioId)
            })
          }
          return
        }
        const id = e.dataTransfer.getData('application/x-grimorio-personagem')
        const editor = editorRef.current
        if (!id || !editor) return
        e.preventDefault()
        e.stopPropagation()
        const ponto = editor.screenToPage({ x: e.clientX, y: e.clientY })
        // Batch: card + setas de relação viram UM passo de undo (Ctrl+Z desfaz o drop inteiro).
        editor.run(() => {
          editor.createShape({
            id: createShapeId(),
            type: 'character-card',
            x: ponto.x - CARD_LARGURA_PADRAO / 2,
            y: ponto.y - CARD_ALTURA_PADRAO / 2,
            props: { personagemId: id },
          })
          ligarRelacoesNoCanvas(editor, cardsPorEntidade(editor), useApp.getState().vinculos, id)
        })
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
              const { personagens, cenarios, vaultPath: vp } = useApp.getState()
              // TLShape → ShapeMinimo: só lemos type/props; o cast evita acoplar o helper ao tldraw
              const rel = relRetratoDoCard(
                editor.getOnlySelectedShape() as unknown as ShapeMinimo | null,
                personagens,
                cenarios,
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
