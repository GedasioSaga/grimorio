import { useEffect, useRef, useState } from 'react'
import {
  Tldraw,
  createShapeId,
  createTLStore,
  defaultShapeUtils,
  getSnapshot,
  loadSnapshot,
  type Editor,
  type TLEditorSnapshot,
  type TLStore,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { useApp } from '../state/store'
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

/**
 * Ponto único de criação do store do tldraw.
 * Tasks futuras (asset store) adicionam opções aqui.
 */
function criarStoreCanvas(): TLStore {
  return createTLStore({ shapeUtils: shapeUtilsDoStore })
}

export function CanvasView({ caminho, nome }: { caminho: string; nome: string }) {
  const repo = useApp((s) => s.repo)
  const [store, setStore] = useState<TLStore | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvandoErro, setSalvandoErro] = useState<string | null>(null)
  const editorRef = useRef<Editor | null>(null)

  // carrega o snapshot do arquivo e monta o store
  useEffect(() => {
    let ativo = true
    async function carregar() {
      if (!repo) return
      try {
        const doc = await repo.lerCanvasDoc(caminho)
        if (!ativo) return
        const s = criarStoreCanvas()
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
  }, [repo, caminho])

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
