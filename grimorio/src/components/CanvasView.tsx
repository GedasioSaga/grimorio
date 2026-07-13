import { useEffect, useRef, useState } from 'react'
import {
  Tldraw,
  createTLStore,
  getSnapshot,
  loadSnapshot,
  type Editor,
  type TLEditorSnapshot,
  type TLStore,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { useApp } from '../state/store'

const AUTOSAVE_DEBOUNCE_MS = 1000

/**
 * Ponto único de criação do store do tldraw.
 * Tasks futuras (shapes customizados, asset store) adicionam opções aqui.
 */
function criarStoreCanvas(): TLStore {
  return createTLStore()
}

interface MetaDoc {
  id: string
  nome: string
  criadoEm: string
}

export function CanvasView({ caminho, nome }: { caminho: string; nome: string }) {
  const repo = useApp((s) => s.repo)
  const [store, setStore] = useState<TLStore | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvandoErro, setSalvandoErro] = useState<string | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const docRef = useRef<MetaDoc | null>(null)

  // carrega o snapshot do arquivo e monta o store
  useEffect(() => {
    let ativo = true
    async function carregar() {
      if (!repo) return
      try {
        const doc = await repo.lerCanvasDoc(caminho)
        if (!ativo) return
        docRef.current = { id: doc.id, nome: doc.nome, criadoEm: doc.criadoEm }
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
      const meta = docRef.current
      if (!meta) return
      const { document, session } = getSnapshot(storeAtual)
      try {
        await repoAtual.salvarCanvasDoc(caminho, {
          id: meta.id,
          nome: meta.nome,
          criadoEm: meta.criadoEm,
          modificadoEm: '', // salvarCanvasDoc sobrescreve
          documento: { document, session },
        })
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
        void salvar()
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
    <div className="canvas-wrap">
      <Tldraw
        store={store}
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
