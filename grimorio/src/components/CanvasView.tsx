import { useEffect, useRef, useState } from 'react'
import {
  Tldraw,
  createShapeId,
  createTLStore,
  defaultShapeUtils,
  getSnapshot,
  loadSnapshot,
  uniqueId,
  type Editor,
  type TLAssetStore,
  type TLEditorSnapshot,
  type TLStore,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { convertFileSrc } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import type { VaultRepo } from '../lib/vaultRepo'
import { slugify } from '../lib/slug'
import {
  CARD_ALTURA_PADRAO,
  CARD_LARGURA_PADRAO,
  CharacterCardShapeUtil,
} from './CharacterCardShape'

const AUTOSAVE_DEBOUNCE_MS = 1000

// Constantes em nível de módulo: arrays recriados a cada render remontam o editor.
// `shapeUtilsCustom` vai na prop `shapeUtils` do <Tldraw> (que soma aos defaults);
// o store precisa do schema completo (defaults + customizados).
const shapeUtilsCustom = [CharacterCardShapeUtil]
const shapeUtilsDoStore = [...defaultShapeUtils, CharacterCardShapeUtil]

const BASE64_CHUNK = 8192

/** Converte bytes para base64 em blocos (evita estourar a pilha com spread gigante). */
function uint8ParaBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(bin)
}

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
      return { src: convertFileSrc(`${vaultPath}/${rel}`), meta: { rel } }
    },
    resolve(asset) {
      const rel = (asset.meta as { rel?: string } | undefined)?.rel
      return rel ? convertFileSrc(`${vaultPath}/${rel}`) : asset.props.src
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

export function CanvasView({ caminho, nome }: { caminho: string; nome: string }) {
  const repo = useApp((s) => s.repo)
  const vaultPath = useApp((s) => s.vaultPath)
  const [store, setStore] = useState<TLStore | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvandoErro, setSalvandoErro] = useState<string | null>(null)
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
        if (e.dataTransfer.types.includes('application/x-grimorio-personagem')) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onDropCapture={(e) => {
        const id = e.dataTransfer.getData('application/x-grimorio-personagem')
        const editor = editorRef.current
        if (!id || !editor) return
        e.preventDefault()
        e.stopPropagation()
        const ponto = editor.screenToPage({ x: e.clientX, y: e.clientY })
        editor.createShape({
          id: createShapeId(),
          type: 'character-card',
          x: ponto.x - CARD_LARGURA_PADRAO / 2,
          y: ponto.y - CARD_ALTURA_PADRAO / 2,
          props: { personagemId: id },
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
          editorRef.current = editor
          editor.user.updateUserPreferences({ colorScheme: 'dark' })
        }}
      />
      {salvandoErro && (
        <div className="canvas-salvar-erro">Falha ao salvar: {salvandoErro}</div>
      )}
    </div>
  )
}
