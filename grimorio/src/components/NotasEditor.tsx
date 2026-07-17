import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { open, message } from '@tauri-apps/plugin-dialog'
import type { NotebookRepo } from '../lib/notebookRepo'
import { ImagemCofre } from './ImagemCofre'
import { ParagrafoFinal } from './paragrafoFinal'
import { uint8ParaBase64 } from '../lib/bin'
import { useApp } from '../state/store'
import { AcoesIA, type AcaoIA, type ModoInserir } from './AcoesIA'
import { SYSTEM_ESCRITOR, promptEstruturar, REGRA_MARCADORES } from '../lib/promptsIA'
import { markdownParaHtml } from '../lib/markdownHtml'
import { extrairImagens, reinserirImagens } from '../lib/imagensMarcador'
import { htmlParaTexto } from '../lib/htmlTexto'
import { contextoDoCaminho } from '../lib/contextoIA'

const AUTOSAVE_MS = 800

/** Ação específica da escrita (curta/longa/melhorar/perguntar já vêm do próprio AcoesIA). */
const ACOES_IA_ESCRITA: AcaoIA[] = [
  {
    rotulo: 'Estruturar',
    prompt: promptEstruturar(),
    abaDestino: 'corpo',
    rotuloDestino: 'esta página',
  },
]

function idImagem(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

/** Carregador: busca o corpo da página e só então monta o editor (keyed pelo slug). */
export function NotasEditor({ repo, slug, cadernoDirRel }: { repo: NotebookRepo; slug: string; cadernoDirRel: string }) {
  const [corpo, setCorpo] = useState<string | null>(null)
  const [titulo, setTitulo] = useState('')
  const [erroCarga, setErroCarga] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    setCorpo(null); setErroCarga(null)
    repo.lerPagina(slug)
      .then((p) => { if (ativo) { setCorpo(p.corpo ?? ''); setTitulo(p.titulo ?? '') } })
      .catch((e) => { if (ativo) setErroCarga(String(e)) })
    return () => { ativo = false }
  }, [repo, slug])

  if (erroCarga) return <div className="notas-erro">Não foi possível abrir esta página.<br /><code>{erroCarga}</code></div>
  if (corpo === null) return <div className="notas-carregando">Carregando…</div>
  return <EditorInterno key={slug} repo={repo} slug={slug} corpoInicial={corpo} titulo={titulo} cadernoDirRel={cadernoDirRel} />
}

function EditorInterno({ repo, slug, corpoInicial, titulo, cadernoDirRel }: {
  repo: NotebookRepo; slug: string; corpoInicial: string; titulo: string; cadernoDirRel: string
}) {
  const vaultPath = useApp((s) => s.vaultPath)
  const [salvarErro, setSalvarErro] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const htmlRef = useRef<string>(corpoInicial)
  // imagens extraídas no momento do envio à IA: reinseridas depois pelos seus marcadores
  const imagensSnapshotRef = useRef<string[]>([])

  const editor = useEditor({
    extensions: [StarterKit, ImagemCofre, ParagrafoFinal],
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

  /** Aplica o texto da IA: substitui a página (reinserindo imagens) ou anexa no fim. */
  function aplicarDaIA(textoCru: string, modo: ModoInserir) {
    if (!editor) return
    if (modo === 'substituir') {
      const html = reinserirImagens(markdownParaHtml(textoCru), imagensSnapshotRef.current)
      editor.commands.setContent(html)
    } else {
      // adicionar: a página já tem suas imagens — não reinsere (evita duplicar);
      // limpa marcadores órfãos que a IA possa ter ecoado
      const html = markdownParaHtml(textoCru.replace(/\{\{IMG:\d+\}\}/g, '').trim())
      editor.chain().focus('end').insertContent(html).run()
    }
    htmlRef.current = editor.getHTML()
    agendarSalvar()
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
      await message(`Falha ao inserir imagem: ${e}`, { title: 'Grimório', kind: 'error' })
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
      await message(`Falha ao colar imagem: ${e}`, { title: 'Grimório', kind: 'error' })
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
        <span className="notas-toolbar-ia">
          <AcoesIA
            system={SYSTEM_ESCRITOR}
            abaAtual="corpo"
            rotuloAbaAtual={titulo || 'esta página'}
            abaEhTexto
            acoes={ACOES_IA_ESCRITA}
            sufixoPrompt={REGRA_MARCADORES}
            snapshot={() => {
              const { html, imagens } = extrairImagens(htmlRef.current)
              imagensSnapshotRef.current = imagens
              const s = useApp.getState()
              return {
                dadosBase: `# Página de escrita\nTítulo: ${titulo}`,
                textoAtual: htmlParaTexto(html),
                contexto: s.tree ? contextoDoCaminho(cadernoDirRel, { ...s, tree: s.tree }) : '',
              }
            }}
            conteudoDoDestino={() => htmlParaTexto(htmlRef.current)}
            onInserir={(_dest, textoCru, modo) => aplicarDaIA(textoCru, modo)}
          />
        </span>
      </div>
      <EditorContent editor={editor} className="notas-corpo" />
      {salvarErro && <div className="notas-salvar-erro">Falha ao salvar: {salvarErro}</div>}
    </div>
  )
}
