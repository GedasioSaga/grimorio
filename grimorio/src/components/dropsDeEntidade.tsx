/**
 * Drag/drop de entidades e imagens do cofre para dentro de uma superfície tldraw:
 * detecta o MIME arrastado, cria o shape correspondente e delega a ligação de
 * cards a `ligacoesCanvas.ts`.
 */
import type React from 'react'
import { AssetRecordType, createShapeId, type Editor, type TLShape, type TLShapePartial } from 'tldraw'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { caminhoAbsolutoImagem } from '../lib/caminhos'
import { mimeDaImagem } from '../lib/bin'
import { CARD_ALTURA_PADRAO, CARD_LARGURA_PADRAO } from './CharacterCardShape'
import { MIME_CENARIO } from './CenariosSoltos'
import { MIME_ITEM } from './ItensSoltos'
import { cardsPorEntidade, ligarCenarioNoCanvas, ligarRelacoesNoCanvas } from './ligacoesCanvas'
import { ehTipoSala } from '../lib/tiposSala'
import { ITEM_MAPA_ALTURA_PADRAO, ITEM_MAPA_LARGURA_PADRAO } from './ItemMapaShape'

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

/**
 * Sala do mapa embaixo do ponto de solta, se houver — retangular OU em polígono, porque
 * "solto o cenário em cima do cômodo e eles se ligam" não pode depender do formato do
 * cômodo (ver `lib/tiposSala.ts`). `getShapesAtPoint` devolve as formas com a mais ao topo
 * primeiro e já filtra as escondidas, então a primeira sala da lista é a que o usuário está
 * vendo sob o cursor.
 *
 * Sala TRAVADA (por si ou pela camada) não conta. `editor.updateShape` recusa shape travado
 * **em silêncio** (`@tldraw/editor/src/lib/editor/Editor.ts`, o laço faz `continue` sem erro —
 * é o mesmo comportamento que o `HANDOFF.md:54` já registra para `deleteShapes`). Devolver a
 * sala travada aqui faria o drop não criar vínculo E não criar card: sumiria sem explicação.
 * Devolvendo `undefined`, o drop cai no caminho normal e vira card, que é visível e desfazível.
 */
function salaSobPonto(editor: Editor, ponto: { x: number; y: number }): TLShape | undefined {
  const sala = editor.getShapesAtPoint(ponto, { hitInside: true }).find((s) => ehTipoSala(s.type))
  return sala && !editor.isShapeOrAncestorLocked(sala) ? sala : undefined
}

/** Handlers de drag/drop para superfícies tldraw que aceitam entidades e imagens do cofre. */
export function criarHandlersDeDrop(
  editorRef: React.RefObject<Editor | null>,
  vaultPath: string | null,
  // Item solto no MAPA vira miniatura (pino), não o card grande — pedido explícito do
  // usuário: "isso só na parte de mapa, o canvas continuaria normal". `MapaView.tsx`
  // passa `true`; `CanvasView.tsx` não passa nada (mantém o `item-card` de sempre).
  opcoes: { itemViraMiniatura?: boolean } = {},
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

        // Cenário solto EM CIMA de uma sala liga os dois em vez de criar um card —
        // soltar em área vazia continua criando card normalmente (ramo abaixo).
        if (mime === MIME_CENARIO) {
          const sala = salaSobPonto(editor, ponto)
          if (sala) {
            editor.updateShape({ id: sala.id, type: sala.type, props: { cenarioId: id } } as TLShapePartial)
            return
          }
        }

        // Item solto no MAPA: pino pequeno (`item-mapa`), não o card grande. Ramo próprio
        // e SEM passar pelo `ligarRelacoesNoCanvas` abaixo — `cardsPorEntidade` só
        // reconhece 'item-card' (ver ligacoesCanvas.ts), então um `item-mapa` nunca
        // ganharia seta de relação mesmo se passasse por ali; melhor não fingir que tenta.
        if (mime === MIME_ITEM && opcoes.itemViraMiniatura) {
          editor.createShape({
            id: createShapeId(),
            type: 'item-mapa',
            x: ponto.x - ITEM_MAPA_LARGURA_PADRAO / 2,
            y: ponto.y - ITEM_MAPA_ALTURA_PADRAO / 2,
            props: { itemId: id },
          })
          return
        }

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
