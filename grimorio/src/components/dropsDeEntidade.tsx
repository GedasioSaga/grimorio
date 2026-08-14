import type React from 'react'
import { AssetRecordType, createShapeId, toRichText, type Editor, type TLShapeId } from 'tldraw'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import type { PastaCenarioNode, Vinculo } from '../lib/types'
import { caminhoAbsolutoImagem } from '../lib/caminhos'
import { mimeDaImagem } from '../lib/bin'
import { CARD_ALTURA_PADRAO, CARD_LARGURA_PADRAO, type CharacterCardShapeType } from './CharacterCardShape'
import { type CenarioCardShapeType } from './CenarioCardShape'
import { type ItemCardShapeType } from './ItemCardShape'
import { MIME_CENARIO } from './CenariosSoltos'
import { MIME_ITEM } from './ItensSoltos'
import { paresParaLigar } from '../lib/ligacaoCenario'
import { agruparPorPar } from '../lib/vinculos'

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
export function cardsPorEntidade(editor: Editor): Map<string, TLShapeId[]> {
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
export function ligarCenarioNoCanvas(
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
export function ligarRelacoesNoCanvas(
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

/** Handlers de drag/drop para superfícies tldraw que aceitam entidades e imagens do cofre. */
export function criarHandlersDeDrop(
  editorRef: React.RefObject<Editor | null>,
  vaultPath: string | null,
): { aoArrastarSobre(e: React.DragEvent): void; aoSoltar(e: React.DragEvent): void } {
  return {
    // Fase capture: o canvas interno do tldraw chama preventDefault +
    // stopPropagation no drop, então handlers de bubble aqui nunca disparam.
    // O guard pelo MIME type deixa drags alheios passarem intactos pro tldraw.
    aoArrastarSobre(e) {
      if (
        e.dataTransfer.types.includes(MIME_IMAGEM) ||
        DROPS_DE_ENTIDADE.some((d) => e.dataTransfer.types.includes(d.mime))
      ) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    aoSoltar(e) {
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
    },
  }
}
