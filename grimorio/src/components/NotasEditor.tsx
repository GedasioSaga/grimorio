import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { open } from '@tauri-apps/plugin-dialog'
import type { NotebookRepo } from '../lib/notebookRepo'
import { ImagemCofre } from './ImagemCofre'
import { uint8ParaBase64 } from '../lib/bin'
import { useApp } from '../state/store'

const AUTOSAVE_MS = 800

function idImagem(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

/** Carregador: busca o corpo da página e só então monta o editor (keyed pelo slug). */
export function NotasEditor({ repo, slug }: { repo: NotebookRepo; slug: string }) {
  const [corpo, setCorpo] = useState<string | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    setCorpo(null); setErroCarga(null)
    repo.lerPagina(slug)
      .then((p) => { if (ativo) setCorpo(p.corpo ?? '') })
      .catch((e) => { if (ativo) setErroCarga(String(e)) })
    return () => { ativo = false }
  }, [repo, slug])

  if (erroCarga) return <div className="notas-erro">Não foi possível abrir esta página.<br /><code>{erroCarga}</code></div>
  if (corpo === null) return <div className="notas-carregando">Carregando…</div>
  return <EditorInterno key={slug} repo={repo} slug={slug} corpoInicial={corpo} />
}

function EditorInterno({ repo, slug, corpoInicial }: { repo: NotebookRepo; slug: string; corpoInicial: string }) {
  const vaultPath = useApp((s) => s.vaultPath)
  const [salvarErro, setSalvarErro] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const htmlRef = useRef<string>(corpoInicial)

  const editor = useEditor({
    extensions: [StarterKit, ImagemCofre],
    content: corpoInicial,
    editorProps: {
      // colar imagem (Ctrl+V): grava no cofre e insere como imagem portável
      handlePaste(_view, event) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              event.preventDefault()
              void inserirImagemDeArquivo(file)
              return true
            }
          }
        }
        return false
      },
    },
    onUpdate({ editor }) {
      htmlRef.current = editor.getHTML()
      agendarSalvar()
    },
  })

  const ativo = useEditorState({
    editor,
    selector: ({ editor }) => editor ? {
      bold: editor.isActive('bold'), italic: editor.isActive('italic'),
      h1: editor.isActive('heading', { level: 1 }), h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bullet: editor.isActive('bulletList'), ordered: editor.isActive('orderedList'),
      quote: editor.isActive('blockquote'),
    } : null,
  })

  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void salvar() } }, [])

  function agendarSalvar() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { timer.current = null; void salvar() }, AUTOSAVE_MS)
  }

  async function salvar(): Promise<void> {
    try {
      await repo.salvarCorpo(slug, htmlRef.current)
      setSalvarErro(null)
    } catch (e) {
      console.error('Falha ao salvar página:', e)
      setSalvarErro(String(e))
    }
  }

  async function inserirImagem() {
    if (!editor || !vaultPath) return
    try {
      const arquivo = await open({
        title: 'Inserir imagem',
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      })
      if (typeof arquivo !== 'string') return
      const nome = arquivo.split(/[\\/]/).pop() ?? ''
      const ext = (nome.includes('.') ? nome.split('.').pop()! : 'png').toLowerCase()
      const rel = `imagens-notas/${idImagem()}.${ext}`
      // grava a imagem no cofre reusando o VaultRepo do store (copiarParaCofre já existe na v1)
      const repoCofre = useApp.getState().repo
      if (!repoCofre) throw new Error('cofre não carregado')
      await repoCofre.copiarParaCofre(arquivo, rel)
      editor.chain().focus().insertContent({ type: 'image', attrs: { rel } }).run()
    } catch (e) {
      alert(`Falha ao inserir imagem: ${e}`)
    }
  }

  /** Grava uma imagem vinda do clipboard (Ctrl+V) no cofre e insere na página. */
  async function inserirImagemDeArquivo(file: File) {
    if (!editor) return
    try {
      const repoCofre = useApp.getState().repo
      if (!repoCofre) throw new Error('cofre não carregado')
      const subtipo = (file.type.split('/')[1] || 'png').toLowerCase()
      const ext = subtipo === 'jpeg' ? 'jpg' : subtipo
      const rel = `imagens-notas/${idImagem()}.${ext}`
      const bytes = new Uint8Array(await file.arrayBuffer())
      await repoCofre.escreverBinario(rel, uint8ParaBase64(bytes))
      editor.chain().focus().insertContent({ type: 'image', attrs: { rel } }).run()
    } catch (e) {
      alert(`Falha ao colar imagem: ${e}`)
    }
  }

  if (!editor) return <div className="notas-carregando">Carregando…</div>

  return (
    <div className="notas">
      <div className="notas-toolbar">
        <button className={ativo?.bold ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
        <button className={ativo?.italic ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
        <span className="sep" />
        <button className={ativo?.h1 ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
        <button className={ativo?.h2 ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button className={ativo?.h3 ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
        <span className="sep" />
        <button className={ativo?.bullet ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleBulletList().run()}>• Lista</button>
        <button className={ativo?.ordered ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. Lista</button>
        <button className={ativo?.quote ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</button>
        <button onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</button>
        <span className="sep" />
        <button onClick={() => void inserirImagem()}>🖼 Imagem</button>
      </div>
      <EditorContent editor={editor} className="notas-corpo" />
      {salvarErro && <div className="notas-salvar-erro">Falha ao salvar: {salvarErro}</div>}
    </div>
  )
}
